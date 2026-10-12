# GitLens

The new, independent comparison extension is in **[git-compare/](git-compare/README.md)**.
Use that folder to build and package **Git Compare** for VS Code and Cursor.
The documentation below describes the legacy fork, retained for reference.

VS Code extension for Git visualization. Fork of eamodio/vscode-gitlens (v11.7.0 base) with added commit chart views.

## Features

- Blame annotations (line, gutter, heatmap, changes)
- Code lens for authorship
- Sidebar views: commits, branches, remotes, stashes, tags, file/line history, search & compare
- Diff commands (previous/next revision, working tree)
- Interactive rebase editor
- Remote integration (GitHub, GitLab, etc.)
- PaulShorey extras: `PaulShorey.viewCommits` (repo commit chart), `PaulShorey.viewfilehistory` (file commit chart)

## Build

```bash
pnpm install
pnpm run bundle
```

## Run

Open in VS Code, F5 to debug, or install from `dist/` via "Install from VSIX".
