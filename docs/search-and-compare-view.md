# Search & Compare View — "New Search or Compare" (Add) Button

This document traces the **Search & Compare** view's add (`+`) button end‑to‑end: what
it is, what runs when you click it, every file/function involved, why adding a second
comparison currently fails, and the parts that must be preserved.

> This is the panel to **keep**. The core flow is:
> 1. Click `+` → **Compare references…**
> 2. Pick a base ref (e.g. `Working Tree`), then a ref to compare with (e.g. `HEAD`, `main`, a SHA).
> 3. A `Comparing A with B` node appears listing changed files.
> 4. Click a file → opens a diff in the editor (green = added, red = deleted).

---

## 1. The button in the rendered extension

The DOM you found:

```html
<a class="action-label codicon codicon-add" custom-hover="true"
   aria-label="New Search or Compare" tabindex="0" aria-expanded="false"></a>
```

- `aria-expanded` tells us this is **not a plain command button** — it is a **submenu
  anchor**. Clicking it opens a small popup with menu items.
- `aria-label="New Search or Compare"` maps to the submenu definition in `package.json`.

### Where it is defined (`package.json`)

| Concern | Location | Value |
| --- | --- | --- |
| Submenu label + icon | `submenus[]` | `id: gitlens/view/searchAndCompare/new`, `label: %New Search or Compare%`, `icon: $(add)` |
| Where it renders | `menus["view/title"]` | `submenu: gitlens/view/searchAndCompare/new`, `when: view =~ /^gitlens\.views\.searchAndCompare\b/`, `group: navigation@10` |
| Submenu contents | `menus["gitlens/view/searchAndCompare/new"]` | `gitlens.views.searchAndCompare.searchCommits` (Search Commits), `gitlens.views.searchAndCompare.selectForCompare` (Compare References) |

So the `+` icon is a **view title submenu** that contains two commands. The one this
task cares about is **Compare References** →
`gitlens.views.searchAndCompare.selectForCompare`.

---

## 2. Command wiring

`gitlens.views.searchAndCompare.selectForCompare` is registered by the view itself
(not the global view-commands table).

- `src/views/searchAndCompareView.ts` → `SearchAndCompareView.registerCommands()`

```317:318:src/views/searchAndCompareView.ts
			commands.registerCommand(this.getQualifiedCommand('selectForCompare'), this.selectForCompare, this),
			commands.registerCommand(this.getQualifiedCommand('compareWithSelected'), this.compareWithSelected, this),
```

`getQualifiedCommand('selectForCompare')` → `gitlens.views.searchAndCompare.selectForCompare`
(`id` is `gitlens.views.searchAndCompare`, set in the constructor).

> Note: there is a **separate** `gitlens.views.selectForCompare` registered in
> `src/views/viewCommands.ts` for right‑click context menus on ref nodes. Different id,
> no collision — but worth knowing two near‑identical entry points exist.

The thin view method delegates to the root node:

```393:395:src/views/searchAndCompareView.ts
	selectForCompare(repoPath?: string, ref?: string | NamedRef, options?: { prompt?: boolean }) {
		void this.ensureRoot().selectForCompare(repoPath, ref, options);
	}
```

When invoked from the view title submenu, VS Code passes **no arguments**, so
`repoPath`, `ref`, and `options` are all `undefined`.

---

## 3. The click workflow (happy path)

### Step A — `SearchAndCompareViewNode.selectForCompare()`
File: `src/views/searchAndCompareView.ts` (lines ~177–231)

1. `repoPath == null` → `getRepoPathOrPrompt('Compare')`
   (`src/commands/common.ts`). With a single repo this resolves synchronously via
   `Container.git.getHighlanderRepoPath()`. With multiple repos it shows the
   **"Choose a repository"** picker (`RepositoryPicker`).
2. `removeComparePicker(true)` clears any prior in‑progress picker node and resets the
   `gitlens:views:canCompare` context key to `false`.
3. `ref == null` → opens the **first reference picker**:

```188:196:src/views/searchAndCompareView.ts
			const pick = await ReferencePicker.show(repoPath, 'Compare', 'Choose a reference to compare', {
				allowEnteringRefs: { ranges: true },
				// checkmarks: false,
				include:
					ReferencesQuickPickIncludes.BranchesAndTags |
					ReferencesQuickPickIncludes.HEAD |
					ReferencesQuickPickIncludes.WorkingTree,
				sort: { branches: { current: true }, tags: {} },
			});
```

   This is the modal the user sees: title **"Compare"**, placeholder
   **"Choose a reference to compare   (or enter a reference using #)"**.
4. If the chosen value is a range (`a...b`), it is split into `ref` + `ref2`.
5. A `ComparePickerNode` is created and spliced into the tree at index 0, the
   `gitlens:views:canCompare` context is set `true`, the tree refreshes, and the node is
   revealed.
6. Because `prompt` is now `true`, it immediately calls
   `compareWithSelected(repoPath, ref2)`.

### Step B — `SearchAndCompareViewNode.compareWithSelected()`
File: `src/views/searchAndCompareView.ts` (lines ~132–175)

1. Reads `this.comparePicker.selectedRef` (the base ref chosen in Step A).
2. `ref == null` → opens the **second reference picker**:

```146:160:src/views/searchAndCompareView.ts
			const pick = await ReferencePicker.show(
				repoPath,
				`Compare ${this.getRefName(selectedRef.ref)} with`,
				'Choose a reference to compare with',
				{
					allowEnteringRefs: true,
					picked: typeof selectedRef.ref === 'string' ? selectedRef.ref : selectedRef.ref.ref,
					// checkmarks: true,
					include:
						ReferencesQuickPickIncludes.BranchesAndTags |
						ReferencesQuickPickIncludes.HEAD |
						ReferencesQuickPickIncludes.WorkingTree,
					sort: { branches: { current: true } },
				},
			);
```

3. `removeComparePicker()` removes the temporary picker node.
4. `this.view.compare(repoPath, selectedRef.ref, ref)` builds the results.

### Step C — `SearchAndCompareView.compare()` → `addResults()`
File: `src/views/searchAndCompareView.ts`

- Creates a `CompareResultsNode(view, root, repoPath, ref1, ref2)`.
- `addResults()` shows the view, calls `root.addOrReplace(results, !keepResults)`
  (default `keepResults = true`, so existing results are **kept**, not replaced), then
  reveals the new node.

### Step D — `CompareResultsNode` builds children
File: `src/views/nodes/compareResultsNode.ts`

`getChildren()` produces three child nodes:
- **Behind** commits (`ResultsCommitsNode`)
- **Ahead** commits (`ResultsCommitsNode`)
- **Files changed** (`ResultsFilesNode`)

Ahead/behind counts come from `Container.git.getAheadBehindCommitCount()` and
`getMergeBase()`. The file list comes from `getFilesQuery()` /
`getAheadFilesQuery()` / `getBehindFilesQuery()`, all of which call
`Container.git.getDiffStatus()`.

### Step E — Clicking a changed file opens a diff
Files: `src/views/nodes/resultsFilesNode.ts` → `src/views/nodes/resultsFileNode.ts`

- `ResultsFilesNode.getChildren()` maps each `GitFile` to a `ResultsFileNode`.
- `ResultsFileNode.getCommand()` returns a `gitlens.diffWith` command with
  `DiffWithCommandArgs { lhs: {sha: ref1}, rhs: {sha: ref2} }`.
- Selecting the tree item runs the diff command, opening the native VS Code diff editor
  (green additions / red deletions). This is the **second core behavior to keep**.

---

## 4. The reference picker internals (where it hangs)
File: `src/quickpicks/referencePicker.ts` → `ReferencePicker.show()`

Critical structure (abridged, real line numbers):

```87:106:src/quickpicks/referencePicker.ts
		quickpick.busy = true;
		quickpick.enabled = false;

		quickpick.show();

		const getValidateGitReference = getValidateGitReferenceFn((await Container.git.getRepository(repoPath))!, {
			buttons: [QuickCommandButtons.RevealInSideBar],
			ranges:
				// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
				options?.allowEnteringRefs && typeof options.allowEnteringRefs !== 'boolean'
					? options.allowEnteringRefs.ranges
					: undefined,
		});

		quickpick.items = await items;

		quickpick.busy = false;
		quickpick.enabled = true;

		try {
```

Item loading chain:
`getItems()` → `getBranchesAndOrTags()` (`src/commands/quickCommand.steps.ts`) →
`repo.getBranches()` / `repo.getTags()` → `Container.git.getBranches()` /
`getTags()` (`src/git/gitService.ts`) → `Git.for_each_ref__branch()` (`src/git/git.ts`).

`getBranches`/`getTags` cache promises in `_branchesCache` / `_tagsCache` (only when
`advanced.caching.enabled` **and** the repo `supportsChangeEvents`).

---

## 5. Why the second comparison fails

### 5a. Confirmed structural defect — awaits outside `try/finally`

In `ReferencePicker.show()` the quickpick is **shown and set `busy = true`** (lines
87–90). The next two `await`s — `Container.git.getRepository()` (line 92) and
`quickpick.items = await items` (line 101) — happen **before** the `try { … } finally {
quickpick.dispose() }` block (which starts at line 106).

Consequences if either awaited promise **rejects or never resolves**:
- The `finally` that disposes the quickpick **never runs**.
- The quickpick is left **visible and spinning (`busy = true`) forever** — exactly the
  reported symptom: *"a Compare dialog modal … keeps loading, but fails."*
- The rejection propagates out of `selectForCompare`, which was invoked as
  `void this.ensureRoot().selectForCompare(...)` — i.e. an **unhandled promise
  rejection** that is silently swallowed, so the user sees no error, just a stuck modal.

This is the single most likely cause of the stuck-loading modal regardless of the
underlying trigger.

### 5b. Likely trigger — stale/empty repo or cache state on re-entry

`selectForCompare` is re-entered for the second comparison with everything `undefined`.
Suspect areas that can throw/return `undefined` only after the first run has mutated
state:

- `Container.git.getRepository(repoPath)` is dereferenced with a non-null assertion
  (`(await …)!`) and the result is passed into `getValidateGitReferenceFn`. If it returns
  `undefined`, later validation/`getItems` paths can throw.
- `getBranches()`/`getTags()` cache a **promise** keyed by repoPath. If a prior call
  populated the cache with a promise that later rejected, or repo change events fired and
  cleared/re-armed caches mid-flight, the awaited `items` promise can reject.
- `getItems()` performs no `try/catch`; any failure deep in
  `getBranchesAndOrTags` → `BranchQuickPickItem.create` (which computes branch status)
  bubbles straight to the unguarded `await` at line 101.

> The exact trigger needs a runtime log. Set `"gitlens.outputLevel": "debug"` (and/or run
> the Extension Development Host) and reproduce; the GitLens output channel will show the
> rejected git operation. The fix in 5a makes the failure **visible and recoverable**
> instead of an infinite spinner, which is the priority.

### 5c. Modernization / compatibility smells contributing to fragility

- `(quickpick as any).enableProposedApi = true;` (line 41) — leftover from when QuickPick
  item buttons were proposed API. On VS Code ≥ 1.64 item buttons and
  `onDidTriggerItemButton` are **stable**; this assignment is a dead no‑op and should be
  removed.
- `engines.vscode` and `@types/vscode` are pinned to **1.62.0** while the extension runs
  on current VS Code/Cursor. Several APIs used here (QuickPick item buttons, tree
  `reveal`) have since stabilized or changed semantics.
- `selectForCompare` / `compareWithSelected` are fired with `void …` and have **no
  error handling**, so any failure disappears.
- Promise-based caches that store the in-flight promise (not the resolved value) can
  "stick" a rejected/cancelled promise; cache writes are also raced against repo change
  events that delete them.

---

## 6. Files involved (quick reference)

| File | Role in this flow |
| --- | --- |
| `package.json` | Submenu + menu contributions for the `+` button |
| `package.nls.json` | `"New Search or Compare"` label |
| `src/views/searchAndCompareView.ts` | Command registration, `selectForCompare`, `compareWithSelected`, `compare`, `addResults` |
| `src/views/viewBase.ts` | Tree lifecycle: `show()`, `reveal()`, `triggerNodeChange()` |
| `src/views/nodes/comparePickerNode.ts` | Temporary "Compare X with …" tree node |
| `src/views/nodes/compareResultsNode.ts` | `Comparing A with B` node + file/commit queries |
| `src/views/nodes/resultsFilesNode.ts` | "N files changed" node |
| `src/views/nodes/resultsFileNode.ts` | Per-file node; builds the `gitlens.diffWith` command |
| `src/quickpicks/referencePicker.ts` | The ref picker modal (**stuck-loading bug lives here**) |
| `src/commands/quickCommand.steps.ts` | `getBranchesAndOrTags`, `getValidateGitReferenceFn` |
| `src/commands/common.ts` | `getRepoPathOrPrompt` |
| `src/git/gitService.ts` | `getBranches`, `getTags`, `getRepository`, `getDiffStatus`, caches |
| `src/git/git.ts` | Low-level `git for-each-ref`, `log`, `diff` |

---

## 7. What must be preserved

1. The `+` → **Compare References** flow producing a `Comparing A with B` node.
2. The ability to choose `Working Tree`, `HEAD`, branches, tags, and raw SHAs.
3. The changed-files list and the click-to-diff behavior (`gitlens.diffWith`).
4. The ability to keep multiple comparisons at once (`keepResults = true`).

See `docs/search-and-compare-fix-plan.md` for the remediation and modernization plan.
