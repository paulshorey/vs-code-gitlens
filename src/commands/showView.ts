'use strict';
import { Container } from '../container';
import { command, Command, CommandContext, Commands } from './common';

@command()
export class ShowViewCommand extends Command {
	constructor() {
		super([Commands.ShowSearchAndCompareView]);
	}

	protected override preExecute(_context: CommandContext) {
		return this.execute();
	}

	async execute() {
		return Container.searchAndCompareView.show();
	}
}
