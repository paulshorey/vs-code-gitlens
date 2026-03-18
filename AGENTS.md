# GitLens Codebase Overview

VS Code extension for Git visualization (blame, history, diff). Kylin fork of eamodio/vscode-gitlens v11.7.0.

## Child Folders & Key Files

| Folder / File | Purpose |
|---------------|---------|
| **src/** | Main extension source; see `src/AGENTS.md` |
| **resources/** | Chart.js bundles, logo; used by Kylin commit chart webviews |
| **scripts/** | Empty (build scripts removed) |
| **images/** | Extension icons, view SVGs, theme assets |
| **.vscode/** | Launch config, tasks |
| **test/** | Extension tests |
| **package.json** | Extension manifest, commands, activation events |
| **webpack.config.js** | Bundles extension + webviews with CSP |

## Flow

```
extension.ts → Container → gitService, config, views
            → mainController → Commit.ts → chart panels
            → registerCommands → commands/*.ts
```

## Documentation - AGENTS.md files

Most folders have an AGENTS.md file - with some minimal documentation. Keep this documentation up to date. If you can improve it, please improve with your latest understanding about that folder. Keep it concise. Remove any inconsistent or outdated content.