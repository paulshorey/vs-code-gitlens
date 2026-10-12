# Git Compare

A small, independent Git comparison extension for **VS Code and Cursor**. Choose a repository, a base version, and a target version; browse the changed files and click one to open the editor's native diff.

This implementation is in its own folder and imports no code from the legacy GitLens extension. Its extension ID is `PaulShorey.git-compare`, and all commands and settings use the `gitcompare` namespace.

## Install and compare

1. In your IDE's Extensions view, use **Install from VSIX…** and select `artifacts/git-compare-1.0.0.vsix`.
2. Open a trusted repository folder in the editor. In Cursor, use an editor workspace, rather than the agent-only home screen.
3. Click **Git Compare** in the activity bar, or run **Git Compare: Focus Comparisons**.
4. Click **Compare References…**. Choose the repository, **Base (left)**, and **Target (right)**.
5. Expand folders and click a changed file to open its diff.

The default focus shortcut is **Cmd+Option+G** on macOS and **Ctrl+Alt+G** on Windows/Linux. You can assign your existing shortcut to `gitcompare.focus` or `gitcompare.comparisons.focus` in Keyboard Shortcuts. The old `gitlens.*` shortcut IDs belong to the legacy extension.

## What you can compare

| Endpoint                      | Meaning                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| HEAD                          | Current commit; an empty tree if the repository has no commits yet                       |
| Branch, remote branch, or tag | The selected local Git reference; no network access is required                          |
| Entered reference             | A commit hash or expression such as `HEAD~3`, `main`, or `origin/main`                   |
| Working Tree                  | Saved local files, including staged and unstaged changes and non-ignored untracked files |
| Index                         | Staged file contents                                                                     |

Examples: **HEAD → Working Tree**, **main → feature**, **an old commit → Working Tree**, **HEAD → Index**, and **Index → Working Tree**.

Comparisons use the two selected endpoints directly, rather than a merge base. Committed references are resolved to object IDs during each refresh. Historical diffs remain tied to those resolved commits until you refresh and reopen them.

Local diff tabs are **read-only views of saved contents**, so unsaved editor changes are excluded. Save first to include an edit, then refresh or reopen the file's diff. Use **Open Working File** from a file's context menu to edit the actual file. This avoids disagreement between Git's saved-file list and an unsaved editor buffer.

## Comparison controls

- **Swap Base and Target** reverses the comparison, including added/deleted statuses and rename paths.
- **Change References…** edits an existing comparison.
- **Pin Comparison** keeps it when using **Clear Unpinned Comparisons**.
- **Filter Changed Files…** matches paths and statuses. All space-separated terms must match; clear the input to reset the filter.
- **Toggle Tree / List** changes file layout.
- **Open All Changes** opens the visible, filtered files in individual diff tabs.
- **Compare Folder…**, also available on folders in Explorer, restricts a comparison to that repository subfolder.
- Multiple repositories and comparisons can be open together. Comparisons restore when reopening the same workspace.

The extension reads Git data. It does not checkout branches, stage files, fetch, push, reset, or change repository history. Binary contents and encodings are passed to the native editor as bytes. Symlinks show their link text; submodules show their commit IDs. Files larger than 64 MiB report an explicit limit instead of attempting to load them.

## Settings

| Setting                       | Default | Purpose                                                                 |
| ----------------------------- | ------- | ----------------------------------------------------------------------- |
| `gitcompare.files.layout`     | `tree`  | Folder tree or flat file list                                           |
| `gitcompare.autoRefresh`      | `true`  | Refresh after saves, filesystem/ref changes, and regaining window focus |
| `gitcompare.includeUntracked` | `true`  | Include non-ignored untracked files in local comparisons                |
| `gitcompare.keepComparisons`  | `true`  | Restore all comparisons; when disabled, restore only pins               |
| `gitcompare.gitPath`          | empty   | Override Git executable discovery                                       |

Errors appear on the comparison itself and in the **Git Compare** output channel. An invalid reference or Git failure is not presented as “No changed files.” Git must be installed in the extension host's environment. Remote SSH/container workspaces run the extension beside their repository; virtual repositories without a filesystem/Git process are not supported.

## Develop and package

Use Node.js 22 or newer and npm. Dependencies and build configuration are independent of the parent project.

```sh
cd git-compare
npm ci
npm run format:check
npm test
npm run build
npm run package
```

The VSIX is written to `artifacts/git-compare-1.0.0.vsix`. Packaging runs the comparison tests and builds/typechecks the production bundle. There are **no runtime npm dependencies**.

```sh
npm run watch
npm run test:editor -- --editor=code
npm run test:editor -- --editor=cursor
node scripts/editor-test.mjs --editor=code --vsix=artifacts/git-compare-1.0.0.vsix
node scripts/editor-test.mjs --editor=cursor --vsix=artifacts/git-compare-1.0.0.vsix
```

Editor tests use the installed IDE with a temporary profile, workspace, and extensions directory. They do not install into your regular profile. The `--vsix` option extracts and tests the exact packaged artifact, writing a JSON validation report and VSIX SHA-256 to `artifacts/`. On macOS/Linux that option requires `unzip`; on Windows it uses PowerShell. On other operating systems, set `VSCODE_EXECUTABLE_PATH` to the editor executable. Open this folder as its own workspace and use the included launch configuration to debug with F5.

The Git fixture suite covers endpoint directions, rename paths, untracked and ignored files, staged/index comparisons, literal unusual filenames, folder restrictions, empty repositories, SHA-256 repositories, binary data, symlinks, conflicts, unrelated histories, and worktrees. Editor tests cover cold activation, commands, focus, native diff contents, pinning, clearing, swapping, refresh, and removal.

See [COMPATIBILITY.md](COMPATIBILITY.md) for the researched compatibility choices and validation scope.

## Architecture

- `src/git/` runs argument-array Git commands, resolves references, parses NUL-delimited file records, and provides read-only revision contents.
- `src/ui/` contains repository/reference pickers and the native tree provider.
- `src/controller.ts` manages comparisons, commands, refreshes, and workspace storage.
- `src/extension.ts` registers the small application immediately. Git discovery happens after the view and commands exist.

MIT licensed. The interaction design is derived from the Search & Compare feature in the older GitLens fork; the implementation is newly written.
