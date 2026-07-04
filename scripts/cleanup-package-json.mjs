#!/usr/bin/env node
/**
 * Second-pass package.json cleanup: modes, menu when-clauses, section titles.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const modeCommands = new Set([
	'gitlens.switchMode',
	'gitlens.toggleReviewMode',
	'gitlens.toggleZenMode',
]);

function stripMenuConfigWhen(when) {
	if (typeof when !== 'string') return when;
	return when
		.replace(/\s*&&\s*config\.gitlens\.menus\.[^\s]+/g, '')
		.replace(/\s*&&\s*!config\.gitlens\.fileAnnotations\.command/g, '')
		.replace(/\s*&&\s*!gitlens:annotationStatus/g, '')
		.replace(/\s*&&\s*config\.gitlens\.menus\.editor\.blame/g, '')
		.trim();
}

function cleanObject(obj) {
	if (Array.isArray(obj)) {
		return obj.map(cleanObject);
	}
	if (obj != null && typeof obj === 'object') {
		const out = {};
		for (const [k, v] of Object.entries(obj)) {
			out[k] = k === 'when' && typeof v === 'string' ? stripMenuConfigWhen(v) : cleanObject(v);
		}
		return out;
	}
	return obj;
}

const beforeCommands = pkg.contributes.commands.length;
pkg.contributes.commands = pkg.contributes.commands.filter(c => !modeCommands.has(c.command));

pkg.activationEvents = (pkg.activationEvents ?? []).filter(ev => {
	if (!ev.startsWith('onCommand:')) return true;
	return !modeCommands.has(ev.replace(/^onCommand:/i, ''));
});

const titleRenames = {
	'File History View': 'File History',
	'Branches View': 'Sorting',
	'%Tags View%': 'Sorting',
	'%Contributors View%': 'Sorting',
};

const beforeSections = pkg.contributes.configuration.length;
pkg.contributes.configuration = pkg.contributes.configuration
	.filter(section => section.title !== 'Modes')
	.map(section => ({
		...section,
		title: titleRenames[section.title] ?? section.title,
	}));

// Merge duplicate "Sorting" sections into one
const sortingProps = {};
const otherSections = [];
for (const section of pkg.contributes.configuration) {
	if (section.title === 'Sorting') {
		Object.assign(sortingProps, section.properties);
	} else {
		otherSections.push(section);
	}
}
if (Object.keys(sortingProps).length > 0) {
	otherSections.splice(3, 0, {
		title: 'Sorting',
		order: 25,
		properties: sortingProps,
	});
}
pkg.contributes.configuration = otherSections;

pkg.contributes.menus = cleanObject(pkg.contributes.menus);
pkg.contributes.keybindings = cleanObject(pkg.contributes.keybindings);

// Remove mode commands from commandPalette menus
for (const [key, items] of Object.entries(pkg.contributes.menus)) {
	pkg.contributes.menus[key] = items.filter(item => item == null || !modeCommands.has(item.command));
}

pkg.description =
	'(PaulShorey Modified) Git compare and search for VS Code — compare references, browse changed files, and open diffs in the editor.';
pkg.keywords = ['gitlens', 'git', 'compare', 'diff', 'search'];

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, '\t')}\n`);

console.log('cleanup-package-json:');
console.log(`  commands removed: ${beforeCommands - pkg.contributes.commands.length}`);
console.log(`  configuration sections: ${beforeSections} -> ${pkg.contributes.configuration.length}`);
