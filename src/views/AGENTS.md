# views

Tree views for the extension. Base implementation: `viewBase.ts`. Shared commands: `viewCommands.ts`.

## Important Files

- `searchAndCompareView.ts` - compare/search results tree; drives compare diffs opened in the editor
- `viewBase.ts` - common `TreeView` lifecycle, refresh, reveal, focus/show behavior
- `repositoriesView.ts`, `commitsView.ts`, `branchesView.ts` - main repository/history panes
- `nodes/` - tree node implementations used by all views
- `commits-panel/` - Kylin chart-based panels

## Behavior Notes

- View definitions and default locations come from `package.json`
- `ViewBase.show()` is the shared path used by commands like `gitlens.showSearchAndCompareView`
- Search & Compare persists pinned items and keep-results state in workspace storage
