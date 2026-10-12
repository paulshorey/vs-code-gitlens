import { build } from 'esbuild';
import { runTests } from '@vscode/test-electron';
import { copyFile, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

const editor = process.argv.find((arg) => arg.startsWith('--editor='))?.split('=')[1] ?? 'code';
if (!['code', 'cursor'].includes(editor)) throw new Error('Use --editor=code or --editor=cursor.');
const vsix = process.argv.find((arg) => arg.startsWith('--vsix='))?.slice('--vsix='.length);
const app = editor === 'cursor' ? 'Cursor' : 'Visual Studio Code';
const executable =
  process.platform === 'darwin'
    ? `/Applications/${app}.app/Contents/MacOS/${editor === 'cursor' ? 'Cursor' : 'Code'}`
    : process.env.VSCODE_EXECUTABLE_PATH;
if (!executable) throw new Error('Set VSCODE_EXECUTABLE_PATH to the installed editor executable.');
await mkdir('.test-dist', { recursive: true });
await build({
  entryPoints: ['test/editor.ts'],
  outfile: '.test-dist/editor.cjs',
  bundle: true,
  external: ['vscode'],
  platform: 'node',
  format: 'cjs',
  target: 'node20',
});
const profile = await mkdtemp(path.join(os.tmpdir(), `git-compare-${editor}-`));
const report = path.join(profile, 'report.json');
const workspace = path.join(profile, 'workspace');
await mkdir(workspace);
let extensionPath = process.cwd();
let sha256;
if (vsix) {
  const archive = path.resolve(vsix);
  sha256 = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  const destination = path.join(profile, 'package');
  if (process.platform === 'win32') {
    const zip = path.join(profile, 'extension.zip');
    await copyFile(archive, zip);
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Expand-Archive -LiteralPath $env:GIT_COMPARE_ARCHIVE -DestinationPath $env:GIT_COMPARE_DESTINATION',
      ],
      { env: { ...process.env, GIT_COMPARE_ARCHIVE: zip, GIT_COMPARE_DESTINATION: destination } },
    );
  } else {
    execFileSync('unzip', ['-q', archive, '-d', destination]);
  }
  extensionPath = path.join(destination, 'extension');
}
await runTests({
  vscodeExecutablePath: executable,
  extensionDevelopmentPath: extensionPath,
  extensionTestsPath: path.resolve('.test-dist/editor.cjs'),
  extensionTestsEnv: { GIT_COMPARE_REPORT: report },
  launchArgs: [
    workspace,
    '--user-data-dir',
    path.join(profile, 'user'),
    '--extensions-dir',
    path.join(profile, 'extensions'),
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    '--new-window',
  ],
});
const validation = {
  ...JSON.parse(await readFile(report, 'utf8')),
  testedAt: new Date().toISOString(),
  source: vsix ? 'packaged VSIX' : 'development bundle',
  ...(sha256 ? { sha256 } : {}),
};
if (vsix) {
  await mkdir('artifacts', { recursive: true });
  const validationPath = path.resolve(`artifacts/validation-${editor}.json`);
  await writeFile(validationPath, `${JSON.stringify(validation, null, 2)}\n`);
  console.log(`Saved validation: ${validationPath}`);
}
console.log(JSON.stringify(validation, null, 2));
console.log(`Editor test profile and logs: ${profile}`);
