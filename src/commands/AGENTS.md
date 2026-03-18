# commands

Command handlers registered through `commands.ts`.

## Important Files

- `common.ts` - command ids, shared helpers, command base class
- `showView.ts` - routes `gitlens.show*View` commands to the matching tree view
- `setViewsLayout.ts` - moves GitLens views between the GitLens container and Source Control
- `compareWith.ts`, `diffWith.ts`, `diffWith*.ts` - compare and diff entry points
- `showQuick*.ts`, `quickCommand*.ts` - quick pick driven flows
- `git/` - git action commands (fetch, pull, push, stash, rebase, merge, etc.)

## View Notes

- `gitlens.showSearchAndCompareView` should always resolve to `Container.searchAndCompareView.show()`
- Layout changes should keep related views together to avoid split-pane confusion
