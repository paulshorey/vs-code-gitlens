import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  ChangedFile,
  ChangeStatus,
  ComparisonResult,
  Endpoint,
  Repository,
  ResolvedEndpoint,
} from '../types.js';
import { GitClient, GitError } from './client.js';

export function safePath(repoPath: string, relativePath: string): string {
  if (!relativePath || relativePath.includes('\0') || path.isAbsolute(relativePath)) {
    throw new Error('Invalid repository-relative path.');
  }
  const fullPath = path.resolve(repoPath, relativePath);
  const relative = path.relative(repoPath, fullPath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('The file is outside the selected repository.');
  }
  return fullPath;
}

export function parseNameStatus(data: string): ChangedFile[] {
  const tokens = data.split('\0');
  const files: ChangedFile[] = [];
  for (let i = 0; i < tokens.length;) {
    const raw = tokens[i++];
    if (!raw) continue;
    const status = raw[0] as ChangeStatus;
    if (!['A', 'D', 'M', 'R', 'C', 'T', 'U'].includes(status)) {
      throw new Error(`Unexpected Git change status: ${raw}`);
    }
    const first = tokens[i++];
    if (!first) throw new Error('Git returned an incomplete changed-file record.');
    if (status === 'R' || status === 'C') {
      const second = tokens[i++];
      if (!second) throw new Error('Git returned an incomplete rename record.');
      files.push({ status, path: second, basePath: first, targetPath: second });
    } else {
      files.push({
        status,
        path: first,
        ...(status === 'A' ? {} : { basePath: first }),
        ...(status === 'D' ? {} : { targetPath: first }),
      });
    }
  }
  return files;
}

export class ComparisonService {
  constructor(readonly git: GitClient) {}

  async repository(folder: string, limitToFolder = false): Promise<Repository> {
    const physicalFolder = await fs.realpath(folder);
    const repoPath = (
      await this.git.text(physicalFolder, ['rev-parse', '--show-toplevel'])
    ).replace(/\r?\n$/, '');
    if (!repoPath) throw new Error('This folder is not in a Git working repository.');
    const scope = path.relative(repoPath, physicalFolder).split(path.sep).join('/');
    if (scope && (scope === '..' || scope.startsWith('../')))
      throw new Error('The folder is outside its repository.');
    return {
      path: repoPath,
      name: path.basename(repoPath),
      ...(limitToFolder && scope ? { scope } : {}),
    };
  }

  async references(
    repository: Repository,
  ): Promise<{ ref: string; kind: string; current: boolean }[]> {
    const data = await this.git.text(repository.path, [
      'for-each-ref',
      '--sort=-committerdate',
      '--format=%(refname)%00%(HEAD)',
      'refs/heads',
      'refs/remotes',
      'refs/tags',
    ]);
    return data
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        const [fullRef, head] = line.split('\0');
        if (!fullRef || fullRef.endsWith('/HEAD')) return [];
        const kind = fullRef.startsWith('refs/heads/')
          ? 'Branch'
          : fullRef.startsWith('refs/remotes/')
            ? 'Remote branch'
            : 'Tag';
        return [{ ref: fullRef, kind, current: head?.trim() === '*' }];
      });
  }

  async resolve(repository: Repository, endpoint: Endpoint): Promise<ResolvedEndpoint> {
    if (endpoint.kind !== 'revision') {
      return { ...endpoint, label: endpoint.kind === 'working' ? 'Working Tree' : 'Index' };
    }
    try {
      const oid = (
        await this.git.text(repository.path, [
          'rev-parse',
          '--verify',
          '--end-of-options',
          `${endpoint.ref}^{commit}`,
        ])
      ).trim();
      return { kind: 'commit', ref: endpoint.ref, oid, label: displayRef(endpoint.ref) };
    } catch (error) {
      // HEAD in a newly initialized repository represents an empty tree.
      if (endpoint.ref === 'HEAD' && error instanceof GitError) {
        const symbolic = await this.git
          .text(repository.path, ['symbolic-ref', '--quiet', 'HEAD'])
          .catch(() => '');
        if (symbolic.trim()) {
          const existing = await this.git
            .text(repository.path, ['rev-parse', '--verify', '--quiet', symbolic.trim()])
            .catch((e) => {
              if (e instanceof GitError && e.exitCode === 1) return '';
              throw e;
            });
          if (!existing.trim()) {
            const oid = (
              await this.git.run(repository.path, ['hash-object', '-t', 'tree', '--stdin'], '')
            )
              .toString('utf8')
              .trim();
            return { kind: 'commit', ref: 'HEAD', oid, label: 'HEAD (empty repository)' };
          }
        }
      }
      throw new Error(
        `Cannot resolve reference “${endpoint.ref}”. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async compare(
    repository: Repository,
    base: Endpoint,
    target: Endpoint,
    includeUntracked = true,
  ): Promise<ComparisonResult> {
    const [left, right] = await Promise.all([
      this.resolve(repository, base),
      this.resolve(repository, target),
    ]);
    const args = [
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      '--no-ext-diff',
      '--no-textconv',
      '--no-color',
      '--ignore-submodules=none',
    ];
    if (
      left.kind === right.kind &&
      (left.kind !== 'commit' || (right.kind === 'commit' && left.oid === right.oid))
    ) {
      return { base: left, target: right, files: [] };
    }
    if (left.kind === 'commit' && right.kind === 'commit') args.push(left.oid, right.oid);
    else if (left.kind === 'commit')
      args.push(...(right.kind === 'index' ? ['--cached'] : []), left.oid);
    else if (right.kind === 'commit')
      args.push('-R', ...(left.kind === 'index' ? ['--cached'] : []), right.oid);
    else if (left.kind === 'working') args.push('-R');
    args.push('--', ...(repository.scope ? [repository.scope] : []));
    const files = parseNameStatus(await this.git.text(repository.path, args));
    if (includeUntracked && (left.kind === 'working' || right.kind === 'working')) {
      const untracked = (
        await this.git.text(repository.path, [
          'ls-files',
          '--others',
          '--exclude-standard',
          '-z',
          '--',
          ...(repository.scope ? [repository.scope] : []),
        ])
      )
        .split('\0')
        .filter(Boolean);
      const other = left.kind === 'working' ? right : left;
      for (const filePath of untracked) {
        // An index deletion can leave a file untracked that still exists in the chosen commit.
        const [oldContent, newContent] = await Promise.all([
          this.read(repository.path, other, filePath),
          this.read(repository.path, { kind: 'working', label: 'Working Tree' }, filePath),
        ]);
        const existing = files.findIndex((file) => file.path === filePath);
        if (existing >= 0) files.splice(existing, 1);
        if (oldContent && newContent && oldContent.equals(newContent)) continue;
        files.push({
          path: filePath,
          status: oldContent ? 'M' : left.kind === 'working' ? 'D' : 'A',
          untracked: true,
          ...(oldContent || left.kind === 'working' ? { basePath: filePath } : {}),
          ...(oldContent || right.kind === 'working' ? { targetPath: filePath } : {}),
        });
      }
    }
    return { base: left, target: right, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
  }

  /** Undefined means this path is absent; process and permission errors remain errors. */
  async read(
    repoPath: string,
    endpoint: ResolvedEndpoint,
    filePath: string,
  ): Promise<Buffer | undefined> {
    const fullPath = safePath(repoPath, filePath);
    if (endpoint.kind === 'working') {
      try {
        const stat = await fs.lstat(fullPath);
        if (stat.isSymbolicLink()) return Buffer.from(await fs.readlink(fullPath));
        if (stat.isDirectory()) {
          const root = (await this.git.text(fullPath, ['rev-parse', '--show-toplevel'])).replace(
            /\r?\n$/,
            '',
          );
          if ((await fs.realpath(root)) !== (await fs.realpath(fullPath)))
            return Buffer.from('Submodule (not checked out)\n');
          return Buffer.from(
            `Submodule commit ${(await this.git.text(fullPath, ['rev-parse', 'HEAD'])).trim()}\n`,
          );
        }
        if (stat.size > 64 * 1024 * 1024)
          throw new Error('This file exceeds the 64 MiB comparison limit.');
        return await fs.readFile(fullPath);
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
    }
    let mode: string | undefined;
    let oid: string | undefined;
    if (endpoint.kind === 'commit') {
      const records = (
        await this.git.text(repoPath, ['ls-tree', '-z', endpoint.oid, '--', filePath])
      ).split('\0');
      const record = records.find((value) => value.slice(value.indexOf('\t') + 1) === filePath);
      if (!record) return undefined;
      const fields = record.slice(0, record.indexOf('\t')).split(' ');
      mode = fields[0];
      oid = fields[2];
    } else {
      const records = (
        await this.git.text(repoPath, ['ls-files', '--stage', '-z', '--', filePath])
      ).split('\0');
      const record = records.find(
        (value) =>
          value.slice(value.indexOf('\t') + 1) === filePath && value.split('\t')[0]?.endsWith(' 0'),
      );
      if (!record) {
        if (records.some((value) => value.slice(value.indexOf('\t') + 1) === filePath)) {
          throw new Error(
            'This file has an unresolved merge in the index. Compare with Working Tree instead.',
          );
        }
        return undefined;
      }
      [mode, oid] = record.slice(0, record.indexOf('\t')).split(' ');
    }
    if (!oid || !/^[0-9a-f]{40,64}$/.test(oid))
      throw new Error('Git returned an invalid object ID.');
    if (mode === '160000') return Buffer.from(`Submodule commit ${oid}\n`);
    return this.git.run(repoPath, ['cat-file', 'blob', oid]);
  }
}

export function displayRef(ref: string): string {
  return ref.replace(/^refs\/(heads|remotes|tags)\//, '');
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}
