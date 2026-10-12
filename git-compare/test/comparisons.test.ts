import { test, type TestContext } from 'node:test';
import * as assert from 'node:assert/strict';
import { realpathSync, rmSync, symlinkSync } from 'node:fs';
import * as path from 'node:path';
import type { Endpoint } from '../src/types.js';
import { matchesFilter } from '../src/types.js';
import { parseNameStatus, safePath } from '../src/git/comparisons.js';
import { Fixture } from './fixture.js';

const head: Endpoint = { kind: 'revision', ref: 'HEAD' };
const working: Endpoint = { kind: 'working' };
const index: Endpoint = { kind: 'index' };
function fixture(t: TestContext, format?: string): Fixture {
  const f = new Fixture(format);
  t.after(() => f.dispose());
  return f;
}

test('two commit endpoints include additions, deletions, modifications, and renames', async (t) => {
  const f = fixture(t);
  f.write('modified.txt', 'before\n');
  f.write('deleted.txt', 'deleted\n');
  f.write('old.txt', 'rename\n');
  const base = f.commit('base');
  f.write('modified.txt', 'after\n');
  f.write('added.txt', 'added\n');
  f.git('mv', 'old.txt', 'renamed.txt');
  rmSync(path.join(f.root, 'deleted.txt'));
  const target = f.commit('target');
  const result = await f.service.compare(
    f.repository,
    { kind: 'revision', ref: base },
    { kind: 'revision', ref: target },
  );
  assert.deepEqual(
    result.files.map((file) => [file.path, file.status]),
    [
      ['added.txt', 'A'],
      ['deleted.txt', 'D'],
      ['modified.txt', 'M'],
      ['renamed.txt', 'R'],
    ],
  );
  const rename = result.files.find((file) => file.status === 'R')!;
  assert.equal(rename.basePath, 'old.txt');
  assert.equal(rename.targetPath, 'renamed.txt');
  assert.equal((await f.service.read(f.root, result.base, 'old.txt'))?.toString(), 'rename\n');
  assert.equal(
    (await f.service.read(f.root, result.target, 'renamed.txt'))?.toString(),
    'rename\n',
  );
});

test('local comparison includes staged, unstaged, and untracked changes', async (t) => {
  const f = fixture(t);
  f.write('staged.txt', 'before\n');
  f.write('unstaged.txt', 'before\n');
  f.commit('base');
  f.write('staged.txt', 'staged\n');
  f.git('add', 'staged.txt');
  f.write('unstaged.txt', 'unstaged\n');
  f.write('new.txt', 'new\n');
  const result = await f.service.compare(f.repository, head, working);
  assert.deepEqual(
    result.files.map((file) => [file.path, file.status]),
    [
      ['new.txt', 'A'],
      ['staged.txt', 'M'],
      ['unstaged.txt', 'M'],
    ],
  );
  assert.equal(result.files[0]?.untracked, true);
});

test('working tree on the left reverses status and missing sides', async (t) => {
  const f = fixture(t);
  f.write('deleted.txt', 'before\n');
  f.commit('base');
  rmSync(path.join(f.root, 'deleted.txt'));
  f.write('added.txt', 'new\n');
  const result = await f.service.compare(f.repository, working, head);
  assert.deepEqual(
    result.files.map((file) => [file.path, file.status]),
    [
      ['added.txt', 'D'],
      ['deleted.txt', 'A'],
    ],
  );
  assert.equal(result.files[0]?.targetPath, undefined);
  assert.equal(result.files[1]?.basePath, undefined);
});

test('staged/index and unstaged comparisons use distinct file versions', async (t) => {
  const f = fixture(t);
  f.write('file.txt', 'base\n');
  f.commit('base');
  f.write('file.txt', 'staged\n');
  f.git('add', 'file.txt');
  f.write('file.txt', 'working\n');
  const staged = await f.service.compare(f.repository, head, index);
  const unstaged = await f.service.compare(f.repository, index, working);
  assert.equal((await f.service.read(f.root, staged.base, 'file.txt'))?.toString(), 'base\n');
  assert.equal((await f.service.read(f.root, staged.target, 'file.txt'))?.toString(), 'staged\n');
  assert.equal(
    (await f.service.read(f.root, unstaged.target, 'file.txt'))?.toString(),
    'working\n',
  );
});

test('index comparisons reverse staged additions and deletions', async (t) => {
  const f = fixture(t);
  f.write('gone.txt', 'old\n');
  f.commit('base');
  f.git('rm', 'gone.txt');
  f.write('new.txt', 'new\n');
  f.git('add', 'new.txt');
  const result = await f.service.compare(f.repository, index, head);
  assert.deepEqual(
    result.files.map((file) => [file.path, file.status]),
    [
      ['gone.txt', 'A'],
      ['new.txt', 'D'],
    ],
  );
});

test('working-to-index comparison reverses unstaged and untracked additions', async (t) => {
  const f = fixture(t);
  f.write('file.txt', 'base\n');
  f.commit('base');
  f.write('new.txt', 'untracked\n');
  const result = await f.service.compare(f.repository, working, index);
  assert.equal(result.files[0]?.status, 'D');
  assert.equal(result.files[0]?.targetPath, undefined);
});

test('Unicode, tabs, newlines, spaces, and literal pathspec characters round-trip', async (t) => {
  const f = fixture(t);
  f.write('base.txt', 'base\n');
  f.commit('base');
  const names = [
    'with space.txt',
    'with\ttab.txt',
    'with\nnewline.txt',
    '日本語.txt',
    '[literal]*.txt',
  ];
  for (const name of names) f.write(name, `${name}\n`);
  f.git('add', '-A');
  const result = await f.service.compare(f.repository, head, index);
  assert.deepEqual(new Set(result.files.map((file) => file.path)), new Set(names));
  for (const name of names)
    assert.equal((await f.service.read(f.root, result.target, name))?.toString(), `${name}\n`);
});

test('ignored untracked files stay excluded and untracked inclusion can be disabled', async (t) => {
  const f = fixture(t);
  f.write('.gitignore', '*.ignored\n');
  f.commit('base');
  f.write('new.txt', 'new');
  f.write('secret.ignored', 'ignored');
  assert.deepEqual(
    (await f.service.compare(f.repository, head, working)).files.map((file) => file.path),
    ['new.txt'],
  );
  assert.equal((await f.service.compare(f.repository, head, working, false)).files.length, 0);
});

test('index deletion followed by identical recreation is not a false deletion', async (t) => {
  const f = fixture(t);
  f.write('file.txt', 'base\n');
  f.commit('base');
  f.git('rm', '--cached', 'file.txt');
  assert.equal((await f.service.compare(f.repository, head, working)).files.length, 0);
  f.write('file.txt', 'changed\n');
  const changed = await f.service.compare(f.repository, head, working);
  assert.equal(changed.files[0]?.status, 'M');
  assert.equal(changed.files[0]?.basePath, 'file.txt');
});

test('folder scope uses literal paths and excludes sibling folders', async (t) => {
  const f = fixture(t);
  f.write('src/a.txt', 'base');
  f.write('other/b.txt', 'base');
  f.commit('base');
  f.write('src/a.txt', 'after');
  f.write('src/new.txt', 'new');
  f.write('other/b.txt', 'after');
  const repository = await f.service.repository(path.join(f.root, 'src'), true);
  assert.equal(repository.scope, 'src');
  assert.deepEqual(
    (await f.service.compare(repository, head, working)).files.map((file) => file.path),
    ['src/a.txt', 'src/new.txt'],
  );
});

test('branches, tags, remote refs, and arbitrary commit expressions resolve', async (t) => {
  const f = fixture(t);
  f.write('a.txt', 'base');
  const base = f.commit('base');
  f.git('branch', 'feature');
  f.git('tag', 'v1');
  f.git('update-ref', 'refs/remotes/origin/main', base);
  f.write('a.txt', 'next');
  f.commit('next');
  const references = await f.service.references(f.repository);
  assert.ok(references.some((ref) => ref.ref === 'refs/heads/feature'));
  assert.ok(references.some((ref) => ref.ref === 'refs/tags/v1'));
  assert.ok(references.some((ref) => ref.ref === 'refs/remotes/origin/main'));
  const resolved = await f.service.resolve(f.repository, { kind: 'revision', ref: 'HEAD~1' });
  assert.equal(resolved.kind === 'commit' && resolved.oid, base);
});

test('invalid references produce actionable errors, not an empty result', async (t) => {
  const f = fixture(t);
  f.write('a.txt', 'base');
  f.commit('base');
  await assert.rejects(
    f.service.compare(f.repository, { kind: 'revision', ref: 'does-not-exist' }, working),
    /Cannot resolve reference/,
  );
  await assert.rejects(
    f.service.resolve(f.repository, { kind: 'revision', ref: '--help' }),
    /Cannot resolve reference/,
  );
});

test('identical endpoints produce no changed files', async (t) => {
  const f = fixture(t);
  f.write('a.txt', 'base');
  f.commit('base');
  f.write('new.txt', 'new');
  for (const endpoint of [head, working, index])
    assert.equal((await f.service.compare(f.repository, endpoint, endpoint)).files.length, 0);
});

test('unborn HEAD compares against the empty tree', async (t) => {
  const f = fixture(t);
  f.write('new.txt', 'new');
  const result = await f.service.compare(f.repository, head, working);
  assert.equal(result.files[0]?.status, 'A');
  assert.equal(result.base.label, 'HEAD (empty repository)');
  f.git('add', 'new.txt');
  assert.equal((await f.service.compare(f.repository, head, index)).files[0]?.status, 'A');
});

test('SHA-256 repositories and their empty trees work', async (t) => {
  const f = fixture(t, 'sha256');
  f.write('a.txt', 'base');
  assert.equal((await f.service.compare(f.repository, head, working)).files[0]?.status, 'A');
  f.commit('base');
  f.write('a.txt', 'after');
  const result = await f.service.compare(f.repository, head, working);
  assert.equal(result.base.kind === 'commit' && result.base.oid.length, 64);
  assert.equal((await f.service.read(f.root, result.base, 'a.txt'))?.toString(), 'base');
});

test('binary blobs are preserved as bytes', async (t) => {
  const f = fixture(t);
  const bytes = Buffer.from([0, 255, 128, 3, 0]);
  f.write('binary.dat', bytes);
  f.commit('base');
  const endpoint = await f.service.resolve(f.repository, head);
  assert.deepEqual(await f.service.read(f.root, endpoint, 'binary.dat'), bytes);
});

test(
  'symlinks compare their link text without following paths outside the repository',
  { skip: process.platform === 'win32' },
  async (t) => {
    const f = fixture(t);
    symlinkSync('/outside/target', path.join(f.root, 'link'));
    f.commit('base');
    const result = await f.service.compare(f.repository, head, working);
    assert.equal(
      (await f.service.read(f.root, result.base, 'link'))?.toString(),
      '/outside/target',
    );
    assert.equal(
      (await f.service.read(f.root, result.target, 'link'))?.toString(),
      '/outside/target',
    );
  },
);

test('unresolved index merge is reported instead of opening an empty version', async (t) => {
  const f = fixture(t);
  f.write('conflict.txt', 'base\n');
  f.commit('base');
  f.git('checkout', '-qb', 'other');
  f.write('conflict.txt', 'other\n');
  f.commit('other');
  f.git('checkout', '-q', 'main');
  f.write('conflict.txt', 'main\n');
  f.commit('main');
  assert.throws(() => f.git('merge', 'other'));
  await assert.rejects(
    f.service.read(f.root, { kind: 'index', label: 'Index' }, 'conflict.txt'),
    /unresolved merge/,
  );
});

test('submodule revisions show their commit IDs in commit, index, and working versions', async (t) => {
  const module = fixture(t);
  module.write('file.txt', 'first\n');
  const first = module.commit('first');
  module.write('file.txt', 'second\n');
  const second = module.commit('second');
  const f = fixture(t);
  f.git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', module.root, 'vendor/module');
  f.git('-C', 'vendor/module', 'checkout', '-q', first);
  f.commit('submodule base');
  f.git('-C', 'vendor/module', 'checkout', '-q', second);
  f.git('add', 'vendor/module');
  const result = await f.service.compare(f.repository, head, working);
  assert.deepEqual(
    result.files.map((file) => [file.path, file.status]),
    [['vendor/module', 'M']],
  );
  assert.equal(
    (await f.service.read(f.root, result.base, 'vendor/module'))?.toString(),
    `Submodule commit ${first}\n`,
  );
  assert.equal(
    (await f.service.read(f.root, result.target, 'vendor/module'))?.toString(),
    `Submodule commit ${second}\n`,
  );
  assert.equal(
    (await f.service.read(f.root, { kind: 'index', label: 'Index' }, 'vendor/module'))?.toString(),
    `Submodule commit ${second}\n`,
  );
});

test('direct branch comparisons work even with unrelated histories', async (t) => {
  const f = fixture(t);
  f.write('old.txt', 'old');
  const old = f.commit('old');
  f.git('checkout', '--orphan', 'unrelated');
  f.git('rm', '-rf', '.');
  f.write('new.txt', 'new');
  const next = f.commit('new');
  assert.deepEqual(
    (
      await f.service.compare(
        f.repository,
        { kind: 'revision', ref: old },
        { kind: 'revision', ref: next },
      )
    ).files.map((file) => file.status),
    ['A', 'D'],
  );
});

test('repository discovery supports a linked worktree and a folder containing spaces', async (t) => {
  const f = fixture(t);
  f.write('a.txt', 'base');
  f.commit('base');
  const worktree = path.join(f.root, 'linked worktree');
  f.git('worktree', 'add', '-qb', 'linked', worktree);
  const repository = await f.service.repository(worktree);
  assert.equal(path.resolve(repository.path), realpathSync(worktree));
  assert.equal((await f.service.compare(repository, head, working)).files.length, 0);
});

test('path validation prevents reads outside a repository', () => {
  assert.throws(() => safePath('/repo', '../outside'), /outside/);
  assert.throws(() => safePath('/repo', '/absolute'), /Invalid/);
  assert.throws(() => safePath('/repo', 'null\0path'), /Invalid/);
});

test('parser rejects truncated records and preserves both paths of a reversed rename', () => {
  assert.throws(() => parseNameStatus('R100\0old.txt\0'), /incomplete/);
  assert.deepEqual(parseNameStatus('R100\0new.txt\0old.txt\0')[0], {
    path: 'old.txt',
    status: 'R',
    basePath: 'new.txt',
    targetPath: 'old.txt',
  });
});

test('path and status filters match all terms without interpreting regular expressions', () => {
  const file = {
    path: 'src/[file].ts',
    status: 'M' as const,
    basePath: 'src/[file].ts',
    targetPath: 'src/[file].ts',
  };
  assert.equal(matchesFilter(file, 'SRC modified [file]'), true);
  assert.equal(matchesFilter(file, 'src deleted'), false);
});
