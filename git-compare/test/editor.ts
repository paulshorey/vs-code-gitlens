import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as vscode from 'vscode';
import type { ComparisonApi } from '../src/controller.js';
import type { FileNode } from '../src/ui/tree.js';
import { Fixture } from './fixture.js';

/** Invoked by the actual IDE's extension test host; no VS Code mocks. */
export async function run(): Promise<void> {
  const reportPath =
    process.env.GIT_COMPARE_REPORT ?? path.join(os.tmpdir(), 'git-compare-editor-report.json');
  const report: Record<string, unknown> = {
    editor: vscode.env.appName,
    version: vscode.version,
    checks: [],
  };
  const checks = report.checks as string[];
  const f = new Fixture();
  try {
    f.write('modified.txt', 'before\n');
    f.write('deleted.txt', 'gone\n');
    f.write('old.txt', 'rename\n');
    f.commit('base');
    f.write('modified.txt', 'after\n');
    f.git('mv', 'old.txt', 'new-name.txt');
    await fs.rm(path.join(f.root, 'deleted.txt'));
    f.write('untracked.txt', 'new\n');
    const extension = vscode.extensions.getExtension<ComparisonApi>('PaulShorey.git-compare');
    assert.ok(extension, 'The independent extension is installed in this host.');
    const api = await extension.activate();
    checks.push('cold activation');
    const commands = await vscode.commands.getCommands(true);
    for (const { command } of extension.packageJSON.contributes.commands as { command: string }[])
      assert.ok(commands.includes(command), command);
    checks.push('core command registration');
    await vscode.commands.executeCommand('gitcompare.focus');
    checks.push('view focus');
    const id = await vscode.commands.executeCommand<string>('gitcompare.compare', {
      repoPath: f.root,
      base: 'HEAD',
      target: ':working',
    });
    assert.ok(id);
    assert.equal(api.getChangedFiles(id).length, 4);
    checks.push('HEAD → working tree including untracked');
    const comparison = api.getComparisons().find((item) => item.id === id)!;
    const files = api.getChangedFiles(id);
    for (const file of files) {
      const node = {
        kind: 'file',
        comparison,
        file,
        parent: { kind: 'comparison', comparison },
      } as unknown as FileNode;
      await vscode.commands.executeCommand('gitcompare.openDiff', node);
      await until(() =>
        vscode.window.tabGroups.all.some((group) =>
          group.tabs.some(
            (tab) =>
              tab.input instanceof vscode.TabInputTextDiff && tab.label.startsWith(file.path),
          ),
        ),
      );
      const tab = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .find(
          (tab) => tab.input instanceof vscode.TabInputTextDiff && tab.label.startsWith(file.path),
        );
      assert.ok(tab?.input instanceof vscode.TabInputTextDiff, 'Native diff tab opened.');
      const left = await vscode.workspace.openTextDocument(tab.input.original);
      const right = await vscode.workspace.openTextDocument(tab.input.modified);
      assert.equal(
        (await vscode.workspace.fs.stat(tab.input.original)).permissions,
        vscode.FilePermission.Readonly,
      );
      assert.equal(
        (await vscode.workspace.fs.stat(tab.input.modified)).permissions,
        vscode.FilePermission.Readonly,
      );
      if (file.path === 'modified.txt') {
        assert.equal(left.getText(), 'before\n');
        assert.equal(right.getText(), 'after\n');
      }
      if (file.status === 'A') {
        assert.equal(left.getText(), '');
        assert.equal(right.getText(), 'new\n');
      }
      if (file.status === 'D') {
        assert.equal(left.getText(), 'gone\n');
        assert.equal(right.getText(), '');
      }
      if (file.status === 'R') {
        assert.equal(left.getText(), 'rename\n');
        assert.equal(right.getText(), 'rename\n');
      }
    }
    checks.push('native diffs for modified, added, deleted, renamed files');
    f.write('automatic-refresh.txt', 'saved change\n');
    await until(() =>
      api.getChangedFiles(id).some((file) => file.path === 'automatic-refresh.txt'),
    );
    await fs.rm(path.join(f.root, 'automatic-refresh.txt'));
    await until(
      () => !api.getChangedFiles(id).some((file) => file.path === 'automatic-refresh.txt'),
    );
    checks.push('filesystem changes automatically refresh the comparison');
    const node = { kind: 'comparison', comparison };
    await vscode.commands.executeCommand('gitcompare.pin', node);
    assert.equal(api.getComparisons().find((item) => item.id === id)?.pinned, true);
    await vscode.commands.executeCommand('gitcompare.clear');
    assert.equal(api.getComparisons().length, 1);
    checks.push('pinning and clearing preserve pinned comparisons');
    await vscode.commands.executeCommand('gitcompare.swap', node);
    assert.equal(
      api.getChangedFiles(id).find((file) => file.path === 'untracked.txt')?.status,
      'D',
    );
    checks.push('swapping reverses additions');
    await vscode.commands.executeCommand('gitcompare.refresh');
    checks.push('refresh');
    await vscode.commands.executeCommand('gitcompare.remove', node);
    assert.equal(api.getComparisons().length, 0);
    checks.push('remove comparison');
    report.success = true;
  } catch (error) {
    report.success = false;
    report.error = error instanceof Error ? error.stack : String(error);
    throw error;
  } finally {
    f.dispose();
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[Git Compare tests] ${JSON.stringify(report)}`);
  }
}

async function until(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error('The native diff tab did not appear within five seconds.');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
