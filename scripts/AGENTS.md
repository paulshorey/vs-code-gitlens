# scripts

- **`prune-package-json.mjs`** — Removes dead view commands, menus, keybindings, submenus, activation events, and annotation theme colors from `package.json`. Run after deleting view classes or command handlers.

- **`cleanup-package-json.mjs`** — Second pass: drop Modes settings/commands, strip obsolete `config.gitlens.menus.*` from menu `when` clauses, merge mislabeled sorting sections, update description/keywords.

Typical sequence after a feature removal:

```bash
node scripts/prune-package-json.mjs
node scripts/cleanup-package-json.mjs
npm run bundle
```
