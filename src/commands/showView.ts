'use strict';
import { commands } from 'vscode';
import { Container } from '../container';
import { command, Command, CommandContext, Commands } from './common';

@command()
export class ShowViewCommand extends Command {
	constructor() {
		super([
			Commands.ShowBranchesView,
			Commands.ShowCommitsView,
			Commands.ShowContributorsView,
			Commands.ShowFileHistoryView,
			Commands.ShowLineHistoryView,
			Commands.ShowRemotesView,
			Commands.ShowRepositoriesView,
			Commands.ShowSearchAndCompareView,
			Commands.ShowStashesView,
			Commands.ShowTagsView,
			Commands.ShowWelcomeView,
			Commands.ShowKylinCommitsView,
		]);
	}

	protected override preExecute(context: CommandContext) {
		return this.execute(context.command as Commands);
	}

	async execute(command: Commands) {
		switch (command) {
			case Commands.ShowBranchesView:
				return Container.branchesView.show();
			case Commands.ShowCommitsView:
				return Container.commitsView.show();
			case Commands.ShowContributorsView:
				return Container.contributorsView.show();
			case Commands.ShowFileHistoryView:
				return Container.fileHistoryView.show();
			case Commands.ShowLineHistoryView:
				return Container.lineHistoryView.show();
			//case Commands.ShowKylinCommitsView:
				//return Container.commitsrelevantView.show();
			case Commands.ShowRemotesView:
				return Container.remotesView.show();
			case Commands.ShowRepositoriesView:
				return Container.repositoriesView.show();
			case Commands.ShowSearchAndCompareView:
				return Container.searchAndCompareView.show();
			case Commands.ShowStashesView:
				return Container.stashesView.show();
			case Commands.ShowTagsView:
				return Container.tagsView.show();
			case Commands.ShowWelcomeView:
				return commands.executeCommand('gitlens.views.welcome.focus');
		}

		return Promise.resolve(undefined);
	}
}
