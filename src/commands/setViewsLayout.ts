'use strict';
import { commands, window } from 'vscode';
import { viewsConfigKeys } from '../configuration';
import { command, Command, Commands } from './common';

const viewIds = [
	'gitlens.views.welcome',
	'gitlens.views.kylincommitsRelevant',
	...viewsConfigKeys.map(view => `gitlens.views.${view}`),
];

enum ViewsLayout {
	GitLens = 'gitlens',
	SourceControl = 'scm',
}

export interface SetViewsLayoutCommandArgs {
	layout: ViewsLayout;
}

@command()
export class SetViewsLayoutCommand extends Command {
	constructor() {
		super(Commands.SetViewsLayout);
	}

	async execute(args?: SetViewsLayoutCommandArgs) {
		let layout = args?.layout;
		if (layout == null) {
			const pick = await window.showQuickPick(
				[
					{
						label: 'Source Control Layout',
						description: '',
						detail: 'Shows all the views together on the Source Control side bar',
						layout: ViewsLayout.SourceControl,
					},
					{
						label: 'GitLens Layout',
						description: '(default)',
						detail: 'Shows all the views together on the GitLens side bar',
						layout: ViewsLayout.GitLens,
					},
				],
				{
					placeHolder: 'Choose a GitLens views layout',
				},
			);
			if (pick == null) return;

			layout = pick.layout;
		}

		switch (layout) {
			case ViewsLayout.GitLens:
				try {
					// Because of https://github.com/microsoft/vscode/issues/105774, run the command twice which seems to fix things
					let count = 0;
					while (count++ < 2) {
						void (await commands.executeCommand('vscode.moveViews', {
							viewIds,
							destinationId: 'workbench.view.extension.gitlens',
						}));
					}
				} catch {}

				break;
			case ViewsLayout.SourceControl:
				try {
					// Because of https://github.com/microsoft/vscode/issues/105774, run the command twice which seems to fix things
					let count = 0;
					while (count++ < 2) {
						void (await commands.executeCommand('vscode.moveViews', {
							viewIds,
							destinationId: 'workbench.view.scm',
						}));
					}
				} catch {
					for (const viewId of viewIds) {
						void (await commands.executeCommand(`${viewId}.resetViewLocation`));
					}
				}

				break;
		}
	}
}
