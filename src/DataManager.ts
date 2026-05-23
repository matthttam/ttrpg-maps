import { App } from 'obsidian';
import type TTRPGMapsPlugin from './main';
import { MapState, MapMarker, TTRPGMapsSettings, DEFAULT_SETTINGS, DEFAULT_LAYER, DEFAULT_LAYER_ID } from './types';
import { detectUnitFromLabel } from './units';

const TTRPGMAP_DIR = '.ttrpgmap';

export class DataManager {
	private app: App;
	private plugin: TTRPGMapsPlugin;
	private saveTimeouts: Map<string, number> = new Map();
	private pendingStates: Map<string, MapState> = new Map();

	constructor(app: App, plugin: TTRPGMapsPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	/** Load plugin-wide settings from data.json */
	async loadSettings(): Promise<TTRPGMapsSettings> {
		const data = (await this.plugin.loadData()) as Partial<TTRPGMapsSettings> | null;
		const settings: TTRPGMapsSettings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});

		// Coerce array fields: a corrupt data.json may have null or the wrong shape.
		// Filter out entries missing the id/name strings that downstream code
		// (e.g., renderTemplateManager) unconditionally dereferences.
		const hasIdAndName = (v: unknown): v is { id: string; name: string } =>
			v != null &&
			typeof v === 'object' &&
			!Array.isArray(v) &&
			typeof (v as { id?: unknown }).id === 'string' &&
			typeof (v as { name?: unknown }).name === 'string';
		settings.markerTemplates = Array.isArray(settings.markerTemplates)
			? settings.markerTemplates.filter((t): t is (typeof settings.markerTemplates)[number] => hasIdAndName(t))
			: [];
		settings.templateFolders = Array.isArray(settings.templateFolders)
			? settings.templateFolders.filter((f): f is (typeof settings.templateFolders)[number] => hasIdAndName(f))
			: [];

		// Ensure each predefined template exists in the list (seed on first load)
		for (const predefined of DEFAULT_SETTINGS.markerTemplates) {
			const exists = settings.markerTemplates.some((t) => t.id === predefined.id);
			if (!exists) {
				settings.markerTemplates.unshift({ ...predefined });
			}
		}

		for (const t of settings.markerTemplates) {
			if (t.folderId === undefined) t.folderId = null;
		}

		return settings;
	}

	/** Save plugin-wide settings to data.json */
	async saveSettings(settings: TTRPGMapsSettings): Promise<void> {
		await this.plugin.saveData(settings);
	}

	/** Ensure a MapState has a valid layers array with the default layer present */
	private ensureLayers(state: MapState): void {
		if (!Array.isArray(state.layers)) {
			state.layers = [];
		}
		if (!state.layers.some((l) => l.id === DEFAULT_LAYER_ID)) {
			state.layers.unshift({ ...DEFAULT_LAYER });
		}
	}

	/** Migrate distance scale from legacy free-text unitLabel to structured unit system */
	private migrateDistanceScale(state: MapState): void {
		const scale = state.distanceScale;
		if (!scale || scale.unitSystem) return;
		if (typeof scale.unitLabel !== 'string') {
			scale.unitSystem = 'custom';
			return;
		}
		const detected = detectUnitFromLabel(scale.unitLabel);
		if (detected) {
			scale.unitSystem = detected.system;
			scale.unit = detected.unit;
		} else {
			scale.unitSystem = 'custom';
		}
	}

	/** Migrate markers from legacy |alias syntax to separate alias field */
	private migrateMarkers(markers: MapMarker[]): void {
		for (const m of markers) {
			// Loaded JSON may lack fields added in later versions
			const raw = m as Partial<Record<'alias' | 'previewNote', string | null>>;
			if (raw.alias === undefined && m.note && m.note.indexOf('|') >= 0) {
				const pipeIdx = m.note.indexOf('|');
				m.alias = m.note.slice(pipeIdx + 1);
				m.note = m.note.slice(0, pipeIdx);
			}
			if (raw.alias === undefined) m.alias = null;
			if (raw.previewNote === undefined) m.previewNote = null;
		}
	}

	/** Ensure .ttrpgmap directory exists */
	private async ensureDir(): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(TTRPGMAP_DIR))) {
			await adapter.mkdir(TTRPGMAP_DIR);
		}
	}

	/** Get the sidecar file path for a given map ID */
	private getMapStatePath(mapId: string): string {
		return `${TTRPGMAP_DIR}/${mapId}.json`;
	}

	/** Load per-map state from sidecar file */
	async loadMapState(mapId: string): Promise<MapState> {
		const path = this.getMapStatePath(mapId);
		const adapter = this.app.vault.adapter;

		if (await adapter.exists(path)) {
			const raw = await adapter.read(path);
			try {
				const state = JSON.parse(raw) as MapState;
				this.ensureLayers(state);
				this.migrateMarkers(state.markers);
				this.migrateDistanceScale(state);
				return state;
			} catch (e) {
				console.warn(`[ttrpg-maps] Failed to parse map state ${path}:`, e);
			}
		}

		return {
			mapId,
			markers: [],
			layers: [{ ...DEFAULT_LAYER }],
			distanceScale: null,
		};
	}

	/** Save per-map state to sidecar file (debounced 300ms) */
	saveMapState(mapId: string, state: MapState): void {
		const existing = this.saveTimeouts.get(mapId);
		if (existing) activeWindow.clearTimeout(existing);

		this.pendingStates.set(mapId, state);

		const timeout = activeWindow.setTimeout(() => {
			void (async () => {
				this.saveTimeouts.delete(mapId);
				this.pendingStates.delete(mapId);
				await this.ensureDir();
				const path = this.getMapStatePath(mapId);
				await this.app.vault.adapter.write(path, JSON.stringify(state, null, 2));
			})();
		}, 300);

		this.saveTimeouts.set(mapId, timeout);
	}

	/** Flush any pending debounced saves immediately */
	async flushSaves(): Promise<void> {
		for (const [mapId, timeout] of this.saveTimeouts) {
			activeWindow.clearTimeout(timeout);
			const state = this.pendingStates.get(mapId);
			if (state) {
				await this.ensureDir();
				const path = this.getMapStatePath(mapId);
				await this.app.vault.adapter.write(path, JSON.stringify(state, null, 2));
			}
		}
		this.saveTimeouts.clear();
		this.pendingStates.clear();
	}

	/**
	 * Fire all pending saves without awaiting. Use in synchronous onunload
	 * where async flushSaves may not complete before teardown.
	 */
	flushSavesSync(): void {
		if (this.saveTimeouts.size === 0) return;
		const writes: Array<{ path: string; data: string }> = [];
		const flushedMapIds: string[] = [];
		for (const [mapId, timeout] of this.saveTimeouts) {
			activeWindow.clearTimeout(timeout);
			const state = this.pendingStates.get(mapId);
			if (state) {
				flushedMapIds.push(mapId);
				writes.push({ path: this.getMapStatePath(mapId), data: JSON.stringify(state, null, 2) });
			}
		}
		if (writes.length === 0) {
			this.saveTimeouts.clear();
			return;
		}
		// Fire all writes concurrently in a single promise -- minimizes yield points
		void (async () => {
			try {
				const adapter = this.app.vault.adapter;
				const dir = TTRPGMAP_DIR;
				if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
				await Promise.all(writes.map((w) => adapter.write(w.path, w.data)));
				for (const mapId of flushedMapIds) {
					this.pendingStates.delete(mapId);
					this.saveTimeouts.delete(mapId);
				}
			} catch (e) {
				console.error('[ttrpg-maps] flushSavesSync write failed:', e);
			}
		})();
	}

	/** Load all map states from the sidecar directory (flushes pending saves first) */
	async loadAllMapStates(): Promise<MapState[]> {
		await this.flushSaves();

		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(TTRPGMAP_DIR))) return [];

		const listing = await adapter.list(TTRPGMAP_DIR);
		const states: MapState[] = [];
		for (const file of listing.files) {
			if (!file.endsWith('.json')) continue;
			const raw = await adapter.read(file);
			try {
				const state = JSON.parse(raw) as MapState;
				this.ensureLayers(state);
				this.migrateMarkers(state.markers);
				this.migrateDistanceScale(state);
				states.push(state);
			} catch (e) {
				console.warn(`[ttrpg-maps] Failed to parse ${file}:`, e);
				continue;
			}
		}
		return states;
	}

	/** Delete per-map state sidecar file */
	async deleteMapState(mapId: string): Promise<void> {
		const path = this.getMapStatePath(mapId);
		const adapter = this.app.vault.adapter;
		if (await adapter.exists(path)) {
			await adapter.remove(path);
		}
	}
}
