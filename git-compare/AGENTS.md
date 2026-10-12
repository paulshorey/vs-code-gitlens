# Git Compare

Independent extension; no imports from the legacy parent source. Git code has no VS Code dependency. UI code uses stable VS Code APIs and the `gitcompare` namespace.

Run `npm ci`, `npm test`, `npm run build`, and `npm run package` in this folder. `npm run test:editor -- --editor=code` or `--editor=cursor` tests the installed IDE in a fresh temporary profile. Git comparisons are read-only; preserve NUL-delimited paths, explicit endpoint direction, and actionable errors.
