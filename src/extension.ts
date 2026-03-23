/**
 * GitLens extension entry point.
 * Kylin fork of eamodio/vscode-gitlens (v11.7.0 base) with commit chart visualizations.
 */
'use strict';
import { commands, ExtensionContext, window, workspace } from 'vscode';
import type { CreatePullRequestActionContext, GitLensApi, OpenPullRequestActionContext } from '../src/api/gitlens';
import { Api } from './api/api';
import { Commands, executeCommand, OpenPullRequestOnRemoteCommandArgs, registerCommands } from './commands';
import { CreatePullRequestOnRemoteCommandArgs } from './commands/createPullRequestOnRemote';
import { configuration, Configuration, TraceLevel } from './configuration';
import { ContextKeys, GlobalState, GlyphChars, setContext, SyncedState } from './constants';
import { Container } from './container';
import Controller from './controllers/mainController';
import { Git, GitBranch, GitCommit } from './git/git';
import { GitService } from './git/gitService';
import { GitUri } from './git/gitUri';
import { InvalidGitConfigError, UnableToFindGitError } from './git/locator';
import { Logger } from './logger';
import { Messages } from './messages';
import { registerPartnerActionRunners } from './partners';
import { Strings, Versions } from './system';
import { ViewNode } from './views/nodes';

let _context: ExtensionContext | undefined;

export async function activate(context: ExtensionContext): Promise<GitLensApi | undefined> {
	const start = process.hrtime();

	_context = context;

	// Register Kylin-specific commands for commit chart views
	const controller = new Controller(context);
	const disposable = commands.registerCommand('kylin.viewCommits', () => {
		void controller.showCommitsPanel();
	});
	context.subscriptions.push(disposable);
	//

	const disposablesinglefile = commands.registerCommand('kylin.viewfilehistory', () => {
		void controller.showsinglefileCommitsPanel();
	});
	context.subscriptions.push(disposablesinglefile);





	// Pretend we are enabled (until we know otherwise) and set the view contexts to reduce flashing on load
	void setContext(ContextKeys.Enabled, true);

	if (!workspace.isTrusted) {
		void setContext(ContextKeys.Readonly, true);
		context.subscriptions.push(
			workspace.onDidGrantWorkspaceTrust(() => void setContext(ContextKeys.Readonly, undefined)),
		);
	}

	setKeysForSync();

	Logger.configure(context, configuration.get('outputLevel'), o => {
		if (GitUri.is(o)) {
			return `GitUri(${o.toString(true)}${o.repoPath ? ` repoPath=${o.repoPath}` : ''}${
				o.sha ? ` sha=${o.sha}` : ''
			})`;
		}

		if (GitCommit.is(o)) {
			return `GitCommit(${o.sha ? ` sha=${o.sha}` : ''}${o.repoPath ? ` repoPath=${o.repoPath}` : ''})`;
		}

		if (ViewNode.is(o)) {
			return o.toString();
		}

		return undefined;
	});

	const gitlensVersion = context.extension.packageJSON.version;

	const syncedVersion = context.globalState.get<string>(SyncedState.Version);
	const localVersion =
		context.globalState.get<string>(GlobalState.Version) ??
		context.globalState.get<string>(GlobalState.Deprecated_Version);

	let previousVersion;
	if (localVersion == null || syncedVersion == null) {
		previousVersion = syncedVersion ?? localVersion;
	} else if (Versions.compare(syncedVersion, localVersion) === 1) {
		previousVersion = syncedVersion;
	} else {
		previousVersion = localVersion;
	}

	if (Logger.willLog('debug')) {
		Logger.debug(
			`GitLens (v${gitlensVersion}): syncedVersion=${syncedVersion}, localVersion=${localVersion}, previousVersion=${previousVersion}`,
		);
	}

	const enabled = workspace.getConfiguration('git', null).get<boolean>('enabled', true);
	if (!enabled) {
		Logger.log(`GitLens (v${gitlensVersion}) was NOT activated -- "git.enabled": false`);
		void setEnabled(false);

		void Messages.showGitDisabledErrorMessage();

		return undefined;
	}

	Configuration.configure(context);

	const cfg = configuration.get();

	// await migrateSettings(context, previousVersion);

	try {
		await GitService.initialize();
	} catch (ex) {
		Logger.error(ex, `GitLens (v${gitlensVersion}) activate`);
		void setEnabled(false);

		if (ex instanceof InvalidGitConfigError) {
			void Messages.showGitInvalidConfigErrorMessage();
		} else if (ex instanceof UnableToFindGitError) {
			void Messages.showGitMissingErrorMessage();
		} else {
			const msg: string = ex?.message ?? '';
			if (msg) {
				void window.showErrorMessage(`Unable to initialize Git; ${msg}`);
			}
		}

		return undefined;
	}

	Container.initialize(context, cfg);

	registerCommands(context);
	registerBuiltInActionRunners(context);
	registerPartnerActionRunners(context);
	void ensureVisibleViews(context);

	const gitVersion = Git.getGitVersion();

	notifyOnUnsupportedGitVersion(gitVersion);
	void context.globalState.update(GlobalState.Version, gitlensVersion);

	// Only update our synced version if the new version is greater
	if (syncedVersion == null || Versions.compare(gitlensVersion, syncedVersion) === 1) {
		void context.globalState.update(SyncedState.Version, gitlensVersion);
	}

	if (cfg.outputLevel === TraceLevel.Debug) {
		setTimeout(async () => {
			if (cfg.outputLevel !== TraceLevel.Debug) return;

			if (await Messages.showDebugLoggingWarningMessage()) {
				void commands.executeCommand(Commands.DisableDebugLogging);
			}
		}, 60000);
	}

	Logger.log(
		`GitLens (v${gitlensVersion}${cfg.mode.active ? `, mode: ${cfg.mode.active}` : ''}) activated ${
			GlyphChars.Dot
		} ${Strings.getDurationMilliseconds(start)} ms`,
	);

	const api = new Api();
	return api;
}

export function deactivate() {
	// nothing to do
}

// async function migrateSettings(context: ExtensionContext, previousVersion: string | undefined) {
// 	if (previousVersion === undefined) return;

// 	const previous = Versions.fromString(previousVersion);

// 	try {
// 		if (Versions.compare(previous, Versions.from(11, 0, 0)) !== 1) {
// 		}
// 	} catch (ex) {
// 		Logger.error(ex, 'migrateSettings');
// 	}
// }

export async function setEnabled(enabled: boolean): Promise<void> {
	await Promise.all([setContext(ContextKeys.Enabled, enabled), setContext(ContextKeys.Disabled, !enabled)]);
}

export function setKeysForSync(...keys: (SyncedState | string)[]) {
	return _context?.globalState?.setKeysForSync([...keys, SyncedState.Version]);
}

export function notifyOnUnsupportedGitVersion(version: string) {
	if (GitService.compareGitVersion('2.7.2') !== -1) return;

	// If git is less than v2.7.2
	void Messages.showGitVersionUnsupportedErrorMessage(version, '2.7.2');
}

function registerBuiltInActionRunners(context: ExtensionContext): void {
	context.subscriptions.push(
		Container.actionRunners.registerBuiltIn<CreatePullRequestActionContext>('createPullRequest', {
			label: ctx => `Create Pull Request on ${ctx.remote?.provider?.name ?? 'Remote'}`,
			run: async ctx => {
				if (ctx.type !== 'createPullRequest') return;

				void (await executeCommand<CreatePullRequestOnRemoteCommandArgs>(Commands.CreatePullRequestOnRemote, {
					base: undefined,
					compare: ctx.branch.isRemote
						? GitBranch.getNameWithoutRemote(ctx.branch.name)
						: ctx.branch.upstream
						? GitBranch.getNameWithoutRemote(ctx.branch.upstream)
						: ctx.branch.name,
					remote: ctx.remote?.name ?? '',
					repoPath: ctx.repoPath,
				}));
			},
		}),
		Container.actionRunners.registerBuiltIn<OpenPullRequestActionContext>('openPullRequest', {
			label: ctx => `Open Pull Request on ${ctx.provider?.name ?? 'Remote'}`,
			run: async ctx => {
				if (ctx.type !== 'openPullRequest') return;

				void (await executeCommand<OpenPullRequestOnRemoteCommandArgs>(Commands.OpenPullRequestOnRemote, {
					pr: { url: ctx.pullRequest.url },
				}));
			},
		}),
	);
}

const startupViewIds = [
	'gitlens.views.welcome',
	'gitlens.views.commits',
	'gitlens.views.repositories',
	'gitlens.views.fileHistory',
	'gitlens.views.kylincommitsRelevant',
	'gitlens.views.lineHistory',
	'gitlens.views.branches',
	'gitlens.views.remotes',
	'gitlens.views.stashes',
	'gitlens.views.tags',
	'gitlens.views.contributors',
	'gitlens.views.searchAndCompare',
];

async function ensureVisibleViews(_context: ExtensionContext) {
	try {
		await commands.executeCommand('vscode.moveViews', {
			viewIds: startupViewIds,
			destinationId: 'workbench.panel.extension.gitlens',
		});
	} catch {
		for (const viewId of startupViewIds) {
			try {
				await commands.executeCommand(`${viewId}.resetViewLocation`);
			} catch {}
		}
	}

	try {
		await commands.executeCommand('workbench.panel.extension.gitlens');
	} catch {}
}
