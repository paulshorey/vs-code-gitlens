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
			await commands.executeCommand('vscode.moveViews', {
				viewIds: gitlensViewIds,
				destinationId: 'workbench.panel.extension.gitlens',
			});
		} catch {
			for (const viewId of gitlensViewIds) {
				try {
					await commands.executeCommand(`${viewId}.resetViewLocation`);
				} catch {}
			}
		}

		await commands.executeCommand('workbench.panel.extension.gitlens');
	}
}
