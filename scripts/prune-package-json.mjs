#!/usr/bin/env node
/**
 * Prune dead commands, menus, keybindings, and other contributions from package.json
 * after slimming GitLens to Search & Compare only.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const removedViewNames =
	'branches|commits|contributors|fileHistory|lineHistory|remotes|repositories|stashes|tags|welcome';
const removedViewPattern = new RegExp(`gitlens\\\\?\\.views\\\\?\\.(${removedViewNames})(\\\\\\.|\\.|$|\\b)`);
const removedViewConfigPattern = new RegExp(
	`config\\.gitlens\\.views\\.(${removedViewNames.replace('|welcome', '')})\\.`,
);

const removedSubmenus = new Set([
	'gitlens/editor/annotations',
	'gitlens/view/repositories/sections',
]);

const removedCommands = new Set([
	'gitlens.showWelcomePage',
	'gitlens.showWelcomeView',
	'gitlens.closeWelcomeView',
	'gitlens.inviteToLiveShare',
	'gitlens.enableRebaseEditor',
	'gitlens.disableRebaseEditor',
	'gitlens.views.highlightChanges',
	'gitlens.views.highlightRevisionChanges',
	'gitlens.views.setBranchComparisonToWorking',
	'gitlens.views.setBranchComparisonToBranch',
	'gitlens.showBranchesView',
	'gitlens.showCommitsView',
	'gitlens.showContributorsView',
	'gitlens.showFileHistoryView',
	'gitlens.showLineHistoryView',
	'gitlens.showRemotesView',
	'gitlens.showRepositoriesView',
	'gitlens.showStashesView',
	'gitlens.showTagsView',
]);

function shouldRemoveCommand(command) {
	if (!command || typeof command !== 'string') return false;
	if (removedCommands.has(command)) return true;
	if (/^gitlens\.showSettingsPage/.test(command)) return true;
	if (/^gitlens\.views\.(branches|commits|contributors|fileHistory|lineHistory|remotes|repositories|stashes|tags)\./.test(command)) {
		return true;
	}
	return false;
}

function shouldRemoveWhen(when) {
	if (!when || typeof when !== 'string') return false;
	if (removedViewPattern.test(when)) return true;
	if (removedViewConfigPattern.test(when)) return true;
	if (/view\s*==\s*gitlens\.views\.welcome/.test(when)) return true;
	if (/focusedView\s*=~\s*\/\^gitlens\\\.views\\\.(branches|commits|contributors|fileHistory|lineHistory|remotes|repositories|stashes|tags)/.test(when)) {
		return true;
	}
	return false;
}

function shouldRemoveMenuItem(item) {
	if (item == null || typeof item !== 'object') return false;
	if (item.submenu != null && removedSubmenus.has(item.submenu)) return true;
	if (shouldRemoveCommand(item.command)) return true;
	if (shouldRemoveWhen(item.when)) return true;
	return false;
}

function pruneMenuItems(items) {
	if (!Array.isArray(items)) return items;
	return items.filter(item => !shouldRemoveMenuItem(item));
}

function pruneMenus(menus) {
	if (menus == null || typeof menus !== 'object') return menus;
	const result = {};
	for (const [key, items] of Object.entries(menus)) {
		const pruned = pruneMenuItems(items);
		if (pruned.length > 0) {
			result[key] = pruned;
		}
	}
	return result;
}

const stats = {
	commands: 0,
	menus: 0,
	keybindings: 0,
	submenus: 0,
	activationEvents: 0,
	colors: 0,
};

const beforeCommands = pkg.contributes.commands.length;
pkg.contributes.commands = pkg.contributes.commands.filter(c => {
	if (shouldRemoveCommand(c.command)) {
		stats.commands++;
		return false;
	}
	return true;
});

const menusBefore = JSON.stringify(pkg.contributes.menus);
pkg.contributes.menus = pruneMenus(pkg.contributes.menus);
stats.menus = (menusBefore.match(/"command":/g)?.length ?? 0) - (JSON.stringify(pkg.contributes.menus).match(/"command":/g)?.length ?? 0);

const beforeKeybindings = pkg.contributes.keybindings?.length ?? 0;
pkg.contributes.keybindings = (pkg.contributes.keybindings ?? []).filter(kb => {
	if (shouldRemoveCommand(kb.command)) {
		stats.keybindings++;
		return false;
	}
	if (shouldRemoveWhen(kb.when)) {
		stats.keybindings++;
		return false;
	}
	return true;
});

const beforeSubmenus = pkg.contributes.submenus?.length ?? 0;
pkg.contributes.submenus = (pkg.contributes.submenus ?? []).filter(s => {
	if (removedSubmenus.has(s.id)) {
		stats.submenus++;
		return false;
	}
	return true;
});

const beforeActivation = pkg.activationEvents.length;
pkg.activationEvents = pkg.activationEvents.filter(ev => {
	if (!ev.startsWith('onCommand:')) return true;
	const cmd = ev.replace(/^onCommand:/i, '');
	if (shouldRemoveCommand(cmd)) {
		stats.activationEvents++;
		return false;
	}
	if (!pkg.contributes.commands.some(c => c.command === cmd)) {
		stats.activationEvents++;
		return false;
	}
	return true;
});

// Remove onCustomEditor for rebase if still present
pkg.activationEvents = pkg.activationEvents.filter(ev => ev !== 'onCustomEditor:gitlens.rebase');

// Dead annotation gutter colors (annotations removed)
const deadColorIds = new Set([
	'gitlens.gutterBackgroundColor',
	'gitlens.gutterForegroundColor',
	'gitlens.gutterUncommittedForegroundColor',
	'gitlens.trailingLineBackgroundColor',
	'gitlens.trailingLineForegroundColor',
	'gitlens.lineHighlightBackgroundColor',
	'gitlens.lineHighlightOverviewRulerColor',
]);
const beforeColors = pkg.contributes.colors?.length ?? 0;
pkg.contributes.colors = (pkg.contributes.colors ?? []).filter(c => {
	if (deadColorIds.has(c.id)) {
		stats.colors++;
		return false;
	}
	return true;
});

// codeLens defaults removed with codelens feature
delete pkg.contributes.configurationDefaults;

// Remove empty customEditors if present
if (Array.isArray(pkg.contributes.customEditors) && pkg.contributes.customEditors.length === 0) {
	delete pkg.contributes.customEditors;
}

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, '\t')}\n`);

console.log('Pruned package.json:');
console.log(`  commands: ${stats.commands} removed (${beforeCommands} -> ${pkg.contributes.commands.length})`);
console.log(`  menu command refs: ~${stats.menus} removed`);
console.log(`  keybindings: ${stats.keybindings} removed (${beforeKeybindings} -> ${pkg.contributes.keybindings.length})`);
console.log(`  submenus: ${stats.submenus} removed (${beforeSubmenus} -> ${pkg.contributes.submenus.length})`);
console.log(`  activationEvents: ${stats.activationEvents} removed (${beforeActivation} -> ${pkg.activationEvents.length})`);
console.log(`  colors: ${stats.colors} removed (${beforeColors} -> ${pkg.contributes.colors.length})`);
console.log('  configurationDefaults: removed');
