# Project: Git Compare

The active independent extension is [git-compare/](git-compare/), with its own
manifest, dependencies, build, tests, and [agent guide](git-compare/AGENTS.md).
It imports no legacy GitLens source; build and package from that folder.

## Active extension

Use stable VS Code APIs and the `gitcompare` namespace; keep Git logic independent
of VS Code. Comparisons are read-only. Preserve NUL-delimited paths, explicit
endpoint direction, and actionable errors. Run `npm ci`, `npm test`, `npm run build`,
and `npm run package` in `git-compare/`; its guide covers installed-editor tests.

## Retained legacy fork

Root `src/` and `package.json` belong to the pruned GitLens Search & Compare fork.
Start legacy work in `src/views/searchAndCompareView.ts`, `src/container.ts`, and
`src/config.ts`; settings keys must match the manifest. Prune/cleanup helpers live
in `scripts/`. Legacy build uses `npm run build` / `npm run bundle` and the root
Artifactory configuration (`refresh-jfrog` for 401 errors).

Do not restore removed decorations, webviews, modes, Live Share, or other sidebar
views without their handlers. Keep folder guides aligned when pruning features.

# Research and report

If something goes wrong, stop the affected operation and report relevant findings, data, and logs.
Redact secrets and private content.
If unsure about something, research, search the web, find latest techniques and best practices.

# Next steps

Consider what was recently done, what's in progress, and how it contributes to the goal.
Decide and recommend what to do next.

# Goal: Make repository and reference comparisons clear, fast, and read-only
