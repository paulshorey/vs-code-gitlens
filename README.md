# GitLens

VS Code extension for Git visualization. Fork of eamodio/vscode-gitlens (v11.7.0 base) with added commit chart views.

## Features

- Blame annotations (line, gutter, heatmap, changes)
- Code lens for authorship
- Sidebar views: commits, branches, remotes, stashes, tags, file/line history, search & compare
- Diff commands (previous/next revision, working tree)
- Interactive rebase editor
- Remote integration (GitHub, GitLab, etc.)
- Kylin extras: `kylin.viewCommits` (repo commit chart), `kylin.viewfilehistory` (file commit chart)

## Build

```bash
yarn install
yarn run bundle
```

## Run

Open in VS Code, F5 to debug, or install from `dist/` via "Install from VSIX".
