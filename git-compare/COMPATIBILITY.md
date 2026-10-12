# Compatibility decisions

Researched on October 8, 2026. The installed IDEs inspected for this implementation are Cursor **3.23.23**, whose `product.json` reports VS Code **1.128.0**, and VS Code **1.136.1**.

## Editor and API differences

Cursor's application version and its VS Code API version are different numbers. Its current official extension documentation also describes a separate marketplace, Open VSX, and Cursor's marketplace proxy. Availability in that marketplace is not proof of runtime compatibility; this project ships a local VSIX and is tested in the installed IDEs.

- [Cursor extension documentation](https://cursor.com/help/customization/extensions)
- [Cursor migration guidance](https://cursor.com/help/getting-started/migrate-vscode)
- [Cursor changelog](https://cursor.com/changelog)

The extension requires VS Code API **1.96 or newer**, with matching `@types/vscode` 1.96 declarations to prevent accidental use of newer APIs. This API baseline is below both installed editor versions. The production bundle targets Node 20; modern development/packaging tools run with Node 22 or newer.

All UI uses stable native APIs: `createTreeView`, Quick Pick/Input Box, read-only `FileSystemProvider`, and the documented `vscode.diff` command. There are no proposed APIs, webviews, editor-brand checks, private layout commands, or forced view relocations. User-selected view placement is respected.

- [VS Code Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)
- [Activation events](https://code.visualstudio.com/api/references/activation-events)
- [File contents and filesystem providers](https://code.visualstudio.com/api/extension-guides/virtual-documents)
- [Native diff command](https://code.visualstudio.com/api/references/commands)

Commands and views activate implicitly on this API baseline. The explicit filesystem activation event restores revision documents. Commands register before optional Git API activation/repository discovery, so failed Git initialization cannot make the primary commands disappear.

## Cursor testing

Current Cursor has an agent-oriented empty-window interface. Test a workspace extension in an actual editor workspace: the test runner opens a temporary folder, rather than relying on the agent-only home screen. It uses a fresh extensions directory, rather than `--disable-extensions`, because blanket disablement and extension-development loading do not behave identically across the IDEs.

Both hosts run the same integration test module against the production bundle. The test activates the extension, checks command registration, focuses the view, creates a comparison, opens native diffs, checks the actual text on both sides for added/deleted/modified/renamed files, and exercises pin, clear, swap, refresh, and remove.

The tests use isolated profiles. They do not establish compatibility with every installed third-party extension, enterprise policy, or future editor release. Windows/Linux and remote SSH/container behavior are designed using the stable workspace-host APIs but require testing on those environments.

## Git and host behavior

The extension uses its own `gitcompare` commands, view, settings, and revision URI scheme, so it can coexist with GitLens variants. Repository discovery optionally uses the built-in Git extension's exported API, with Git/PATH and manual-folder fallbacks.

- [Built-in Git API](https://github.com/microsoft/vscode/blob/main/extensions/git/README.md)
- [Remote extension host guidance](https://code.visualstudio.com/api/advanced-topics/remote-extensions)
- [Workspace trust guidance](https://code.visualstudio.com/api/extension-guides/workspace-trust)

The extension requires a trusted filesystem workspace, declares `extensionKind: workspace`, and does not claim virtual-workspace support. Git processes run on the host that contains the repository. They use argument arrays, literal pathspecs, validated commit IDs, timeouts, and noninteractive/read-only flags.

File lists use `git diff --name-status -z --find-renames`. Untracked files are collected separately with `git ls-files --others --exclude-standard -z`. Added/deleted sides are represented explicitly; errors remain errors. Reversed local/index comparisons use Git's reverse direction rather than relabeling the same output.

- [Git diff semantics and output format](https://git-scm.com/docs/git-diff)
- [Reference verification](https://git-scm.com/docs/git-rev-parse)
- [Untracked file enumeration](https://git-scm.com/docs/git-ls-files)
- [VS Code extension packaging](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [VS Code extension testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
