# GitLens Codebase Overview

VS Code extension forked from `eamodio/vscode-gitlens` with PaulShorey-specific chart panels.

## Key Files

| Path               | Purpose                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- |
| `package.json`     | Extension manifest: commands, settings, menus, view containers, default view visibility |
| `src/extension.ts` | Activation, git availability checks, command registration, forced view restoration      |
| `src/container.ts` | Shared services and singleton view instances                                            |
| `src/views/`       | Tree views, including `Search & Compare`                                                |
| `src/commands/`    | Command handlers such as show/focus and view layout commands                            |
| `resources/`       | Static assets for webviews/charts                                                       |

## Activation Flow

`extension.ts` initializes Git, sets context keys, creates the `Container`, then registers commands and views.

## View Model

- View contributions live in `package.json`
- Tree view behavior lives in `src/views/`
- `gitlens.showSearchAndCompareView` routes through `src/commands/showView.ts`
- Default layout is the GitLens activity bar container and activation resets GitLens views back there

## Most important feature

The most important part of this VS Code extension is the "Search and Compare View" (`gitlens.views.searchAndCompare`). Make sure this view is supported and reliable. Other views will be removed in a future refactor.

Search And Compare View:

- User clicks "Compare References"
- if IDE workspaces contains multiple repositories, user is first shown the "Choose a repository" modal selection dropdown
- then a "Choose a reference to compare..." modal selection dropdown
- then a final "Choose a reference to compare with..." modal selection dropdown
- After the repository, compare, and with options are selected, a new "Comparing A with B" UI content appears in the panel. This shows changed files.
- User clicks on each file to see changes in the main editor tab. Changes are shown (green for additions, red for deletions).
- User is also able to add other repositories and references to compare.

This view is shown in the primary sidebar, by default. User is able to drag the tab to the Panel instead.

## Docs

Keep nearby `AGENTS.md` files concise and aligned with the current code.
