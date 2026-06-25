'use strict';
import { commands, env, TextDocumentShowOptions, Uri, window } from 'vscode';
import type { OpenPullRequestActionContext } from '../api/gitlens';
import {
	Commands,
	DiffWithCommandArgs,
	DiffWithPreviousCommandArgs,
	executeActionCommand,
	executeCommand,
	executeEditorCommand,
	GitActions,
	OpenFileAtRevisionCommandArgs,
} from '../commands';
import { configuration, FileAnnotationType } from '../configuration';
import { BuiltInGitCommands, ContextKeys, setContext } from '../constants';
import { Container } from '../container';
import { GitReference } from '../git/git';
import { GitService } from '../git/gitService';
import { GitUri } from '../git/gitUri';
import { debug } from '../system';
import {
	canClearNode,
	canEditNode,
	canViewDismissNode,
	CommitFileNode,
	CommitNode,
	PageableViewNode,
	PagerNode,
	PullRequestNode,
	ResultsFileNode,
	ResultsFilesNode,
	ViewNode,
	ViewRefFileNode,
	ViewRefNode,
} from './nodes';

interface CompareSelectedInfo {
	ref: string;
	repoPath: string | undefined;
	uri?: Uri;
}

// This fork ships only the Search & Compare view. ViewCommands therefore registers just the
// node/file/compare commands reachable from that view's tree (comparison results, search
// results, commits, files, folders, and pull requests). Repository/branch/remote/stash/tag
// specific commands from upstream GitLens have been removed along with their views.
export class ViewCommands {
	constructor() {
		commands.registerCommand('gitlens.views.clearNode', (n: ViewNode) => canClearNode(n) && n.clear(), this);
		commands.registerCommand(
			'gitlens.views.copy',
			async (selection: ViewNode | ViewNode[]) => {
				selection = Array.isArray(selection) ? selection : [selection];
				if (selection.length === 0) return;

				const data = selection
					.map(n => n.toClipboard?.())
					.filter(s => s != null && s.length > 0)
					.join(',');
				await env.clipboard.writeText(data);
			},
			this,
		);
		commands.registerCommand(
			'gitlens.views.dismissNode',
			(n: ViewNode) => canViewDismissNode(n.view) && n.view.dismissNode(n),
			this,
		);
		commands.registerCommand('gitlens.views.editNode', (n: ViewNode) => canEditNode(n) && n.edit(), this);
		commands.registerCommand(
			'gitlens.views.expandNode',
			(n: ViewNode) => n.view.reveal(n, { select: false, focus: false, expand: 3 }),
			this,
		);
		commands.registerCommand('gitlens.views.loadMoreChildren', (n: PagerNode) => n.loadMore(), this);
		commands.registerCommand('gitlens.views.loadAllChildren', (n: PagerNode) => n.loadAll(), this);
		commands.registerCommand(
			'gitlens.views.refreshNode',
			(n: ViewNode, reset?: boolean) => {
				if (reset == null && PageableViewNode.is(n)) {
					n.limit = undefined;
					n.view.resetNodeLastKnownLimit(n);
				}

				return n.view.refreshNode(n, reset == null ? true : reset);
			},
			this,
		);

		commands.registerCommand(
			'gitlens.views.setShowRelativeDateMarkersOn',
			() => this.setShowRelativeDateMarkers(true),
			this,
		);
		commands.registerCommand(
			'gitlens.views.setShowRelativeDateMarkersOff',
			() => this.setShowRelativeDateMarkers(false),
			this,
		);

		commands.registerCommand('gitlens.views.browseRepoAtRevision', this.browseRepoAtRevision, this);
		commands.registerCommand(
			'gitlens.views.browseRepoAtRevisionInNewWindow',
			n => this.browseRepoAtRevision(n, { openInNewWindow: true }),
			this,
		);
		commands.registerCommand(
			'gitlens.views.browseRepoBeforeRevision',
			n => this.browseRepoAtRevision(n, { before: true }),
			this,
		);
		commands.registerCommand(
			'gitlens.views.browseRepoBeforeRevisionInNewWindow',
			n => this.browseRepoAtRevision(n, { before: true, openInNewWindow: true }),
			this,
		);

		commands.registerCommand('gitlens.views.openChanges', this.openChanges, this);
		commands.registerCommand('gitlens.views.openChangesWithWorking', this.openChangesWithWorking, this);
		commands.registerCommand(
			'gitlens.views.openPreviousChangesWithWorking',
			this.openPreviousChangesWithWorking,
			this,
		);
		commands.registerCommand('gitlens.views.openFile', this.openFile, this);
		commands.registerCommand('gitlens.views.openFileRevision', this.openRevision, this);
		commands.registerCommand('gitlens.views.openChangedFiles', this.openFiles, this);
		commands.registerCommand('gitlens.views.openChangedFileDiffs', this.openAllChanges, this);
		commands.registerCommand('gitlens.views.openChangedFileDiffsWithWorking', this.openAllChangesWithWorking, this);
		commands.registerCommand('gitlens.views.openChangedFileRevisions', this.openRevisions, this);
		commands.registerCommand('gitlens.views.applyChanges', this.applyChanges, this);
		commands.registerCommand('gitlens.views.highlightChanges', this.highlightChanges, this);
		commands.registerCommand('gitlens.views.highlightRevisionChanges', this.highlightRevisionChanges, this);
		commands.registerCommand('gitlens.views.restore', this.restore, this);

		commands.registerCommand('gitlens.views.switchToCommit', this.switch, this);

		commands.registerCommand('gitlens.views.compareWithHead', this.compareHeadWith, this);
		commands.registerCommand('gitlens.views.compareWithSelected', this.compareWithSelected, this);
		commands.registerCommand('gitlens.views.selectForCompare', this.selectForCompare, this);
		commands.registerCommand('gitlens.views.compareFileWithSelected', this.compareFileWithSelected, this);
		commands.registerCommand('gitlens.views.selectFileForCompare', this.selectFileForCompare, this);
		commands.registerCommand('gitlens.views.compareWithWorking', this.compareWorkingWith, this);

		commands.registerCommand('gitlens.views.cherryPick', this.cherryPick, this);
		commands.registerCommand('gitlens.views.pushToCommit', this.pushToCommit, this);

		commands.registerCommand('gitlens.views.resetCommit', this.resetCommit, this);
		commands.registerCommand('gitlens.views.resetToCommit', this.resetToCommit, this);
		commands.registerCommand('gitlens.views.revert', this.revert, this);
		commands.registerCommand('gitlens.views.undoCommit', this.undoCommit, this);

		commands.registerCommand('gitlens.views.openPullRequest', this.openPullRequest, this);
	}

	@debug()
	private applyChanges(node: ViewRefFileNode) {
		if (!(node instanceof ViewRefFileNode)) return Promise.resolve();

		if (node instanceof ResultsFileNode) {
			return GitActions.Commit.applyChanges(
				node.file,
				GitReference.create(node.ref1, node.repoPath),
				GitReference.create(node.ref2, node.repoPath),
			);
		}

		if (node.ref == null || node.ref.ref === 'HEAD') return Promise.resolve();

		return GitActions.Commit.applyChanges(node.file, node.ref);
	}

	@debug()
	private browseRepoAtRevision(node: ViewRefNode, options?: { before?: boolean; openInNewWindow?: boolean }) {
		if (!(node instanceof ViewRefNode)) return Promise.resolve();

		return GitActions.browseAtRevision(node.uri, {
			before: options?.before,
			openInNewWindow: options?.openInNewWindow,
		});
	}

	@debug()
	private cherryPick(node: CommitNode) {
		if (!(node instanceof CommitNode)) return Promise.resolve();

		return GitActions.cherryPick(node.repoPath, node.ref);
	}

	@debug()
	private async highlightChanges(node: CommitFileNode | ResultsFileNode) {
		if (!(node instanceof CommitFileNode) && !(node instanceof ResultsFileNode)) return;

		void (await this.openFile(node, { preserveFocus: true, preview: true }));
		void (await Container.fileAnnotations.toggle(
			window.activeTextEditor,
			FileAnnotationType.Changes,
			{ sha: node.ref.ref },
			true,
		));
	}

	@debug()
	private async highlightRevisionChanges(node: CommitFileNode | ResultsFileNode) {
		if (!(node instanceof CommitFileNode) && !(node instanceof ResultsFileNode)) return;

		void (await this.openFile(node, { preserveFocus: true, preview: true }));
		void (await Container.fileAnnotations.toggle(
			window.activeTextEditor,
			FileAnnotationType.Changes,
			{ sha: node.ref.ref, only: true },
			true,
		));
	}

	@debug()
	private pushToCommit(node: CommitNode) {
		if (!(node instanceof CommitNode)) return Promise.resolve();

		return GitActions.push(node.repoPath, false, node.commit);
	}

	@debug()
	private openPullRequest(node: PullRequestNode) {
		if (!(node instanceof PullRequestNode)) return Promise.resolve();

		return executeActionCommand<OpenPullRequestActionContext>('openPullRequest', {
			repoPath: node.uri.repoPath!,
			provider: {
				id: node.pullRequest.provider.id,
				name: node.pullRequest.provider.name,
				domain: node.pullRequest.provider.domain,
			},
			pullRequest: {
				id: node.pullRequest.id,
				url: node.pullRequest.url,
			},
		});
	}

	@debug()
	private resetCommit(node: CommitNode) {
		if (!(node instanceof CommitNode)) return Promise.resolve();

		return GitActions.reset(
			node.repoPath,
			GitReference.create(`${node.ref.ref}^`, node.ref.repoPath, {
				refType: 'revision',
				name: `${node.ref.name}^`,
				message: node.ref.message,
			}),
		);
	}

	@debug()
	private resetToCommit(node: CommitNode) {
		if (!(node instanceof CommitNode)) return Promise.resolve();

		return GitActions.reset(node.repoPath, node.ref);
	}

	@debug()
	private restore(node: ViewRefFileNode) {
		if (!(node instanceof ViewRefFileNode)) return Promise.resolve();

		return GitActions.Commit.restoreFile(node.fileName, node.ref);
	}

	@debug()
	private revert(node: CommitNode) {
		if (!(node instanceof CommitNode)) return Promise.resolve();

		return GitActions.revert(node.repoPath, node.ref);
	}

	@debug()
	private setShowRelativeDateMarkers(enabled: boolean) {
		return configuration.updateEffective('views.showRelativeDateMarkers', enabled);
	}

	@debug()
	private switch(node?: ViewRefNode) {
		if (node == null) {
			return GitActions.switchTo(Container.git.getHighlanderRepoPath());
		}

		if (!(node instanceof ViewRefNode)) return Promise.resolve();

		return GitActions.switchTo(node.repoPath, node.ref);
	}

	@debug()
	private async undoCommit(node: CommitNode) {
		if (!(node instanceof CommitNode)) return;

		const repo = await GitService.getOrOpenBuiltInGitRepository(node.repoPath);
		const commit = await repo?.getCommit('HEAD');

		if (commit?.hash !== node.ref.ref) {
			void window.showWarningMessage(
				`Commit ${GitReference.toString(node.ref, {
					capitalize: true,
					icon: false,
				})} cannot be undone, because it is no longer the most recent commit.`,
			);

			return;
		}

		await commands.executeCommand(BuiltInGitCommands.UndoCommit, node.repoPath);
	}

	@debug()
	private compareHeadWith(node: ViewRefNode) {
		if (!(node instanceof ViewRefNode)) return Promise.resolve();

		return Container.searchAndCompareView.compare(node.repoPath, 'HEAD', node.ref);
	}

	@debug()
	private compareWorkingWith(node: ViewRefNode) {
		if (!(node instanceof ViewRefNode)) return Promise.resolve();

		return Container.searchAndCompareView.compare(node.repoPath, '', node.ref);
	}

	@debug()
	private compareWithSelected(node: ViewRefNode) {
		if (!(node instanceof ViewRefNode)) return;

		Container.searchAndCompareView.compareWithSelected(node.repoPath, node.ref);
	}

	@debug()
	private selectForCompare(node: ViewRefNode) {
		if (!(node instanceof ViewRefNode)) return;

		Container.searchAndCompareView.selectForCompare(node.repoPath, node.ref);
	}

	@debug()
	private compareFileWithSelected(node: ViewRefFileNode) {
		if (this._selectedFile == null || !(node instanceof ViewRefFileNode) || node.ref == null) {
			return Promise.resolve();
		}

		if (this._selectedFile.repoPath !== node.repoPath) {
			this.selectFileForCompare(node);
			return Promise.resolve();
		}

		const selected = this._selectedFile;

		this._selectedFile = undefined;
		void setContext(ContextKeys.ViewsCanCompareFile, false);

		return executeCommand<DiffWithCommandArgs>(Commands.DiffWith, {
			repoPath: selected.repoPath,
			lhs: {
				sha: selected.ref,
				uri: selected.uri!,
			},
			rhs: {
				sha: node.ref.ref,
				uri: node.uri,
			},
		});
	}

	private _selectedFile: CompareSelectedInfo | undefined;

	@debug()
	private selectFileForCompare(node: ViewRefFileNode) {
		if (!(node instanceof ViewRefFileNode) || node.ref == null) return;

		this._selectedFile = {
			ref: node.ref.ref,
			repoPath: node.repoPath,
			uri: node.uri,
		};
		void setContext(ContextKeys.ViewsCanCompareFile, true);
	}

	@debug()
	private async openAllChanges(node: CommitNode | ResultsFilesNode, options?: TextDocumentShowOptions) {
		if (!(node instanceof CommitNode) && !(node instanceof ResultsFilesNode)) return undefined;

		if (node instanceof ResultsFilesNode) {
			const { files: diff } = await node.getFilesQueryResults();
			if (diff == null || diff.length === 0) return undefined;

			return GitActions.Commit.openAllChanges(
				diff,
				{
					repoPath: node.repoPath,
					ref1: node.ref1,
					ref2: node.ref2,
				},
				options,
			);
		}

		return GitActions.Commit.openAllChanges(node.commit, options);
	}

	@debug()
	private openChanges(node: ViewRefFileNode) {
		if (!(node instanceof ViewRefFileNode)) return;

		const command = node.getCommand();
		if (command?.arguments == null) return;

		switch (command.command) {
			case Commands.DiffWith: {
				const [args] = command.arguments as [DiffWithCommandArgs];
				args.showOptions!.preview = false;
				void executeCommand<DiffWithCommandArgs>(command.command, args);
				break;
			}
			case Commands.DiffWithPrevious: {
				const [, args] = command.arguments as [Uri, DiffWithPreviousCommandArgs];
				args.showOptions!.preview = false;
				void executeEditorCommand<DiffWithPreviousCommandArgs>(command.command, undefined, args);
				break;
			}
			default:
				throw new Error(`Unexpected command: ${command.command}`);
		}
	}

	@debug()
	private async openAllChangesWithWorking(node: CommitNode | ResultsFilesNode, options?: TextDocumentShowOptions) {
		if (!(node instanceof CommitNode) && !(node instanceof ResultsFilesNode)) return undefined;

		if (node instanceof ResultsFilesNode) {
			const { files: diff } = await node.getFilesQueryResults();
			if (diff == null || diff.length === 0) return undefined;

			return GitActions.Commit.openAllChangesWithWorking(
				diff,
				{
					repoPath: node.repoPath,
					ref: node.ref1 || node.ref2,
				},
				options,
			);
		}

		return GitActions.Commit.openAllChangesWithWorking(node.commit, options);
	}

	@debug()
	private async openChangesWithWorking(node: ViewRefFileNode) {
		if (!(node instanceof ViewRefFileNode)) return Promise.resolve();

		return GitActions.Commit.openChangesWithWorking(node.file, { repoPath: node.repoPath, ref: node.ref.ref });
	}

	@debug()
	private async openPreviousChangesWithWorking(node: ViewRefFileNode) {
		if (!(node instanceof ViewRefFileNode)) return Promise.resolve();

		return GitActions.Commit.openChangesWithWorking(node.file, {
			repoPath: node.repoPath,
			ref: `${node.ref.ref}^`,
		});
	}

	@debug()
	private openFile(node: ViewRefFileNode, options?: TextDocumentShowOptions) {
		if (!(node instanceof ViewRefFileNode)) return Promise.resolve();

		return GitActions.Commit.openFile(node.uri, {
			preserveFocus: true,
			preview: false,
			...options,
		});
	}

	@debug()
	private async openFiles(node: CommitNode | ResultsFilesNode) {
		if (!(node instanceof CommitNode) && !(node instanceof ResultsFilesNode)) return undefined;

		if (node instanceof ResultsFilesNode) {
			const { files: diff } = await node.getFilesQueryResults();
			if (diff == null || diff.length === 0) return undefined;

			return GitActions.Commit.openFiles(diff, node.repoPath, node.ref1 || node.ref2);
		}

		return GitActions.Commit.openFiles(node.commit);
	}

	@debug()
	private openRevision(node: CommitFileNode | ResultsFileNode, options?: OpenFileAtRevisionCommandArgs) {
		if (!(node instanceof CommitFileNode) && !(node instanceof ResultsFileNode)) return Promise.resolve();

		options = { showOptions: { preserveFocus: true, preview: false }, ...options };

		let uri = options.revisionUri;
		if (uri == null) {
			if (node instanceof ResultsFileNode) {
				uri = GitUri.toRevisionUri(node.uri);
			} else {
				uri =
					node.commit.status === 'D'
						? GitUri.toRevisionUri(
								node.commit.previousSha!,
								node.commit.previousUri.fsPath,
								node.commit.repoPath,
						  )
						: GitUri.toRevisionUri(node.uri);
			}
		}

		return GitActions.Commit.openFileAtRevision(
			uri,
			options.showOptions ?? { preserveFocus: true, preview: false },
		);
	}

	@debug()
	private async openRevisions(node: CommitNode | ResultsFilesNode, _options?: TextDocumentShowOptions) {
		if (!(node instanceof CommitNode) && !(node instanceof ResultsFilesNode)) return undefined;

		if (node instanceof ResultsFilesNode) {
			const { files: diff } = await node.getFilesQueryResults();
			if (diff == null || diff.length === 0) return undefined;

			return GitActions.Commit.openFilesAtRevision(diff, node.repoPath, node.ref1, node.ref2);
		}

		return GitActions.Commit.openFilesAtRevision(node.commit);
	}
}
