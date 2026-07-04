# GitLens (PaulShorey fork)

VS Code extension forked from [eamodio/vscode-gitlens](https://github.com/eamodio/vscode-gitlens), scoped to **Search & Compare** — compare git references, list changed files, open diffs in the editor.

## Key paths

| Path | Purpose |
| --- | --- |
| `package.json` | Manifest: one view, commands, menus, settings (~4k lines after pruning) |
| `src/extension.ts` | Activation, git checks, command registration |
| `src/container.ts` | Git service, Search & Compare view, trackers, autolinks |
| `src/views/searchAndCompareView.ts` | Primary feature — compare/search tree |
| `src/config.ts` | Typed settings surface (must match `package.json` keys the code reads) |
| `scripts/prune-package-json.mjs` | Remove dead commands/menus after feature removal |
| `scripts/cleanup-package-json.mjs` | Modes removal, menu `when` cleanup, section renames |

## Removed (do not restore without re-adding handlers)

- Editor decorations: blame, code lens, hovers, status bar blame, gutter heatmap/changes
- Webviews: welcome, settings, rebase editor
- Live Share (`vsls`), standalone `github/` subsystem (GitHub API lives in `git/remotes/githubApi.ts`)
- All sidebar views except **Search & Compare**
- GitLens **modes** (zen/review) — settings toggles had no effect after decoration removal

## Search & Compare flow

1. User runs **Compare References** (or welcome link in empty view)
2. Pick repository (if multi-root), then reference A, then reference B
3. Tree lists changed files; click opens diff in editor (green/red)
4. User can pin comparisons, swap sides, filter files, add more repos/refs

Default location: GitLens activity bar (`gitlens` container). User may drag the view to the panel.

## Build

```bash
npm install          # uses Artifactory via .npmrc; run refresh-jfrog if 401
npm run build        # dev webpack + typecheck
npm run bundle       # production (vscode:prepublish)
npx vsce package --no-dependencies
```

## Docs for agents

Keep folder-level `AGENTS.md` files short and aligned with the code. After removing features, run the prune scripts and update docs in the same change.
