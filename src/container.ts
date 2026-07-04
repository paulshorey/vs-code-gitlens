'use strict';
import { ExtensionContext } from 'vscode';
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

export class Container {
	static initialize(context: ExtensionContext, config: Config) {
		this._context = context;
		this._config = config;

		context.subscriptions.push((this._actionRunners = new ActionRunners()));
		context.subscriptions.push((this._lineTracker = new GitLineTracker()));
		context.subscriptions.push((this._tracker = new GitDocumentTracker()));

		context.subscriptions.push((this._git = new GitService()));

		context.subscriptions.push(new ViewFileDecorationProvider());

		// Since there is a bit of a chicken & egg problem with the DocumentTracker and the GitService, initialize the tracker once the GitService is loaded
		this._tracker.initialize();

		context.subscriptions.push((this._keyboard = new Keyboard()));

		context.subscriptions.push((this._searchAndCompareView = new SearchAndCompareView()));

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
			this._config = configuration.get();
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

	private static _searchAndCompareView: SearchAndCompareView | undefined;
	static get searchAndCompareView() {
		if (this._searchAndCompareView == null) {
			this._context.subscriptions.push((this._searchAndCompareView = new SearchAndCompareView()));
		}

		return this._searchAndCompareView;
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
}
