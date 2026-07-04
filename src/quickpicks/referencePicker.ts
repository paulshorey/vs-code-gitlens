'use strict';
import { CancellationTokenSource, Disposable, QuickPick, window } from 'vscode';
import { GitActions } from '../commands';
import { getValidateGitReferenceFn, QuickCommandButtons } from '../commands/quickCommand';
import { GlyphChars } from '../constants';
import { Container } from '../container';
import { BranchSortOptions, GitBranch, GitReference, GitTag, Repository, TagSortOptions } from '../git/git';
import { KeyboardScope, Keys } from '../keyboard';
import { Logger } from '../logger';
import { BranchQuickPickItem, getQuickPickIgnoreFocusOut, RefQuickPickItem, TagQuickPickItem } from '../quickpicks';
import { Strings } from '../system';

export type ReferencesQuickPickItem = BranchQuickPickItem | TagQuickPickItem | RefQuickPickItem;

export enum ReferencesQuickPickIncludes {
	Branches = 1,
	Tags = 2,
	WorkingTree = 4,
	HEAD = 8,

	BranchesAndTags = 3,
}

export interface ReferencesQuickPickOptions {
	allowEnteringRefs?: boolean | { ranges?: boolean };
	autoPick?: boolean;
	picked?: string;
	filter?: { branches?(b: GitBranch): boolean; tags?(t: GitTag): boolean };
	include?: ReferencesQuickPickIncludes;
	keys?: Keys[];
	onDidPressKey?(key: Keys, quickpick: QuickPick<ReferencesQuickPickItem>): void | Promise<void>;
	sort?: boolean | { branches?: BranchSortOptions; tags?: TagSortOptions };
}

export namespace ReferencePicker {
	export async function show(
		repoPath: string,
		title: string,
		placeHolder: string,
		options: ReferencesQuickPickOptions = {},
	): Promise<GitReference | undefined> {
		const quickpick = window.createQuickPick<ReferencesQuickPickItem>();
		quickpick.ignoreFocusOut = getQuickPickIgnoreFocusOut();

		quickpick.title = title;
		quickpick.placeholder =
			options.allowEnteringRefs != null
				? `${placeHolder}${GlyphChars.Space.repeat(3)}(or enter a reference using #)`
				: placeHolder;
		quickpick.matchOnDescription = true;

		const disposables: Disposable[] = [];

		let scope: KeyboardScope | undefined;
		if (options?.keys != null && options.keys.length !== 0 && options?.onDidPressKey !== null) {
			scope = Container.keyboard.createScope(
				Object.fromEntries(
					options.keys.map(key => [
						key,
						{
							onDidPressKey: key => {
								if (quickpick.activeItems.length !== 0) {
									void options.onDidPressKey!(key, quickpick);
								}
							},
						},
					]),
				),
			);
			void scope.start();
			disposables.push(scope);
		}

		const cancellation = new CancellationTokenSource();
		disposables.push(cancellation);

		let autoPick;
		let items = getItems(repoPath, options);
		if (options.autoPick) {
			items = items.then(itms => {
				if (itms.length <= 1) {
					autoPick = itms[0];
					cancellation.cancel();
				}
				return itms;
			});
		}

		quickpick.busy = true;
		quickpick.enabled = false;

		quickpick.show();

		try {
			// References are loaded directly from the repo path (see getItems), so the picker can
			// open even when a Repository object isn't currently resolvable from the repo tree.
			// The Repository is only needed to validate a manually-entered ref (#<ref>), so look it
			// up best-effort and make that validation optional.
			const repo = await getRepo(repoPath);
			const getValidateGitReference =
				repo != null
					? getValidateGitReferenceFn(repo, {
							buttons: [QuickCommandButtons.RevealInSideBar],
							ranges:
								// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
								options?.allowEnteringRefs && typeof options.allowEnteringRefs !== 'boolean'
									? options.allowEnteringRefs.ranges
									: undefined,
					  })
					: undefined;

			// Don't let a failure loading branches/tags reject out of the picker -- show an empty
			// list instead so the modal stays usable and can be dismissed.
			let loadedItems: ReferencesQuickPickItem[];
			try {
				loadedItems = await items;
			} catch (ex) {
				Logger.error(ex, 'ReferencePicker.show: failed to load references');
				loadedItems = [];
			}
			quickpick.items = loadedItems;

			quickpick.busy = false;
			quickpick.enabled = true;

			let pick = await new Promise<ReferencesQuickPickItem | undefined>(resolve => {
				disposables.push(
					cancellation.token.onCancellationRequested(() => quickpick.hide()),
					quickpick.onDidHide(() => resolve(undefined)),
					quickpick.onDidAccept(() => {
						if (quickpick.activeItems.length === 0) return;

						resolve(quickpick.activeItems[0]);
					}),
					quickpick.onDidChangeValue(async e => {
						// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
						if (options.allowEnteringRefs && getValidateGitReference != null) {
							try {
								if (!(await getValidateGitReference(quickpick, e))) {
									quickpick.items = await items;
								}
							} catch (ex) {
								Logger.error(ex, 'ReferencePicker.show: failed to validate reference');
							}
						}

						if (scope == null) return;

						// Pause the left/right keyboard commands if there is a value, otherwise the left/right arrows won't work in the input properly
						if (e.length !== 0) {
							await scope.pause(['left', 'right']);
						} else {
							await scope.resume();
						}
					}),
					quickpick.onDidTriggerItemButton(({ button, item: { item } }) => {
						if (button === QuickCommandButtons.RevealInSideBar) {
							if (GitReference.isBranch(item)) {
								void GitActions.Branch.reveal(item, { select: true, expand: true });
							} else if (GitReference.isTag(item)) {
								void GitActions.Tag.reveal(item, { select: true, expand: true });
							} else if (GitReference.isRevision(item)) {
								void GitActions.Commit.reveal(item, { select: true, expand: true });
							}
						}
					}),
				);
			});
			if (pick == null && autoPick != null) {
				pick = autoPick;
			}
			if (pick == null) return undefined;

			return pick.item;
		} catch (ex) {
			Logger.error(ex, 'ReferencePicker.show');
			return undefined;
		} finally {
			quickpick.dispose();
			disposables.forEach(d => d.dispose());
		}
	}

	// Resolve a repository for a known repoPath. `Container.git.getRepository` can return undefined
	// even for a perfectly valid repo path (its tracked-file probe can fail, or path normalization
	// differs from the stored key). When that happens, fall back to matching any known repository
	// (including closed ones) by normalized path. This keeps the picker working for repeated
	// comparisons instead of silently failing to open.
	async function getRepo(repoPath: string): Promise<Repository | undefined> {
		const repo = await Container.git.getRepository(repoPath);
		if (repo != null) return repo;

		const normalized = Strings.normalizePath(repoPath);
		for (const r of await Container.git.getRepositories()) {
			if (Strings.normalizePath(r.path) === normalized) return r;
		}

		Logger.warn(`ReferencePicker.getRepo: no repository matched '${repoPath}'`);
		return undefined;
	}

	async function getItems(
		repoPath: string,
		{ picked, filter, include, sort }: ReferencesQuickPickOptions,
	): Promise<ReferencesQuickPickItem[]> {
		include = include ?? ReferencesQuickPickIncludes.BranchesAndTags;

		const buttons = [QuickCommandButtons.RevealInSideBar];
		const resolvedSort = sort ?? { branches: { current: false }, tags: {} };
		const isPicked = (ref: string) => picked != null && ref === picked;

		// Load references directly from the repo path so the picker works even when a Repository
		// object can't be resolved from the repository tree (the cause of repeated comparisons
		// silently failing to open). These service calls run git against repoPath directly.
		const wantBranches = (include & ReferencesQuickPickIncludes.Branches) !== 0;
		const wantTags = (include & ReferencesQuickPickIncludes.Tags) !== 0;

		const [branches, tags] = await Promise.all([
			wantBranches
				? Container.git.getBranches(repoPath, {
						filter: filter?.branches,
						sort: typeof resolvedSort === 'boolean' ? resolvedSort : resolvedSort.branches,
				  })
				: Promise.resolve([] as GitBranch[]),
			wantTags ? Container.git.getTags(repoPath, { filter: filter?.tags, sort: true }) : Promise.resolve([] as GitTag[]),
		]);

		let items: ReferencesQuickPickItem[];
		if (wantBranches && wantTags) {
			items = await Promise.all<ReferencesQuickPickItem>([
				...branches
					.filter(b => !b.remote)
					.map(b =>
						BranchQuickPickItem.create(b, isPicked(b.ref), {
							buttons,
							current: 'checkmark',
							ref: true,
							status: true,
						}),
					),
				...tags.map(t =>
					TagQuickPickItem.create(t, isPicked(t.ref), { buttons, message: false, ref: true, type: true }),
				),
				...branches
					.filter(b => b.remote)
					.map(b =>
						BranchQuickPickItem.create(b, isPicked(b.ref), {
							buttons,
							current: 'checkmark',
							ref: true,
							status: true,
							type: 'remote',
						}),
					),
			]);
		} else if (wantBranches) {
			items = await Promise.all<ReferencesQuickPickItem>(
				branches.map(b =>
					BranchQuickPickItem.create(b, isPicked(b.ref), {
						buttons,
						current: 'checkmark',
						ref: true,
						status: true,
						type: 'remote',
					}),
				),
			);
		} else if (wantTags) {
			items = await Promise.all<ReferencesQuickPickItem>(
				tags.map(t => TagQuickPickItem.create(t, isPicked(t.ref), { buttons, message: false, ref: true })),
			);
		} else {
			items = [];
		}

		// Move the picked item to the top
		if (picked) {
			const index = items.findIndex(i => i.ref === picked);
			if (index !== -1) {
				items.splice(0, 0, ...items.splice(index, 1));
			}
		}

		if (include & ReferencesQuickPickIncludes.HEAD) {
			items.splice(0, 0, RefQuickPickItem.create('HEAD', repoPath, undefined, { icon: true }));
		}

		if (include & ReferencesQuickPickIncludes.WorkingTree) {
			items.splice(0, 0, RefQuickPickItem.create('', repoPath, undefined, { icon: true }));
		}

		return items;
	}
}
