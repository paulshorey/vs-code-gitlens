# GitLens Codebase Overview

VS Code extension forked from `eamodio/vscode-gitlens` with Kylin-specific chart panels.

## Key Files

| Path | Purpose |
|------|---------|
| `package.json` | Extension manifest: commands, settings, menus, view containers, default view visibility |
| `src/extension.ts` | Activation, git availability checks, command registration, forced view restoration |
| `src/container.ts` | Shared services and singleton view instances |
| `src/views/` | Tree views, including `Search & Compare` |
| `src/commands/` | Command handlers such as show/focus and view layout commands |
| `resources/` | Static assets for webviews/charts |

## Activation Flow

`extension.ts` initializes Git, sets context keys, creates the `Container`, then registers commands and views.

## View Model

- View contributions live in `package.json`
- Tree view behavior lives in `src/views/`
- `gitlens.showSearchAndCompareView` routes through `src/commands/showView.ts`
- Default layout is the GitLens activity bar container and activation resets GitLens views back there

## Docs

Keep nearby `AGENTS.md` files concise and aligned with the current code.