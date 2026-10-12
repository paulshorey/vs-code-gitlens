import * as vscode from 'vscode';
import type { Repository, ResolvedEndpoint } from '../types.js';
import { ComparisonService } from './comparisons.js';

const scheme = 'gitcompare-revision';
interface RevisionData {
  repoPath: string;
  endpoint: ResolvedEndpoint;
  filePath: string;
  empty: boolean;
  version: string;
}

/** Byte-preserving, read-only file contents; the editor handles encoding and binary files. */
export class RevisionFileSystem implements vscode.FileSystemProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;
  private readonly cache = new Map<string, Uint8Array>();
  private readonly pending = new Map<string, Promise<Uint8Array>>();
  private cachedBytes = 0;
  private readonly registration: vscode.Disposable;

  constructor(private readonly service: ComparisonService) {
    this.registration = vscode.workspace.registerFileSystemProvider(scheme, this, {
      isCaseSensitive: true,
      isReadonly: true,
    });
  }

  uri(
    repository: Repository,
    endpoint: ResolvedEndpoint,
    filePath: string,
    version: string,
    empty = false,
  ): vscode.Uri {
    const authority = empty
      ? 'absent'
      : endpoint.kind === 'commit'
        ? endpoint.oid.slice(0, 10)
        : endpoint.kind;
    return vscode.Uri.from({
      scheme,
      authority,
      path: `/${repository.name}/${filePath}`,
      query: JSON.stringify({
        repoPath: repository.path,
        endpoint,
        filePath,
        empty,
        version,
      } satisfies RevisionData),
    });
  }

  private data(uri: vscode.Uri): RevisionData {
    try {
      const value: unknown = JSON.parse(uri.query);
      if (
        typeof value !== 'object' ||
        !value ||
        !('repoPath' in value) ||
        typeof value.repoPath !== 'string' ||
        !('filePath' in value) ||
        typeof value.filePath !== 'string' ||
        !('endpoint' in value) ||
        typeof value.endpoint !== 'object' ||
        !value.endpoint ||
        !('kind' in value.endpoint) ||
        !['commit', 'working', 'index'].includes(String(value.endpoint.kind))
      )
        throw new Error();
      const data = value as RevisionData;
      if (data.endpoint.kind === 'commit' && !/^[0-9a-f]{40,64}$/.test(data.endpoint.oid))
        throw new Error();
      return data;
    } catch {
      throw vscode.FileSystemError.Unavailable('Invalid Git Compare revision URI.');
    }
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const key = uri.toString();
    const cached = this.cache.get(key);
    if (cached) return cached;
    const running = this.pending.get(key);
    if (running) return running;
    const operation = this.load(uri);
    this.pending.set(key, operation);
    try {
      const content = await operation;
      while (
        this.cache.size &&
        (this.cache.size >= 128 || this.cachedBytes + content.byteLength > 32 * 1024 * 1024)
      ) {
        const oldest = this.cache.keys().next().value as string;
        this.cachedBytes -= this.cache.get(oldest)!.byteLength;
        this.cache.delete(oldest);
      }
      if (content.byteLength <= 32 * 1024 * 1024) {
        this.cache.set(key, content);
        this.cachedBytes += content.byteLength;
      }
      return content;
    } finally {
      this.pending.delete(key);
    }
  }

  private async load(uri: vscode.Uri): Promise<Uint8Array> {
    const data = this.data(uri);
    if (data.empty) return new Uint8Array();
    try {
      const content = await this.service.read(data.repoPath, data.endpoint, data.filePath);
      if (!content) throw vscode.FileSystemError.FileNotFound(uri);
      return content;
    } catch (error) {
      if (error instanceof vscode.FileSystemError) throw error;
      throw vscode.FileSystemError.Unavailable(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const data = await this.readFile(uri);
    return {
      type: vscode.FileType.File,
      size: data.byteLength,
      ctime: 0,
      mtime: 0,
      permissions: vscode.FilePermission.Readonly,
    };
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }
  readDirectory(): [string, vscode.FileType][] {
    throw vscode.FileSystemError.NoPermissions('Revision folders cannot be browsed.');
  }
  createDirectory(): never {
    throw vscode.FileSystemError.NoPermissions();
  }
  writeFile(): never {
    throw vscode.FileSystemError.NoPermissions();
  }
  delete(): never {
    throw vscode.FileSystemError.NoPermissions();
  }
  rename(): never {
    throw vscode.FileSystemError.NoPermissions();
  }
  dispose(): void {
    this.registration.dispose();
    this.emitter.dispose();
    this.cache.clear();
  }
}
