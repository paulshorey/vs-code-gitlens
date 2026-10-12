import * as vscode from 'vscode';
import { GitClient } from './git/client.js';
import { ComparisonService } from './git/comparisons.js';
import { CompareController, type ComparisonApi } from './controller.js';

export function activate(context: vscode.ExtensionContext): ComparisonApi {
  const output = vscode.window.createOutputChannel('Git Compare');
  const git = new GitClient();
  const controller = new CompareController(context, new ComparisonService(git), output);
  context.subscriptions.push(controller, git, output);
  return controller;
}
