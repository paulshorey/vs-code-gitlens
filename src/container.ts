'use strict';
import { ConfigurationChangeEvent, ConfigurationScope, ExtensionContext } from 'vscode';
import { Autolinks } from './annotations/autolinks';
import { ActionRunners } from './api/actionRunners';
import { resetAvatarCache } from './avatars';
import { Config, configuration, ConfigurationWillChangeEvent } from './configuration';
import { GitFileSystemProvider } from './git/fsProvider';
import { GitService } from './git/gitService';
import { Keyboard } from './keyboard';
import { Logger } from './logger';
import { memoize } from './system/decorators/memoize';
import { GitDocumentTracker } from './trackers/gitDocumentTracker';
import { GitLineTracker } from './trackers/gitLineTracker';
import { SearchAndCompareView } from './views/searchAndCompareView';
import { ViewCommands } from './views/viewCommands';
import { ViewFileDecorationProvider } from './views/viewDecorationProvider';
import { VslsController } from './vsls/vsls';
import { RebaseEditorProvider } from './webviews/rebaseEditor';
import { SettingsWebview } from './webviews/settingsWebview';
import { WelcomeWebview } from './webviews/welcomeWebview';

export class Container {
	private static _configsAffectedByMode: string[] | undefined;
	private static _applyModeConfigurationTransformBound:
		| ((e: ConfigurationChangeEvent) => ConfigurationChangeEvent)
		| undefined;

	static initialize(context: ExtensionContext, config: Config) {
		this._context = context;
		this._config = Container.applyMode(config);

		context.subscriptions.push((this._actionRunners = new ActionRunners()));
		context.subscriptions.push((this._lineTracker = new GitLineTracker()));
		context.subscriptions.push((this._tracker = new GitDocumentTracker()));
		context.subscriptions.push((this._vsls = new VslsController()));

		context.subscriptions.push((this._git = new GitService()));

		context.subscriptions.push(new ViewFileDecorationProvider());

		// Since there is a bit of a chicken & egg problem with the DocumentTracker and the GitService, initialize the tracker once the GitService is loaded
		this._tracker.initialize();

		context.subscriptions.push((this._keyboard = new Keyboard()));
		context.subscriptions.push((this._settingsWebview = new SettingsWebview()));
		context.subscriptions.push((this._welcomeWebview = new WelcomeWebview()));

		// Search & Compare is the only sidebar tree view this fork ships. The other GitLens
		// views (repositories, commits, branches, remotes, stashes, tags, contributors,
		// file/line history) are no longer contributed in package.json and are intentionally
		// not instantiated here. Their classes remain only as transitively-referenced types
		// and are never registered as tree providers.
		context.subscriptions.push((this._searchAndCompareView = new SearchAndCompareView()));

		context.subscriptions.push((this._rebaseEditor = new RebaseEditorProvider()));

		context.subscriptions.push(new GitFileSystemProvider());

		context.subscriptions.push(configuration.onWillChange(this.onConfigurationChanging, this));
	}

	private static onConfigurationChanging(e: ConfigurationWillChangeEvent) {
		this._config = undefined;

		if (configuration.changed(e.change, 'outputLevel')) {
			Logger.level = configuration.get('outputLevel');
		}

		if (configuration.changed(e.change, 'defaultGravatarsStyle')) {
			resetAvatarCache('fallback');
		}

		if (configuration.changed(e.change, 'mode') || configuration.changed(e.change, 'modes')) {
			if (this._applyModeConfigurationTransformBound == null) {
				this._applyModeConfigurationTransformBound = this.applyModeConfigurationTransform.bind(this);
			}
			e.transform = this._applyModeConfigurationTransformBound;
		}
	}

	private static _actionRunners: ActionRunners;
	static get actionRunners() {
		if (this._actionRunners == null) {
			this._context.subscriptions.push((this._actionRunners = new ActionRunners()));
		}

		return this._actionRunners;
	}

	private static _autolinks: Autolinks;
	static get autolinks() {
		if (this._autolinks == null) {
			this._context.subscriptions.push((this._autolinks = new Autolinks()));
		}

		return this._autolinks;
	}

	private static _config: Config | undefined;
	static get config() {
		if (this._config == null) {
			this._config = Container.applyMode(configuration.get());
		}
		return this._config;
	}

	private static _context: ExtensionContext;
	static get context() {
		return this._context;
	}

	private static _git: GitService;
	static get git() {
		return this._git;
	}

	private static _github: Promise<import('./github/github').GitHubApi | undefined> | undefined;
	static get github() {
		if (this._github == null) {
			this._github = this._loadGitHubApi();
		}

		return this._github;
	}

	private static async _loadGitHubApi() {
		try {
			return new (await import(/* webpackChunkName: "github" */ './github/github')).GitHubApi();
		} catch (ex) {
			Logger.error(ex);
			return undefined;
		}
	}

	@memoize()
	static get insiders() {
		return this._context.extension.id.endsWith('-insiders');
	}

	private static _keyboard: Keyboard;
	static get keyboard() {
		return this._keyboard;
	}

	private static _lineTracker: GitLineTracker;
	static get lineTracker() {
		return this._lineTracker;
	}

	private static _rebaseEditor: RebaseEditorProvider | undefined;
	static get rebaseEditor() {
		if (this._rebaseEditor == null) {
			this._context.subscriptions.push((this._rebaseEditor = new RebaseEditorProvider()));
		}

		return this._rebaseEditor;
	}

	private static _searchAndCompareView: SearchAndCompareView | undefined;
	static get searchAndCompareView() {
		if (this._searchAndCompareView == null) {
			this._context.subscriptions.push((this._searchAndCompareView = new SearchAndCompareView()));
		}

		return this._searchAndCompareView;
	}

	private static _settingsWebview: SettingsWebview;
	static get settingsWebview() {
		return this._settingsWebview;
	}

	private static _tracker: GitDocumentTracker;
	static get tracker() {
		return this._tracker;
	}

	private static _viewCommands: ViewCommands | undefined;
	static get viewCommands() {
		if (this._viewCommands == null) {
			this._viewCommands = new ViewCommands();
		}
		return this._viewCommands;
	}

	private static _vsls: VslsController;
	static get vsls() {
		return this._vsls;
	}

	private static _welcomeWebview: WelcomeWebview;
	static get welcomeWebview() {
		return this._welcomeWebview;
	}

	private static applyMode(config: Config) {
		// The editor-decoration subsystems that `modes` used to toggle (blame/changes/heatmap
		// annotations, code lens, current-line, hovers, status bar) have been removed from this
		// fork, so applying a mode no longer has any effect. Kept as a pass-through so the
		// `mode`/`modes` settings remain harmless.
		return config;
	}

	private static applyModeConfigurationTransform(e: ConfigurationChangeEvent): ConfigurationChangeEvent {
		if (this._configsAffectedByMode == null) {
			this._configsAffectedByMode = [
				`gitlens.${configuration.name('mode')}`,
				`gitlens.${configuration.name('modes')}`,
				`gitlens.${configuration.name('blame.toggleMode')}`,
				`gitlens.${configuration.name('changes.toggleMode')}`,
				`gitlens.${configuration.name('codeLens')}`,
				`gitlens.${configuration.name('currentLine')}`,
				`gitlens.${configuration.name('heatmap.toggleMode')}`,
				`gitlens.${configuration.name('hovers')}`,
				`gitlens.${configuration.name('statusBar')}`,
			];
		}

		const original = e.affectsConfiguration;
		return {
			...e,
			affectsConfiguration: (section: string, scope?: ConfigurationScope) =>
				this._configsAffectedByMode?.some(n => section.startsWith(n)) ? true : original(section, scope),
		};
	}
}
