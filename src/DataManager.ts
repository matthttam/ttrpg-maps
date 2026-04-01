import { App } from "obsidian";
import type TTRPGMapsPlugin from "./main";
import { MapState, TTRPGMapsSettings, DEFAULT_SETTINGS } from "./types";

const TTRPGMAP_DIR = ".ttrpgmap";

export class DataManager {
  private app: App;
  private plugin: TTRPGMapsPlugin;
  private saveTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private pendingStates: Map<string, MapState> = new Map();

  constructor(app: App, plugin: TTRPGMapsPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  /** Load plugin-wide settings from data.json */
  async loadSettings(): Promise<TTRPGMapsSettings> {
    const data = await this.plugin.loadData();
    const settings: TTRPGMapsSettings = Object.assign({}, DEFAULT_SETTINGS, data);

    // Ensure each predefined template exists in the list (seed on first load)
    for (const predefined of DEFAULT_SETTINGS.markerTemplates) {
      const exists = settings.markerTemplates.some((t) => t.id === predefined.id);
      if (!exists) {
        settings.markerTemplates.unshift({ ...predefined });
      }
    }

    return settings;
  }

  /** Save plugin-wide settings to data.json */
  async saveSettings(settings: TTRPGMapsSettings): Promise<void> {
    await this.plugin.saveData(settings);
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
      return JSON.parse(raw) as MapState;
    }

    return {
      mapId,
      markers: [],
      distanceScale: null,
    };
  }

  /** Save per-map state to sidecar file (debounced 300ms) */
  saveMapState(mapId: string, state: MapState): void {
    const existing = this.saveTimeouts.get(mapId);
    if (existing) clearTimeout(existing);

    this.pendingStates.set(mapId, state);

    const timeout = setTimeout(async () => {
      this.saveTimeouts.delete(mapId);
      this.pendingStates.delete(mapId);
      await this.ensureDir();
      const path = this.getMapStatePath(mapId);
      await this.app.vault.adapter.write(path, JSON.stringify(state, null, 2));
    }, 300);

    this.saveTimeouts.set(mapId, timeout);
  }

  /** Flush any pending debounced saves immediately */
  async flushSaves(): Promise<void> {
    for (const [mapId, timeout] of this.saveTimeouts) {
      clearTimeout(timeout);
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

  /** Load all map states from the sidecar directory (flushes pending saves first) */
  async loadAllMapStates(): Promise<MapState[]> {
    await this.flushSaves();

    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(TTRPGMAP_DIR))) return [];

    const listing = await adapter.list(TTRPGMAP_DIR);
    const states: MapState[] = [];
    for (const file of listing.files) {
      if (!file.endsWith(".json")) continue;
      const raw = await adapter.read(file);
      states.push(JSON.parse(raw) as MapState);
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
