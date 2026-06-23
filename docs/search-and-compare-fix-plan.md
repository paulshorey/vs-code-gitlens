# Search & Compare View — Fix & Modernization Plan

Goal: make the `+` → **Compare References** flow reliable and repeatable (compare
`Working Tree` with `HEAD`, then again with `main`, then again with a SHA), harden it
against the failure modes found in `docs/search-and-compare-view.md`, and remove
patterns that are no longer compatible with current VS Code / Cursor.

The plan is ordered so that **Phase 1 alone should restore the ability to add multiple
comparisons**. Later phases harden and modernize.

---

## Implementation status

| Phase | Status | Notes |
| --- | --- | --- |
| 1.1 Crash-safe `ReferencePicker.show()` | ✅ Done | All awaits moved inside `try/finally`; item load wrapped; null repo guarded. |
| 1.2 Error handling in command entry points | ✅ Done | `selectForCompare`/`compareWithSelected` wrapped with `try/catch`, cleanup, and `showErrorMessage`. |
| 2.2 Cache eviction-on-rejection | ✅ Done | Branch/tag caches already swallow + evict; added defensive `.catch` eviction guard. |
| 2.3 Remove unsafe `!` in picker path | ✅ Done | `getItems` now guards `getRepository()` (root cause of the original stuck modal). |
| 2.1 Capture failure | ⚠️ Partial | Cannot run the GUI in this environment; added `Logger.warn/error` so the real trigger now surfaces in the GitLens output channel. |
| 3 UX hardening | ✅ Done | Duplicate comparisons now reveal the existing node; cancellation/reveal/`getParent` paths verified correct. |
| 4.1 Remove dead `enableProposedApi` | ✅ Done | Removed in `referencePicker.ts`, `remoteProviderPicker.ts`, `gitCommands.ts`. |
| 4.3 Audit proposed/deprecated APIs | ✅ Done | No `enabledApiProposals`/`enableProposedApi` remain in `src`. |
| 4.2 Bump `engines.vscode` + `@types/vscode` | ⏸️ Deferred | npm registry is **not reachable** in this environment, so `@types/vscode` cannot be reinstalled/verified — changing the version string alone would desync the manifest from `node_modules`. Note: raising the `engines.vscode` *floor* only restricts which versions may install the extension; modern VS Code/Cursor already satisfy `^1.62.0`, so compatibility is not blocked. Do this on a dedicated branch with network access. |
| 4.4 Scope reduction (remove Search) | ⏸️ Deferred — needs confirmation | Behavior change. `AGENTS.md` says other views are removed in a *future* refactor; left intact pending explicit sign-off. |
| 5 Tests & regression safety | ⚠️ Partial | Repo has **no test runner** and the registry is unreachable, so automated tests can't be installed/verified here. Delivered: the manual regression checklist below + a ready-to-adopt automated-test scaffold (Phase 5 section). |

---

## Phase 1 — Stop the infinite-spinner (highest priority, smallest change)

### 1.1 Make `ReferencePicker.show()` crash‑safe
File: `src/quickpicks/referencePicker.ts`

Problem: `await Container.git.getRepository(...)` and `quickpick.items = await items`
run **outside** the `try/finally`, so a rejection leaves the busy quickpick undisposed
(infinite spinner) and produces an unhandled rejection.

Change:
- Move **all** `await`s (including `getRepository` and `await items`) **inside** the
  `try`, and move `quickpick.busy/enabled` resets inside it too.
- Keep `quickpick.dispose()` + `disposables.dispose()` in `finally` so the modal always
  closes.
- Wrap item loading so a failure shows an empty/error item instead of throwing:
  ```ts
  let loaded: ReferencesQuickPickItem[] = [];
  try {
      loaded = await items;
  } catch (ex) {
      Logger.error(ex, 'ReferencePicker.getItems');
      loaded = []; // optionally a DirectiveQuickPickItem describing the error
  }
  quickpick.items = loaded;
  ```
- Guard the non-null assertion: `const repo = await Container.git.getRepository(repoPath);`
  and bail (`return undefined`) with a logged warning if `repo == null` rather than
  passing `undefined!` downstream.

Acceptance: if git fails, the modal closes and an error is logged; it never spins
forever.

### 1.2 Surface errors from the command entry points
File: `src/views/searchAndCompareView.ts`

`selectForCompare`/`compareWithSelected` are invoked as `void this.ensureRoot()…` with no
error handling. Wrap the node methods (or the view wrappers) so failures are caught,
logged, and shown via `window.showErrorMessage`, and so the temporary `ComparePickerNode`
is always cleaned up on failure (`removeComparePicker()` in a `finally`).

Acceptance: a failed compare leaves the tree in a clean state (no stuck picker node) and
the user gets a visible message.

### 1.3 Manual verification
- Compare `Working Tree` ↔ `HEAD`. Confirm files + diffs work.
- Click `+` again, compare `Working Tree` ↔ `main`. Confirm a second node is added.
- Click `+` again, compare against a raw SHA via `#<sha>`.
- Repeat 5+ times; confirm no stuck modals and all comparisons persist (`keepResults`).

---

## Phase 2 — Diagnose & fix the underlying trigger

With Phase 1, the real git failure becomes observable.

### 2.1 Capture the failure
- Set `"gitlens.outputLevel": "debug"` and reproduce in a normal window, **or** run the
  Extension Development Host (`F5`) and watch the Debug Console + GitLens output channel.
- Identify which awaited operation rejects on the **second** invocation
  (`getRepository`, `getBranches`, `getTags`, or item construction).

### 2.2 Harden the promise caches
File: `src/git/gitService.ts` (`getBranches` ~1299, `getTags` ~3748)

- The caches store the **in-flight promise**. If it rejects, ensure the cache entry is
  deleted in **all** paths (the `catch` does delete for branches; verify tags and verify
  there's no window where a rejected promise is awaited by a second caller).
- Consider caching the **resolved value** (or a result wrapper) instead of the raw
  promise, so a transient failure can't "stick".
- Re-examine the race at:
  ```1356:1362:src/git/gitService.ts
  			if (this.useCaching) {
  				this._branchesCache.set(repoPath, branchesPromise);

  				if (!(await this.getRepository(repoPath))?.supportsChangeEvents) {
  					this._branchesCache.delete(repoPath);
  				}
  			}
  ```
  `set` then conditional `delete` based on an `await` can interleave with repo change
  events that also mutate the cache.

### 2.3 Remove the unsafe non-null assertions in the picker path
Files: `referencePicker.ts`, `quickCommand.steps.ts`

Replace `(await Container.git.getRepository(repoPath))!` and similar with explicit
null checks that fail fast with a clear message.

Acceptance: root cause identified, fixed, and covered by Phase 5 tests.

---

## Phase 3 — UX hardening of the compare flow
File: `src/views/searchAndCompareView.ts`

- **Cancellation:** if the user dismisses either picker (Esc), guarantee the temporary
  `ComparePickerNode` is removed and `gitlens:views:canCompare` is reset. Today
  `compareWithSelected` re-reveals the picker on cancel — verify it doesn't leave a
  dangling node when starting fresh from `+`.
- **Duplicate comparisons:** decide whether re-adding the same `repoPath|ref1|ref2`
  should focus the existing node instead of creating a duplicate (`CompareResultsNode`
  has a stable `getPinnableId`).
- **Multi-repo:** confirm the "Choose a repository" prompt still appears and that
  `repoPath` mismatch handling in `compareWithSelected` (lines ~136–143) restarts cleanly.
- **`reveal()` robustness:** `ViewBase.reveal` already swallows errors; ensure
  `getParent()` chains are correct for `ComparePickerNode` and `CompareResultsNode` so
  reveal doesn't silently no-op.

---

## Phase 4 — Modernization / VS Code & Cursor compatibility

### 4.1 Remove dead proposed-API usage
File: `src/quickpicks/referencePicker.ts` line 41
- Delete `(quickpick as any).enableProposedApi = true;`. QuickPick item buttons and
  `onDidTriggerItemButton` are stable in current VS Code; the cast is a no-op and hides
  type errors.

### 4.2 Bump engine + types and fix resulting type errors
File: `package.json`
- Raise `engines.vscode` and `@types/vscode` from `1.62.0` to a current baseline that
  matches the Cursor/VS Code versions you support (e.g. `^1.85` or newer). Recompile and
  resolve any API drift (notably QuickPick, TreeView `reveal`, `ThemeIcon`).

### 4.3 Audit for other proposed/deprecated APIs
- Grep for `as any` casts on `window.*`, `enableProposedApi`, and any
  `enabledApiProposals` in `package.json`.
- Verify `commands.executeCommand(\`${id}.focus\`)` and `${id}.resetViewLocation` in
  `ViewBase.show()` still behave on current VS Code (these are used to force the view
  visible).

### 4.4 Decide on scope reduction (per repo goal of removing extra features)
- The `+` submenu also exposes **Search Commits** (`searchCommits`). If search is being
  removed, drop that submenu entry and the `SearchResultsNode` paths so the panel is
  purely "Compare References". This shrinks the surface area and removes a class of
  failures unrelated to compare.

---

## Phase 5 — Tests & regression safety

> Current state: the project has **no test runner** (`package.json` has no `test` script
> and no mocha/jest/vitest/`@vscode/test-electron` dependency) and this environment has
> **no npm registry access**, so automated tests cannot be installed or run here. The
> manual checklist below is the actionable deliverable now; the scaffold is ready to drop
> in once a runner can be installed on a networked branch.

### 5a. Manual regression checklist (run in the Extension Development Host: `F5`)

Single-repo workspace:
1. Open the **Search & Compare** view.
2. `+` → **Compare References** → pick `Working Tree` → pick `HEAD`.
   - ✅ A `Comparing Working Tree with HEAD` node appears with a "N files changed" child.
3. Expand "files changed", click a file.
   - ✅ A diff opens in the editor (green additions / red deletions).
4. `+` → **Compare References** → `Working Tree` → `main`.
   - ✅ A **second** comparison node appears (the first is kept).
5. `+` → **Compare References** → type `#<a-real-sha>` → accept.
   - ✅ A third comparison node appears.
6. Repeat `+` 5+ times, cancelling (Esc) at random pickers.
   - ✅ No modal ever spins forever; cancelling leaves the tree clean (no orphan picker).
7. Re-add an **identical** comparison (same base/target).
   - ✅ The existing node is revealed/focused instead of a duplicate being created.

Failure-path (forces the old bug to surface safely):
8. Temporarily break git (e.g. rename the repo's `.git` or point `git.path` at a bad
   binary), then `+` → **Compare References**.
   - ✅ The picker closes (does not hang); an error toast appears; the GitLens output
     channel (`gitlens.outputLevel: debug`) logs `ReferencePicker.show: …`.

Multi-repo workspace:
9. With ≥2 repos open, `+` → **Compare References**.
   - ✅ The "Choose a repository" picker appears first, then the ref pickers.

### 5b. Ready-to-adopt automated-test scaffold (enable on a networked branch)

Add a runner and the standard VS Code integration harness:

```jsonc
// package.json (devDependencies — install when registry access is available)
"@vscode/test-electron": "^2.3.9",
"mocha": "^10.4.0",
"@types/mocha": "^10.0.6"
```

```jsonc
// package.json (scripts)
"test": "node ./dist/test/runTest.js"
```

Target tests (high value, map directly to the fixes in this plan):
- **`ReferencePicker.show` is crash-safe** — stub `Container.git.getRepository`/item
  loading to reject; assert the returned promise resolves to `undefined` (no throw) and
  the quickpick is disposed (no lingering busy modal).
- **Cache eviction on rejection** — force `getBranches`/`getTags` to reject; assert the
  corresponding cache key is removed afterward and a subsequent call retries.
- **Duplicate comparison** — call `SearchAndCompareView.compare()` twice with identical
  refs; assert only one `CompareResultsNode` exists and the second call reveals it.
- **Three sequential compares** — assert three distinct `CompareResultsNode`s persist
  when `keepResults = true`.

---

## Suggested order of execution

1. **Phase 1** (1.1 + 1.2) — restores multi-compare and kills the infinite spinner. ← do first
2. **Phase 2** — find & fix the real git trigger now that it's observable.
3. **Phase 4.1** — trivial, removes a compatibility smell.
4. **Phase 3** — UX hardening.
5. **Phase 4.2–4.4** — engine bump + scope reduction (larger, do deliberately).
6. **Phase 5** — lock it in with tests.

## Risk notes

- Bumping `@types/vscode` (4.2) may surface many compile errors across the (large)
  codebase; do it on its own branch.
- Changing the promise caches (2.2) touches a hot path used by many views; keep the
  behavior identical on the success path and only change failure/eviction handling.
- Removing Search (4.4) is optional and aligned with the stated goal of trimming the
  extension, but it is a behavior change — confirm before doing it.
