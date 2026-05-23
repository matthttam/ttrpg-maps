import { App, Notice } from 'obsidian';
import { strToU8, zipSync } from 'fflate';
import type TTRPGMapsPlugin from '../main';
import { MapConfig, MapState, MapExportManifest } from '../types';

/** Export a map (config + state + image) as a downloadable ZIP file */
export async function exportMap(app: App, plugin: TTRPGMapsPlugin, config: MapConfig, state: MapState): Promise<void> {
	// Flush any pending sidecar writes then reload from disk for latest data
	await plugin.dataManager.flushSaves();
	state = await plugin.dataManager.loadMapState(config.id);

	// Resolve and read the image file
	const imageFile = app.vault.getFileByPath(config.image);
	if (!imageFile) {
		new Notice('Export failed: image not found in vault.');
		return;
	}
	const imageData = await app.vault.readBinary(imageFile);
	const imageFilename = imageFile.name;

	// Build manifest
	const manifest: MapExportManifest = {
		pluginVersion: plugin.manifest.version,
		config,
		state,
		imageFilename,
	};

	// Create ZIP (sync API keeps us off the bundled Web Worker code path)
	const zipBytes = zipSync({
		'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
		[imageFilename]: new Uint8Array(imageData),
	});

	const blob = new Blob([zipBytes], { type: 'application/zip' });

	// Trigger download
	const url = URL.createObjectURL(blob);
	const a = createEl('a');
	a.href = url;
	a.download = `ttrpg-map-${config.id}.zip`;
	a.click();
	URL.revokeObjectURL(url);

	new Notice('Map exported successfully.');
}
