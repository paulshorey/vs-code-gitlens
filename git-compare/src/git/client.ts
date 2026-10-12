import { execFile } from 'node:child_process';

export class GitError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | string | undefined,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

/** Only argument arrays are accepted. Never invoke a shell or a Git mutation. */
export class GitClient {
  private executable = 'git';
  private readonly abort = new AbortController();

  setExecutable(executable: string): void {
    this.executable = executable || 'git';
  }

  dispose(): void {
    this.abort.abort();
  }

  async run(repoPath: string, args: readonly string[], input?: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const child = execFile(
        this.executable,
        ['-c', 'core.quotepath=false', '-c', 'diff.autoRefreshIndex=false', ...args],
        {
          cwd: repoPath,
          encoding: 'buffer',
          timeout: 30_000,
          maxBuffer: 64 * 1024 * 1024,
          windowsHide: true,
          signal: this.abort.signal,
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',
            GIT_OPTIONAL_LOCKS: '0',
            GIT_LITERAL_PATHSPECS: '1',
          },
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve(stdout);
            return;
          }
          const detail = stderr.toString('utf8').trim();
          let message = detail || error.message;
          if (error.code === 'ENOENT')
            message = 'Git was not found. Install Git or set Git Compare: Git Path.';
          if (error.killed)
            message = 'Git did not finish within 30 seconds. Try refreshing the comparison.';
          reject(new GitError(message, error.code ?? undefined));
        },
      );
      // Git hash-object uses stdin to calculate the empty-tree ID without writing an object.
      child.stdin?.end(input ?? '');
    });
  }

  async text(repoPath: string, args: readonly string[]): Promise<string> {
    return (await this.run(repoPath, args)).toString('utf8');
  }
}
