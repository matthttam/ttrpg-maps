/**
 * Updates manifest.json and versions.json with the new release version.
 * Called by semantic-release during the prepare phase.
 *
 * Usage: node scripts/update-obsidian-versions.mjs <version>
 */
import { readFileSync, writeFileSync } from 'fs';

const version = process.argv[2];
if (!version) {
	console.error('Usage: node update-obsidian-versions.mjs <version>');
	process.exit(1);
}

// Update manifest.json
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.version = version;
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n');

// Update versions.json (maps plugin version -> minimum Obsidian version)
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
versions[version] = manifest.minAppVersion;
writeFileSync('versions.json', JSON.stringify(versions, null, '\t') + '\n');

console.log(`Updated manifest.json and versions.json to ${version}`);
