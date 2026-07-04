# src

Extension source. Entry: `extension.ts`. Shared singleton: `container.ts`.

## Layout

| Folder | Purpose |
| --- | --- |
| `commands/` | Command handlers (compare, diff, git palette, show view) |
| `git/` | Git execution, models, remotes, formatters |
| `views/` | **Search & Compare** tree only |
| `annotations/` | **`autolinks.ts` only** — PR/issue link patterns for remotes + commit formatting |
| `quickpicks/` | Compare/search/repo/commit pickers (no mode picker) |
| `trackers/` | Active editor git line/document tracking |
| `api/` | Extension API surface |

## Not present (removed)

`webviews/`, `codelens/`, `hovers/`, `statusbar/`, `terminal/`, `vsls/`, `github/`, `controllers/`, `services/`, `views/commits-panel/`

## Settings

- Runtime reads: `configuration.ts` + typed `config.ts`
- Manifest defaults: `package.json` → `contributes.configuration`
- After pruning settings, verify keys against `grep configuration.get` / `Container.config`

## Primary command

`gitlens.showSearchAndCompareView` → `showView.ts` → `Container.searchAndCompareView.show()`
