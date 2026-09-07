// Copy the built plugin files into one or more Obsidian vault plugin folders.
//
// The destination is intentionally NOT hardcoded here, so no personal path is
// ever committed. It is resolved in this order:
//
//   1. The VAULT_PLUGIN_DIR environment variable (one path, useful for one-offs)
//   2. A gitignored `.deploy-target` file in the repo root — one vault plugin
//      folder per line; blank lines and lines starting with `#` are ignored
//
// Create `.deploy-target` once, e.g.:
//
//   # one path per line
//   /path/to/YourVault/.obsidian/plugins/ttrpg-maps
//
// Usage:
//   npm run deploy          # build, then copy
//   node scripts/deploy.mjs # copy only (assumes a build already ran)

import { copyFileSync, mkdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_FILE = join(repoRoot, '.deploy-target');

/** The only files Obsidian needs in order to load the plugin. */
const FILES = ['main.js', 'manifest.json', 'styles.css', 'gi-icons.json'];

function readTargets() {
	const fromEnv = process.env.VAULT_PLUGIN_DIR?.trim();
	if (fromEnv) return [fromEnv];

	if (!existsSync(TARGET_FILE)) return [];
	return readFileSync(TARGET_FILE, 'utf8')
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith('#'));
}

const targets = readTargets();

if (targets.length === 0) {
	console.error('No deploy target configured.\n');
	console.error('Create a .deploy-target file in the repo root with one vault plugin folder per line:');
	console.error('');
	console.error('  /path/to/YourVault/.obsidian/plugins/ttrpg-maps');
	console.error('');
	console.error('(.deploy-target is gitignored.) Or set VAULT_PLUGIN_DIR for a one-off copy.');
	process.exit(1);
}

const missing = FILES.filter((f) => !existsSync(join(repoRoot, f)));
if (missing.length) {
	console.error(`Cannot deploy — missing built files: ${missing.join(', ')}`);
	console.error('Run `npm run build` first.');
	process.exit(1);
}

for (const target of targets) {
	mkdirSync(target, { recursive: true });
	for (const f of FILES) {
		const from = join(repoRoot, f);
		copyFileSync(from, join(target, f));
	}
	const totalKb = FILES.reduce((sum, f) => sum + statSync(join(repoRoot, f)).size, 0) / 1024;
	console.log(`Deployed ${FILES.length} files (${totalKb.toFixed(0)} KB) -> ${target}`);
}

console.log('\nReload the plugin in Obsidian (toggle it off/on, or Ctrl+R) to load the new build.');
