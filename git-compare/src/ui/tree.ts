import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ChangedFile, Comparison } from '../types.js';
import { endpointLabel, matchesFilter, statusNames } from '../types.js';

export type TreeNode = ComparisonNode | FolderNode | FileNode | MessageNode;
export interface ComparisonNode {
  kind: 'comparison';
  comparison: Comparison;
}
export interface FolderNode {
  kind: 'folder';
  comparison: Comparison;
  path: string;
  parent: ComparisonNode | FolderNode;
}
export interface FileNode {
  kind: 'file';
  comparison: Comparison;
  file: ChangedFile;
  parent: ComparisonNode | FolderNode;
}
export interface MessageNode {
  kind: 'message';
  comparison: Comparison;
  label: string;
  error?: boolean;
  parent: ComparisonNode;
}

export class CompareTree implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly comparisons: () => readonly Comparison[]) {}

  refresh(): void {
    this.emitter.fire(undefined);
  }
  dispose(): void {
    this.emitter.dispose();
  }
  getParent(node: TreeNode): TreeNode | undefined {
    return node.kind === 'comparison' ? undefined : node.parent;
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (!node) return this.comparisons().map((comparison) => ({ kind: 'comparison', comparison }));
    if (node.kind === 'file' || node.kind === 'message') return [];
    const comparison = node.comparison;
    if (node.kind === 'comparison') {
      if (comparison.state === 'loading' && !comparison.result)
        return [{ kind: 'message', comparison, label: 'Comparing references…', parent: node }];
      if (comparison.state === 'error')
        return [
          {
            kind: 'message',
            comparison,
            label: comparison.error ?? 'Comparison failed',
            error: true,
            parent: node,
          },
        ];
      if (!comparison.result?.files.length)
        return [{ kind: 'message', comparison, label: 'No changed files', parent: node }];
    }
    const files =
      comparison.result?.files.filter((file) => matchesFilter(file, comparison.filter)) ?? [];
    if (!files.length && node.kind === 'comparison')
      return [{ kind: 'message', comparison, label: 'No files match this filter', parent: node }];
    if (
      vscode.workspace.getConfiguration('gitcompare').get<string>('files.layout', 'tree') === 'list'
    ) {
      return files.map((file) => ({ kind: 'file', comparison, file, parent: node }));
    }
    const prefix = node.kind === 'folder' ? `${node.path}/` : '';
    const folders = new Map<string, FolderNode>();
    const children: FileNode[] = [];
    for (const file of files) {
      if (!file.path.startsWith(prefix)) continue;
      const relative = file.path.slice(prefix.length);
      const slash = relative.indexOf('/');
      if (slash >= 0) {
        const name = `${prefix}${relative.slice(0, slash)}`;
        if (!folders.has(name))
          folders.set(name, { kind: 'folder', comparison, path: name, parent: node });
      } else children.push({ kind: 'file', comparison, file, parent: node });
    }
    return [...[...folders.values()].sort((a, b) => a.path.localeCompare(b.path)), ...children];
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'comparison') {
      const comparison = node.comparison;
      const base = comparison.result?.base.label ?? endpointLabel(comparison.base);
      const target = comparison.result?.target.label ?? endpointLabel(comparison.target);
      const item = new vscode.TreeItem(
        `${base} → ${target}`,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.id = comparison.id;
      item.contextValue = comparison.pinned ? 'comparisonPinned' : 'comparison';
      const count = comparison.result?.files.length;
      const visible = comparison.result?.files.filter((file) =>
        matchesFilter(file, comparison.filter),
      ).length;
      item.description = `${comparison.repository.name}${comparison.repository.scope ? `/${comparison.repository.scope}` : ''} · ${comparison.state === 'loading' ? 'refreshing…' : comparison.state === 'error' ? 'failed' : comparison.filter ? `${visible}/${count} files` : `${count ?? 0} files`}`;
      item.iconPath = new vscode.ThemeIcon(
        comparison.state === 'error' ? 'error' : comparison.pinned ? 'pinned' : 'diff',
      );
      item.tooltip = new vscode.MarkdownString();
      item.tooltip.appendText(
        `Base (left): ${base}\nTarget (right): ${target}\nRepository: ${comparison.repository.path}${comparison.repository.scope ? `\nFolder: ${comparison.repository.scope}` : ''}${comparison.filter ? `\nFilter: ${comparison.filter}` : ''}`,
      );
      return item;
    }
    if (node.kind === 'message') {
      const item = new vscode.TreeItem(node.label);
      item.tooltip = node.label;
      item.iconPath = new vscode.ThemeIcon(node.error ? 'warning' : 'info');
      if (node.error)
        item.command = { command: 'gitcompare.showOutput', title: 'Show error details' };
      return item;
    }
    if (node.kind === 'folder') {
      const item = new vscode.TreeItem(
        path.posix.basename(node.path),
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.id = `${node.comparison.id}:folder:${node.path}`;
      item.iconPath = new vscode.ThemeIcon('folder');
      item.tooltip = node.path;
      return item;
    }
    const file = node.file;
    const item = new vscode.TreeItem(
      path.posix.basename(file.path).replace(/\n/g, '↵').replace(/\t/g, '⇥').replace(/\r/g, '␍'),
    );
    item.id = `${node.comparison.id}:file:${file.path}`;
    item.contextValue = 'changedFile';
    const directory = path.posix.dirname(file.path);
    item.description = `${file.untracked ? 'Untracked · ' : ''}${statusNames[file.status]}${node.parent.kind === 'comparison' && directory !== '.' ? ` · ${directory}` : ''}`;
    item.tooltip = `${file.path}\n${statusNames[file.status]}${file.status === 'R' || file.status === 'C' ? `\n${file.basePath} → ${file.targetPath}` : ''}`;
    const icons: Record<ChangedFile['status'], string> = {
      A: 'diff-added',
      D: 'diff-removed',
      M: 'diff-modified',
      R: 'diff-renamed',
      C: 'files',
      T: 'diff-modified',
      U: 'warning',
    };
    const colors: Record<ChangedFile['status'], string> = {
      A: 'gitDecoration.addedResourceForeground',
      D: 'gitDecoration.deletedResourceForeground',
      M: 'gitDecoration.modifiedResourceForeground',
      R: 'gitDecoration.renamedResourceForeground',
      C: 'gitDecoration.addedResourceForeground',
      T: 'gitDecoration.modifiedResourceForeground',
      U: 'gitDecoration.conflictingResourceForeground',
    };
    item.iconPath = new vscode.ThemeIcon(
      icons[file.status],
      new vscode.ThemeColor(colors[file.status]),
    );
    item.command = { command: 'gitcompare.openDiff', title: 'Open Changes', arguments: [node] };
    return item;
  }
}
