import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ComparisonService } from '../src/git/comparisons.js';
import { GitClient } from '../src/git/client.js';

export class Fixture {
  readonly root = mkdtempSync(path.join(os.tmpdir(), 'git-compare-test-'));
  readonly client = new GitClient();
  readonly service = new ComparisonService(this.client);
  readonly repository = { path: this.root, name: path.basename(this.root) };

  constructor(objectFormat?: string) {
    this.git(
      'init',
      '-q',
      '-b',
      'main',
      ...(objectFormat ? [`--object-format=${objectFormat}`] : []),
    );
    this.git('config', 'user.name', 'Git Compare Test');
    this.git('config', 'user.email', 'git-compare@example.invalid');
    this.git('config', 'commit.gpgsign', 'false');
    this.git('config', 'core.autocrlf', 'false');
    mkdirSync(path.join(this.root, '.empty-hooks'));
    this.git('config', 'core.hooksPath', path.join(this.root, '.empty-hooks'));
  }

  git(...args: string[]): string {
    return execFileSync('git', args, {
      cwd: this.root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: os.devNull,
      },
    }).trimEnd();
  }

  write(file: string, content: string | Buffer): void {
    const fullPath = path.join(this.root, file);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }

  commit(message: string): string {
    this.git('add', '-A');
    this.git('commit', '-qm', message);
    return this.git('rev-parse', 'HEAD');
  }

  dispose(): void {
    this.client.dispose();
    rmSync(this.root, { recursive: true, force: true });
  }
}
