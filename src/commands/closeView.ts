'use strict';
import { command, Command, CommandContext, Commands } from './common';

@command()
export class CloseViewCommand extends Command {
	constructor() {
		super([Commands.CloseWelcomeView]);
	}

	protected override preExecute(context: CommandContext) {
		return Promise.resolve(this.execute(context.command as Commands));
	}

	execute(command: Commands) {
		switch (command) {
			case Commands.CloseWelcomeView:
				return undefined;
		}

		return undefined;
	}
}
