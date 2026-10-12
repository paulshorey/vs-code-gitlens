import { context } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
const build = await context({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  sourcemap: true,
  minify: !process.argv.includes('--watch'),
  legalComments: 'eof',
  logLevel: 'info',
});
if (process.argv.includes('--watch')) await build.watch();
else {
  await build.rebuild();
  await build.dispose();
}
