# views

This fork ships a single tree view: **Search & Compare**. Base implementation: `viewBase.ts`.
Shared node commands: `viewCommands.ts`.

## Important Files

- `searchAndCompareView.ts` - the only view; compare/search results tree; drives compare diffs opened in the editor
- `viewBase.ts` - common `TreeView` lifecycle, refresh, reveal, focus/show behavior. The `View`/`ViewsWithCommits`/`ViewsWithPullRequests` unions all collapse to `SearchAndCompareView`
- `viewCommands.ts` - registers only the node/file/compare commands reachable from Search & Compare
- `viewDecorationProvider.ts` - file decoration provider for tree items
- `nodes/` - tree node implementations (compare/search-reachable nodes only)

## Behavior Notes

- View definition and default location come from `package.json`
- `ViewBase.show()` is the shared path used by `gitlens.showSearchAndCompareView`
- Search & Compare persists pinned items and keep-results state in workspace storage
- The upstream repositories/commits/branches/remotes/stashes/tags/contributors/file-history/line-history views were removed; `GitActions.*.reveal()` is now a no-op since there is no side-bar tree to reveal into
