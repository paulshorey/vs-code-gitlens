# views/nodes

Tree node classes for the Search & Compare view. Each node extends `ViewNode`. Only the
compare/search-reachable nodes remain after the multi-view removal.

- **viewNode.ts** - Base `ViewNode`/`ViewRefNode`/`ViewRefFileNode`; `getRepoNodeId()` helper for stable repo-scoped ids
- **common.ts** - Shared node helpers (`MessageNode`, `LoadMoreNode`, etc.)
- **helpers.ts** - Node helpers (e.g. `insertDateMarkers`)
- **comparePickerNode.ts** - The "Compare ref with ref" picker entry
- **compareResultsNode.ts** - A comparison result (commits + files children)
- **searchResultsNode.ts** - A search result
- **resultsCommitsNode.ts** - Commits group under a result
- **resultsFilesNode.ts** / **resultsFileNode.ts** - Files-changed group / individual file (opens the diff)
- **commitNode.ts** / **commitFileNode.ts** - Commit and its files (under Ahead/Behind)
- **folderNode.ts** - Folder grouping for tree file layout
- **pullRequestNode.ts** - Associated pull request

Consider these rules if they affect your changes.
