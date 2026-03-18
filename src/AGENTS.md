# src

Extension source. Entry point: `extension.ts`. Shared singleton: `container.ts`.

## Main Areas

| Folder | Purpose |
|--------|---------|
| `commands/` | Command handlers, including view show/layout commands |
| `git/` | Git execution, models, parsers, remotes |
| `views/` | Tree views such as `Search & Compare` |
| `webviews/` | Welcome/settings/rebase webviews |
| `controllers/`, `services/` | Kylin-specific chart panels |
| `annotations/`, `hovers/`, `codelens/`, `statusbar/` | Editor UI integrations |

## Important Files

- `extension.ts` wires activation, git checks, welcome state, and command registration
- `container.ts` owns view instances like `searchAndCompareView`
- `configuration.ts` exposes `gitlens.*` settings
- `constants.ts` defines context keys used by menus and views

## View Notes

- Manifest contributions are in `package.json`
- Runtime tree behavior is in `views/`
- `Search & Compare` is the key compare/search pane and is shown via `gitlens.showSearchAndCompareView`
