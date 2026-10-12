import * as vscode from 'vscode';
import type { Endpoint, Repository } from '../types.js';
import { endpointLabel } from '../types.js';
import { ComparisonService, displayRef } from '../git/comparisons.js';

interface GitApi {
  git: { path: string };
  repositories: { rootUri: vscode.Uri }[];
  onDidOpenRepository: vscode.Event<{ rootUri: vscode.Uri }>;
  onDidCloseRepository: vscode.Event<{ rootUri: vscode.Uri }>;
}
interface GitExtension {
  getAPI(version: 1): GitApi;
}

export async function builtInGit(): Promise<GitApi | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!extension) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const exports = await Promise.race([
      extension.isActive ? Promise.resolve(extension.exports) : extension.activate(),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 3000);
      }),
    ]);
    return exports?.getAPI(1);
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function configureGit(service: ComparisonService): Promise<GitApi | undefined> {
  const custom = vscode.workspace.getConfiguration('gitcompare').get<string>('gitPath', '').trim();
  if (custom) service.git.setExecutable(custom);
  const api = await builtInGit();
  if (!custom) {
    const configured = vscode.workspace.getConfiguration('git').get<string | string[]>('path');
    service.git.setExecutable(
      api?.git.path ?? (Array.isArray(configured) ? configured[0] : configured) ?? 'git',
    );
  }
  return api;
}

export async function pickRepository(
  service: ComparisonService,
  folder?: vscode.Uri,
): Promise<Repository | undefined> {
  if (folder) {
    if (folder.scheme !== 'file')
      throw new Error('Select a folder on the filesystem of this extension host.');
    return service.repository(folder.fsPath, true);
  }
  const api = await configureGit(service);
  const roots = new Set([
    ...(api?.repositories.map((repository) => repository.rootUri.fsPath) ?? []),
    ...(vscode.workspace.workspaceFolders
      ?.filter((folder) => folder.uri.scheme === 'file')
      .map((folder) => folder.uri.fsPath) ?? []),
  ]);
  const candidates = await Promise.allSettled([...roots].map((root) => service.repository(root)));
  const repositories = new Map<string, Repository>();
  for (const candidate of candidates)
    if (candidate.status === 'fulfilled') repositories.set(candidate.value.path, candidate.value);
  const items: (vscode.QuickPickItem & { repository?: Repository })[] = [
    ...[...repositories.values()].map((repository) => ({
      label: `$(repo) ${repository.name}`,
      description: repository.path,
      repository,
    })),
    {
      label: '$(folder-opened) Browse for a repository or folder…',
      detail: 'Choosing a subfolder limits the comparison to that folder.',
    },
  ];
  const pick = await vscode.window.showQuickPick(items, {
    title: 'Compare References · Repository',
    placeHolder: 'Choose a repository',
    matchOnDescription: true,
  });
  if (!pick) return undefined;
  if (pick.repository) return pick.repository;
  const selection = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: 'Compare This Folder',
  });
  return selection?.[0] ? service.repository(selection[0].fsPath, true) : undefined;
}

export async function pickEndpoint(
  service: ComparisonService,
  repository: Repository,
  side: 'Base' | 'Target',
  current?: Endpoint,
  base?: Endpoint,
): Promise<Endpoint | undefined> {
  const references = await service.references(repository);
  const items: (vscode.QuickPickItem & { endpoint?: Endpoint; enter?: boolean })[] = [
    {
      label: '$(edit) Enter a commit hash or reference…',
      detail: 'Examples: HEAD~3, main, origin/main, v1.0.0',
      enter: true,
    },
    {
      label: '$(files) Working Tree',
      detail: 'Saved local files, including staged, unstaged, and untracked changes',
      endpoint: { kind: 'working' },
    },
    {
      label: '$(layers) Index',
      detail: 'The staged version of your files',
      endpoint: { kind: 'index' },
    },
    {
      label: '$(git-commit) HEAD',
      detail: 'The current commit',
      endpoint: { kind: 'revision', ref: 'HEAD' },
    },
    ...references.map((reference) => ({
      label: `${reference.current ? '$(check)' : reference.kind === 'Tag' ? '$(tag)' : '$(git-branch)'} ${displayRef(reference.ref)}`,
      description: reference.kind,
      endpoint: { kind: 'revision' as const, ref: reference.ref },
    })),
  ];
  if (current) {
    const index = items.findIndex(
      (item) => JSON.stringify(item.endpoint) === JSON.stringify(current),
    );
    if (index >= 0) items.unshift(...items.splice(index, 1));
  } else if (side === 'Target') {
    const index = items.findIndex((item) => item.endpoint?.kind === 'working');
    if (index >= 0) items.unshift(...items.splice(index, 1));
  } else {
    const index = items.findIndex(
      (item) => item.endpoint?.kind === 'revision' && item.endpoint.ref === 'HEAD',
    );
    if (index >= 0) items.unshift(...items.splice(index, 1));
  }
  const pick = await vscode.window.showQuickPick(items, {
    title: `${repository.name}${repository.scope ? ` / ${repository.scope}` : ''} · ${side} ${side === 'Base' ? '(left)' : '(right)'}`,
    placeHolder: base
      ? `Compare ${endpointLabel(base)} → target`
      : 'Choose the base version to compare from',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!pick) return undefined;
  if (!pick.enter) return pick.endpoint;
  const ref = await vscode.window.showInputBox({
    title: `${side} reference`,
    prompt: 'Enter a commit hash, branch, tag, or revision expression',
    value: current?.kind === 'revision' ? current.ref : '',
    ignoreFocusOut: true,
    validateInput: async (value) => {
      if (!value.trim()) return 'Enter a reference.';
      try {
        await service.resolve(repository, { kind: 'revision', ref: value.trim() });
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
  });
  return ref?.trim() ? { kind: 'revision', ref: ref.trim() } : undefined;
}
