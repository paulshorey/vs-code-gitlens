# commands

Handlers exported from `commands.ts` and registered via `@command()` in `common.ts`.

## Core compare / view

- `showView.ts` — `gitlens.showSearchAndCompareView` only
- `setViewsLayout.ts` — move Search & Compare between GitLens bar and SCM
- `compareWith.ts`, `diffWith*.ts`, `openDirectoryCompare.ts` — diffs
- `searchCommits.ts` — commit search (palette + view)

## Git & remotes

- `gitCommands.ts` + `git/` — branch, merge, rebase, stash, etc.
- `open*OnRemote.ts`, `copy*Remote*.ts` — hosting integrations
- `openFileAtRevision.ts` — includes **Open Blame Prior to Change** (opens prior revision at line; not gutter blame)

## Quick picks

- `showQuick*.ts`, `quickCommand*.ts` — history/status pickers still used from menus

## Removed command families

Annotation toggles, welcome/settings pages, rebase editor, Live Share, show/focus removed views, GitLens modes (`switchMode`, zen/review).
