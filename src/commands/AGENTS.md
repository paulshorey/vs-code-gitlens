# commands

Command handlers registered through `commands.ts`.

## Important Files

- `common.ts` - command ids, shared helpers, command base class
- `showView.ts` - routes `gitlens.show*View` commands to the matching tree view
- `setViewsLayout.ts` - normalizes all GitLens views back into the GitLens container
- `compareWith.ts`, `diffWith.ts`, `diffWith*.ts` - compare and diff entry points
- `showQuick*.ts`, `quickCommand*.ts` - quick pick driven flows
- `git/` - git action commands (fetch, pull, push, stash, rebase, merge, etc.)

## View Notes

- `gitlens.showSearchAndCompareView` should always resolve to `Container.searchAndCompareView.show()`
- This fork no longer supports alternate top-level view layouts; commands normalize views into one container
