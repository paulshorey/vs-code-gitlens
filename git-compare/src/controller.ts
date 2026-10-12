import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type {
  ChangedFile,
  CompareArgs,
  Comparison,
  Endpoint,
  Repository,
  SavedComparison,
} from './types.js';
import { endpointFromInput, matchesFilter } from './types.js';
import { ComparisonService, safePath } from './git/comparisons.js';
import { RevisionFileSystem } from './git/revisionFileSystem.js';
import { configureGit, pickEndpoint, pickRepository } from './ui/pickers.js';
import { CompareTree, type ComparisonNode, type FileNode, type TreeNode } from './ui/tree.js';

const storageKey = 'gitcompare.comparisons.v1';

export interface ComparisonApi {
  getComparisons(): readonly SavedComparison[];
  getChangedFiles(id: string): readonly ChangedFile[];
}

export class CompareController implements vscode.Disposable, ComparisonApi {
  private comparisons: Comparison[] = [];
  private readonly disposables: vscode.Disposable[] = [];
  private readonly watchers = new Map<string, vscode.Disposable[]>();
  private readonly refreshes = new Map<string, Promise<void>>();
  private readonly tree: CompareTree;
  private readonly view: vscode.TreeView<TreeNode>;
  private readonly revisions: RevisionFileSystem;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private saveChain: PromiseLike<void> = Promise.resolve();
  readonly ready: Promise<void>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly service: ComparisonService,
    private readonly output: vscode.OutputChannel,
  ) {
    this.tree = new CompareTree(() => this.comparisons);
    this.view = vscode.window.createTreeView('gitcompare.comparisons', {
      treeDataProvider: this.tree,
      showCollapseAll: true,
    });
    this.revisions = new RevisionFileSystem(service);
    this.disposables.push(
      this.tree,
      this.view,
      this.revisions,
      vscode.workspace.onDidSaveTextDocument(() => this.scheduleRefresh()),
      vscode.window.onDidChangeWindowState((event) => {
        if (event.focused) this.scheduleRefresh();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration('gitcompare')) return;
        this.tree.refresh();
        if (event.affectsConfiguration('gitcompare.gitPath'))
          void this.configure().then(() => this.refresh());
        else if (event.affectsConfiguration('gitcompare.includeUntracked')) void this.refresh();
        if (event.affectsConfiguration('gitcompare.keepComparisons')) void this.save();
      }),
    );
    this.registerCommands();
    this.ready = this.initialize();
  }

  private command(id: string, handler: (...args: any[]) => unknown): void {
    this.disposables.push(
      vscode.commands.registerCommand(`gitcompare.${id}`, async (...args: unknown[]) => {
        try {
          return await handler(...args);
        } catch (error) {
          await this.report(error);
          return undefined;
        }
      }),
    );
  }

  private registerCommands(): void {
    this.command('focus', () => vscode.commands.executeCommand('gitcompare.comparisons.focus'));
    this.command('compare', (args?: CompareArgs) => this.compare(args));
    this.command('compareFolder', async (uri?: vscode.Uri) => {
      if (!uri)
        uri = (
          await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Compare This Folder',
          })
        )?.[0];
      if (uri) await this.compare(undefined, uri);
    });
    this.command('refresh', () => this.refresh());
    this.command('swap', (node?: ComparisonNode) => this.swap(node));
    this.command('edit', (node?: ComparisonNode) => this.edit(node));
    this.command('pin', (node?: ComparisonNode) => this.setPinned(node, true));
    this.command('unpin', (node?: ComparisonNode) => this.setPinned(node, false));
    this.command('remove', (node?: ComparisonNode) => this.remove(node));
    this.command('clear', () => this.clear());
    this.command('filter', (node?: ComparisonNode) => this.filter(node));
    this.command('layout', async () => {
      const config = vscode.workspace.getConfiguration('gitcompare');
      await config.update(
        'files.layout',
        config.get('files.layout', 'tree') === 'tree' ? 'list' : 'tree',
        vscode.ConfigurationTarget.Global,
      );
    });
    this.command('openDiff', (node?: FileNode) => this.openDiff(node));
    this.command('openFile', async (node?: FileNode) => {
      if (node?.kind !== 'file') return;
      await vscode.window.showTextDocument(
        vscode.Uri.file(
          safePath(
            node.comparison.repository.path,
            node.file.targetPath ?? node.file.basePath ?? node.file.path,
          ),
        ),
        { preview: false },
      );
    });
    this.command('copyPath', (node?: FileNode) =>
      node?.kind === 'file' ? vscode.env.clipboard.writeText(node.file.path) : undefined,
    );
    this.command('openAll', (node?: ComparisonNode) => this.openAll(node));
    this.command('showOutput', () => this.output.show());
  }

  private async configure(): Promise<void> {
    const api = await configureGit(this.service);
    if (this.disposed || !api) return;
    // Repository discovery is optional: the comparison engine can work directly with Git.
    this.disposables.push(
      api.onDidOpenRepository(() => this.scheduleRefresh()),
      api.onDidCloseRepository(() => this.scheduleRefresh()),
    );
  }

  private async initialize(): Promise<void> {
    try {
      await this.configure();
      const stored = this.context.workspaceState.get<unknown>(storageKey, []);
      if (Array.isArray(stored)) {
        this.comparisons = stored
          .filter(isSavedComparison)
          .slice(0, 100)
          .map((comparison) => ({ ...comparison, state: 'loading', generation: 0 }));
      }
      if (this.disposed) return;
      for (const comparison of this.comparisons)
        void this.watch(comparison.repository).catch((error) => this.log(error));
      this.tree.refresh();
      await this.refresh();
      this.output.appendLine(
        `Git Compare ready · ${vscode.env.appName} ${vscode.version} · ${this.comparisons.length} restored comparisons`,
      );
    } catch (error) {
      this.log(error);
    }
  }

  private async compare(args?: CompareArgs, folder?: vscode.Uri): Promise<string | undefined> {
    await this.ready;
    let repository: Repository | undefined;
    let base: Endpoint | undefined;
    let target: Endpoint | undefined;
    if (args) {
      if (
        typeof args.repoPath !== 'string' ||
        typeof args.base !== 'string' ||
        typeof args.target !== 'string'
      )
        throw new Error('A comparison requires repoPath, base, and target strings.');
      repository = await this.service.repository(args.repoPath);
      if (args.scope) {
        safePath(repository.path, args.scope);
        repository.scope = args.scope.split(path.sep).join('/');
      }
      base = endpointFromInput(args.base);
      target = endpointFromInput(args.target);
    } else {
      repository = await pickRepository(this.service, folder);
      if (!repository) return undefined;
      base = await pickEndpoint(this.service, repository, 'Base');
      if (!base) return undefined;
      target = await pickEndpoint(this.service, repository, 'Target', undefined, base);
      if (!target) return undefined;
    }
    const duplicate = this.comparisons.find(
      (item) =>
        JSON.stringify([item.repository.path, item.repository.scope, item.base, item.target]) ===
        JSON.stringify([repository.path, repository.scope, base, target]),
    );
    let comparison = duplicate;
    if (!comparison) {
      comparison = {
        id: randomUUID(),
        repository,
        base,
        target,
        pinned: false,
        filter: '',
        state: 'loading',
        generation: 0,
      };
      this.comparisons.push(comparison);
      void this.watch(repository).catch((error) => this.log(error));
      await this.save();
    }
    this.tree.refresh();
    await this.refreshOne(comparison);
    await vscode.commands.executeCommand('gitcompare.comparisons.focus');
    await this.view.reveal(
      { kind: 'comparison', comparison },
      { expand: true, select: true, focus: false },
    );
    return comparison.id;
  }

  async refresh(): Promise<void> {
    await Promise.all(this.comparisons.map((comparison) => this.refreshOne(comparison)));
    this.tree.refresh();
  }

  private refreshOne(comparison: Comparison): Promise<void> {
    const operation = this.performRefresh(comparison);
    this.refreshes.set(comparison.id, operation);
    void operation.finally(() => {
      if (this.refreshes.get(comparison.id) === operation) this.refreshes.delete(comparison.id);
    });
    return operation;
  }

  private async performRefresh(comparison: Comparison): Promise<void> {
    const generation = ++comparison.generation;
    comparison.state = 'loading';
    comparison.error = undefined;
    this.tree.refresh();
    try {
      const result = await this.service.compare(
        comparison.repository,
        comparison.base,
        comparison.target,
        vscode.workspace.getConfiguration('gitcompare').get('includeUntracked', true),
      );
      if (
        this.disposed ||
        generation !== comparison.generation ||
        !this.comparisons.includes(comparison)
      )
        return;
      comparison.result = result;
      comparison.state = 'ready';
    } catch (error) {
      if (
        this.disposed ||
        generation !== comparison.generation ||
        !this.comparisons.includes(comparison)
      )
        return;
      comparison.result = undefined;
      comparison.error = error instanceof Error ? error.message : String(error);
      comparison.state = 'error';
      this.log(error);
    }
    this.tree.refresh();
  }

  private selected(node?: ComparisonNode): Comparison | undefined {
    if (node?.kind === 'comparison')
      return this.comparisons.find((item) => item.id === node.comparison.id);
    const selected = this.view.selection[0];
    return selected?.comparison ?? this.comparisons.at(-1);
  }

  private async swap(node?: ComparisonNode): Promise<void> {
    const comparison = this.selected(node);
    if (!comparison) return;
    [comparison.base, comparison.target] = [comparison.target, comparison.base];
    comparison.result = undefined;
    await this.save();
    await this.refreshOne(comparison);
  }

  private async edit(node?: ComparisonNode): Promise<void> {
    const comparison = this.selected(node);
    if (!comparison) return;
    const base = await pickEndpoint(this.service, comparison.repository, 'Base', comparison.base);
    if (!base) return;
    const target = await pickEndpoint(
      this.service,
      comparison.repository,
      'Target',
      comparison.target,
      base,
    );
    if (!target) return;
    comparison.base = base;
    comparison.target = target;
    comparison.result = undefined;
    await this.save();
    await this.refreshOne(comparison);
  }

  private async setPinned(node: ComparisonNode | undefined, pinned: boolean): Promise<void> {
    const comparison = this.selected(node);
    if (!comparison) return;
    comparison.pinned = pinned;
    this.comparisons.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    await this.save();
    this.tree.refresh();
  }

  private async remove(node?: ComparisonNode): Promise<void> {
    const comparison = this.selected(node);
    if (!comparison) return;
    comparison.generation++;
    this.comparisons = this.comparisons.filter((item) => item !== comparison);
    this.releaseUnusedWatchers();
    await this.save();
    this.tree.refresh();
  }

  private async clear(): Promise<void> {
    for (const comparison of this.comparisons) if (!comparison.pinned) comparison.generation++;
    this.comparisons = this.comparisons.filter((comparison) => comparison.pinned);
    this.releaseUnusedWatchers();
    await this.save();
    this.tree.refresh();
  }

  private async filter(node?: ComparisonNode): Promise<void> {
    const comparison = this.selected(node);
    if (!comparison) return;
    const value = await vscode.window.showInputBox({
      title: 'Filter changed files',
      prompt:
        'Match path or status. All space-separated terms must match; leave empty to show every file.',
      value: comparison.filter,
    });
    if (value === undefined) return;
    comparison.filter = value.trim();
    await this.save();
    this.tree.refresh();
  }

  private async openDiff(node?: FileNode, preview = true): Promise<void> {
    if (node?.kind !== 'file') return;
    const comparison = this.comparisons.find((item) => item.id === node.comparison.id);
    if (comparison?.state === 'loading') await this.refreshes.get(comparison.id);
    if (!comparison || comparison.state !== 'ready' || !comparison.result) return;
    const file = comparison.result.files.find((file) => file.path === node.file.path);
    if (!file) return;
    const { base, target } = comparison.result;
    const version = `${comparison.id}:${comparison.generation}`;
    const left = this.revisions.uri(
      comparison.repository,
      base,
      file.basePath ?? file.path,
      version,
      !file.basePath,
    );
    const right = this.revisions.uri(
      comparison.repository,
      target,
      file.targetPath ?? file.path,
      version,
      !file.targetPath,
    );
    // Load both sides before opening so failures are reported by this command, rather than a blank tab.
    await Promise.all([this.revisions.readFile(left), this.revisions.readFile(right)]);
    await vscode.commands.executeCommand(
      'vscode.diff',
      left,
      right,
      `${file.path} · ${base.label} → ${target.label}`,
      {
        preview,
        preserveFocus: true,
        viewColumn: vscode.ViewColumn.Active,
      },
    );
  }

  private async openAll(node?: ComparisonNode): Promise<void> {
    const comparison = this.selected(node);
    if (!comparison?.result) return;
    const files = comparison.result.files.filter((file) => matchesFilter(file, comparison.filter));
    if (files.length > 20) {
      const choice = await vscode.window.showWarningMessage(
        `Open ${files.length} diff tabs?`,
        { modal: true },
        'Open All',
      );
      if (choice !== 'Open All') return;
    }
    for (const file of files)
      await this.openDiff(
        { kind: 'file', comparison, file, parent: { kind: 'comparison', comparison } },
        false,
      );
  }

  private async watch(repository: Repository): Promise<void> {
    if (this.watchers.has(repository.path) || this.disposed) return;
    const disposables: vscode.Disposable[] = [];
    this.watchers.set(repository.path, disposables);
    const watch = (base: string, pattern: string) => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(base, pattern),
      );
      disposables.push(
        watcher,
        watcher.onDidChange(() => this.scheduleRefresh()),
        watcher.onDidCreate(() => this.scheduleRefresh()),
        watcher.onDidDelete(() => this.scheduleRefresh()),
      );
    };
    watch(repository.path, '**/*');
    const [gitDir, commonDir] = await Promise.all([
      this.service.git.text(repository.path, ['rev-parse', '--absolute-git-dir']),
      this.service.git.text(repository.path, ['rev-parse', '--git-common-dir']),
    ]);
    if (this.disposed || this.watchers.get(repository.path) !== disposables) return;
    for (const directory of new Set([
      gitDir.replace(/\r?\n$/, ''),
      path.resolve(repository.path, commonDir.replace(/\r?\n$/, '')),
    ])) {
      watch(directory, '{HEAD,index,packed-refs,refs/**}');
    }
  }

  private releaseUnusedWatchers(): void {
    for (const [repoPath, watchers] of this.watchers) {
      if (!this.comparisons.some((comparison) => comparison.repository.path === repoPath)) {
        watchers.forEach((watcher) => watcher.dispose());
        this.watchers.delete(repoPath);
      }
    }
  }

  private scheduleRefresh(): void {
    if (this.disposed || !vscode.workspace.getConfiguration('gitcompare').get('autoRefresh', true))
      return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.refresh();
    }, 700);
  }

  private save(): PromiseLike<void> {
    const keep = vscode.workspace.getConfiguration('gitcompare').get('keepComparisons', true);
    const data = this.getComparisons().filter((comparison) => keep || comparison.pinned);
    this.saveChain = this.saveChain
      .then(undefined, (error) => this.log(error))
      .then(() => this.context.workspaceState.update(storageKey, data));
    return this.saveChain;
  }

  getComparisons(): readonly SavedComparison[] {
    return this.comparisons.map(({ id, repository, base, target, pinned, filter }) => ({
      id,
      repository: { ...repository },
      base: { ...base },
      target: { ...target },
      pinned,
      filter,
    }));
  }
  getChangedFiles(id: string): readonly ChangedFile[] {
    return (
      this.comparisons
        .find((comparison) => comparison.id === id)
        ?.result?.files.map((file) => ({ ...file })) ?? []
    );
  }

  private log(error: unknown): void {
    this.output.appendLine(
      `[${new Date().toISOString()}] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
  }
  private async report(error: unknown): Promise<void> {
    this.log(error);
    const action = await vscode.window.showErrorMessage(
      `Git Compare: ${error instanceof Error ? error.message : String(error)}`,
      'Show Output',
    );
    if (action === 'Show Output') this.output.show();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const watchers of this.watchers.values()) watchers.forEach((watcher) => watcher.dispose());
    this.watchers.clear();
    this.disposables.forEach((disposable) => disposable.dispose());
  }
}

function isEndpoint(value: unknown): value is Endpoint {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value.kind === 'working' ||
      value.kind === 'index' ||
      (value.kind === 'revision' && 'ref' in value && typeof value.ref === 'string'))
  );
}

function isSavedComparison(value: unknown): value is SavedComparison {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Partial<SavedComparison>;
  return (
    typeof data.id === 'string' &&
    typeof data.repository?.path === 'string' &&
    typeof data.repository.name === 'string' &&
    (data.repository.scope === undefined || typeof data.repository.scope === 'string') &&
    isEndpoint(data.base) &&
    isEndpoint(data.target) &&
    typeof data.pinned === 'boolean' &&
    typeof data.filter === 'string'
  );
}
