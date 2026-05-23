import { App, Notice } from 'obsidian';
import { strFromU8, unzipSync } from 'fflate';
import type TTRPGMapsPlugin from '../main';
import { MapExportManifest } from '../types';
import { generateMapId } from './mapId';
import { serializeMapConfig, writeConfigToCodeBlock } from './configSerializer';
import { FolderPickerModal } from '../modals/FolderPickerModal';

/** Return a standalone ArrayBuffer copy of a Uint8Array's bytes. */
function u8ToArrayBuffer(u8: Uint8Array): ArrayBuffer {
	return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/** Import a map from an exported ZIP file */
export function importMap(
	app: App,
	plugin: TTRPGMapsPlugin,
	sourcePath: string,
	sectionInfo: { lineStart: number; lineEnd: number },
): void {
	const input = createEl('input');
	input.type = 'file';
	input.accept = '.zip';
	input.addEventListener('change', () => {
		void (async () => {
			const file = input.files?.[0];
			if (!file) return;
			try {
				const arrayBuffer = await file.arrayBuffer();
				// unzipSync is synchronous, which keeps the bundled fflate Worker
				// code path unreachable -- the bot's "dynamic script" scan stays clean.
				let entries: Record<string, Uint8Array>;
				try {
					entries = unzipSync(new Uint8Array(arrayBuffer));
				} catch (e) {
					console.error('[ttrpg-maps] Failed to read export file:', e);
					new Notice('Failed to read the export file.');
					return;
				}

				// Parse manifest
				const manifestEntry = entries['manifest.json'];
				if (!manifestEntry) {
					new Notice('Invalid map export: missing manifest.json.');
					return;
				}
				const raw: unknown = JSON.parse(strFromU8(manifestEntry));
				if (!validateManifest(raw)) {
					new Notice('Invalid map export: manifest is incomplete.');
					return;
				}
				const manifest = raw;

				// Extract image
				const imageEntry = entries[manifest.imageFilename];
				if (!imageEntry) {
					new Notice('Invalid map export: image file missing from archive.');
					return;
				}
				const imageData = u8ToArrayBuffer(imageEntry);

				// Prompt user for destination folder
				new FolderPickerModal(app, (folderPath) => {
					void (async () => {
						try {
							// Normalize folder path
							const folder = folderPath === '/' ? '' : folderPath.replace(/\/+$/, '');

							// Resolve unique image path
							const imagePath = await resolveUniquePath(app, folder, manifest.imageFilename);

							// Ensure folder exists
							if (folder && !(await app.vault.adapter.exists(folder))) {
								await app.vault.createFolder(folder);
							}

							// Write image to vault
							await app.vault.createBinary(imagePath, imageData);

							// Generate new map ID from the new image path
							const newMapId = generateMapId(imagePath);

							// Update config with new image path and ID
							const config = { ...manifest.config, image: imagePath, id: newMapId };

							// Update state with new map ID
							const state = { ...manifest.state, mapId: newMapId };

							// Save sidecar state BEFORE writing the code block
							// (the code block triggers a MapRenderer that loads this state)
							plugin.dataManager.saveMapState(newMapId, state);
							await plugin.dataManager.flushSaves();

							// Write code block (triggers MapRenderer creation)
							const configLines = serializeMapConfig(config);
							await writeConfigToCodeBlock(app, sourcePath, sectionInfo, configLines);

							new Notice('Map imported successfully.');
						} catch (e) {
							console.error('[ttrpg-maps] Import failed:', e);
							new Notice('Map import failed. Check the console for details.');
						}
					})();
				}).open();
			} catch (e) {
				console.error('[ttrpg-maps] Failed to read export file:', e);
				new Notice('Failed to read the export file.');
			}
		})();
	});
	input.click();
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** Validate that a parsed manifest has the required fields and nested shapes */
export function validateManifest(data: unknown): data is MapExportManifest {
	if (!isPlainObject(data)) return false;
	if (typeof data.imageFilename !== 'string' || data.imageFilename.length === 0) return false;
	if (!isPlainObject(data.config)) return false;
	if (!isPlainObject(data.state)) return false;

	// MapConfig requires an image path; MapState requires a markers array.
	const config = data.config;
	if (typeof config.image !== 'string' || config.image.length === 0) return false;

	const state = data.state;
	if (!Array.isArray(state.markers)) return false;

	return true;
}

/** Find a unique file path, appending (2), (3), etc. if needed */
export async function resolveUniquePath(app: App, folder: string, filename: string): Promise<string> {
	const dotIdx = filename.lastIndexOf('.');
	const baseName = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
	const ext = dotIdx > 0 ? filename.slice(dotIdx) : '';

	let candidate = folder ? `${folder}/${filename}` : filename;
	let n = 2;
	while (await app.vault.adapter.exists(candidate)) {
		const suffixed = `${baseName} (${n})${ext}`;
		candidate = folder ? `${folder}/${suffixed}` : suffixed;
		n++;
	}
	return candidate;
}
