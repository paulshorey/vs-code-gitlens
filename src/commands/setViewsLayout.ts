'use strict';
import { commands } from 'vscode';
import { viewsConfigKeys } from '../configuration';
import { command, Command, Commands } from './common';

const gitlensViewIds = [
	'gitlens.views.welcome',
	'gitlens.views.kylincommitsRelevant',
	...viewsConfigKeys.map(view => `gitlens.views.${view}`),
];

@command()
export class SetViewsLayoutCommand extends Command {
	constructor() {
		super(Commands.SetViewsLayout);
	}

	async execute() {
		try {
			// Run twice to avoid partial moves in VS Code view state.
			let count = 0;
			while (count++ < 2) {
				await commands.executeCommand('vscode.moveViews', {
					viewIds: gitlensViewIds,
					destinationId: 'workbench.view.extension.gitlens',
				});
			}
		} catch {
			for (const viewId of gitlensViewIds) {
				try {
					await commands.executeCommand(`${viewId}.resetViewLocation`);
				} catch {}
			}
		}

		await commands.executeCommand('workbench.view.extension.gitlens');
	}
}
