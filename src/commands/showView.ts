'use strict';
import { commands } from 'vscode';
import { ContextKeys, setContext, SyncedState } from '../constants';
import { Container } from '../container';
import { command, Command, CommandContext, Commands } from './common';

@command()
export class ShowViewCommand extends Command {
	constructor() {
		super([Commands.ShowSearchAndCompareView, Commands.ShowWelcomeView]);
	}

	protected override preExecute(context: CommandContext) {
		return this.execute(context.command as Commands);
	}

	async execute(command: Commands) {
		switch (command) {
			case Commands.ShowSearchAndCompareView:
				return Container.searchAndCompareView.show();
			case Commands.ShowWelcomeView:
				await setContext(ContextKeys.ViewsWelcomeVisible, true);
				void Container.context.globalState.update(SyncedState.WelcomeViewVisible, true);
				void (await commands.executeCommand('gitlens.views.welcome.focus'));
		}

		return Promise.resolve(undefined);
	}
}
