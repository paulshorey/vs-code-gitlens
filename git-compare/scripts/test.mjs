import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdir, mkdir } from 'node:fs/promises';

await mkdir('.test-dist', { recursive: true });
const tests = (await readdir('test')).filter((name) => name.endsWith('.test.ts'));
await build({
  entryPoints: tests.map((name) => `test/${name}`),
  outdir: '.test-dist',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
});
const result = spawnSync(
  process.execPath,
  ['--test', ...tests.map((name) => `.test-dist/${name.replace(/\.ts$/, '.cjs')}`)],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
