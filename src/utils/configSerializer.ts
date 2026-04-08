import { App } from 'obsidian';
import { MapConfig, DEFAULT_MAP_CONFIG } from '../types';
import { generateMapId } from './mapId';

/** Parse YAML-like options from the code block source */
export function parseMapConfig(source: string): Partial<MapConfig> {
	const config: Record<string, string> = {};

	for (const line of source.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		const colonIdx = trimmed.indexOf(':');
		if (colonIdx === -1) continue;

		const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
		const value = trimmed.slice(colonIdx + 1).trim();
		if (key && value) {
			config[key] = value;
		}
	}

	const result: Partial<MapConfig> = {};

	if (config.id) result.id = config.id;
	if (config.image) result.image = config.image;
	if (config.height) result.height = config.height;
	if (config.width) result.width = config.width;
	if (config.zoommin) result.zoomMin = parseInt(config.zoommin, 10);
	if (config.zoommax) result.zoomMax = parseInt(config.zoommax, 10);
	if (config.zoomstep) result.zoomStep = parseInt(config.zoomstep, 10);

	return result;
}

/** Resolve a full MapConfig with defaults applied */
export function resolveConfig(partial: Partial<MapConfig>): MapConfig | null {
	if (!partial.image) return null;

	const id = partial.id || generateMapId(partial.image);

	return {
		id,
		image: partial.image,
		height: partial.height ?? DEFAULT_MAP_CONFIG.height,
		width: partial.width ?? DEFAULT_MAP_CONFIG.width,
		zoomMin: partial.zoomMin ?? DEFAULT_MAP_CONFIG.zoomMin,
		zoomMax: partial.zoomMax ?? DEFAULT_MAP_CONFIG.zoomMax,
		zoomStep: partial.zoomStep ?? DEFAULT_MAP_CONFIG.zoomStep,
	};
}

/** Serialize map config fields to YAML lines (only non-default values) */
export function serializeMapConfig(config: {
	id?: string;
	image: string;
	height?: string | null;
	width?: string | null;
	zoomMin?: number;
	zoomMax?: number;
	zoomStep?: number;
}): string[] {
	const lines: string[] = [];
	if (config.id) lines.push(`id: ${config.id}`);
	lines.push(`image: ${config.image}`);
	if (config.height) lines.push(`height: ${config.height}`);
	if (config.width) lines.push(`width: ${config.width}`);
	if (config.zoomMin !== undefined && config.zoomMin !== 50) lines.push(`zoommin: ${config.zoomMin}`);
	if (config.zoomMax !== undefined && config.zoomMax !== 200) lines.push(`zoommax: ${config.zoomMax}`);
	if (config.zoomStep !== undefined && config.zoomStep !== 10) lines.push(`zoomstep: ${config.zoomStep}`);
	return lines;
}

/** Write config lines back into a ttrpgmap code block in a file */
export async function writeConfigToCodeBlock(
	app: App,
	sourcePath: string,
	sectionInfo: { lineStart: number; lineEnd: number },
	configLines: string[],
): Promise<void> {
	const file = app.vault.getFileByPath(sourcePath);
	if (!file) return;

	const newBlock = '```ttrpgmap\n' + configLines.join('\n') + '\n```';
	const { lineStart, lineEnd } = sectionInfo;

	await app.vault.process(file, (content) => {
		const fileLines = content.split('\n');
		fileLines.splice(lineStart, lineEnd - lineStart + 1, ...newBlock.split('\n'));
		return fileLines.join('\n');
	});
}
