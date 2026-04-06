import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App } from "obsidian";
import { DataManager } from "../src/DataManager";
import { DEFAULT_SETTINGS, DEFAULT_LAYER, DEFAULT_LAYER_ID, MapState } from "../src/types";

function createMockPlugin(data?: any) {
  return {
    loadData: vi.fn().mockResolvedValue(data ?? null),
    saveData: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function createMockAdapter() {
  return {
    exists: vi.fn().mockResolvedValue(false),
    read: vi.fn().mockResolvedValue(""),
    write: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

function createDataManager(pluginData?: any) {
  const app = new App();
  (app.vault as any).adapter = createMockAdapter();
  const plugin = createMockPlugin(pluginData);
  const dm = new DataManager(app, plugin);
  return { app, plugin, dm };
}

describe("DataManager", () => {
  describe("loadSettings", () => {
    it("returns DEFAULT_SETTINGS when no data stored", async () => {
      const { dm } = createDataManager(null);

      const settings = await dm.loadSettings();

      expect(settings.markerTemplates).toHaveLength(1);
      expect(settings.markerTemplates[0].id).toBe("default");
      expect(settings.markerTemplates[0].name).toBe("Default");
    });

    it("merges stored data with defaults", async () => {
      const stored = {
        markerTemplates: [
          {
            id: "default",
            name: "Default",
            note: null,
            description: null,
            direction: "down",
            textPlacement: "above",
            color: "#ff0000",
            icon: null,
            iconColor: "#000000",
            useBaseMarker: true,
            shape: "pin",
          },
        ],
        defaultMarkerScale: 2.0,
      };
      const { dm } = createDataManager(stored);

      const settings = await dm.loadSettings();

      expect(settings.defaultMarkerScale).toBe(2.0);
      expect(settings.markerTemplates[0].color).toBe("#ff0000");
    });

    it("migrates missing templateFolders to empty array", async () => {
      const stored = {
        markerTemplates: [
          {
            id: "default",
            name: "Default",
            note: null,
            description: null,
            direction: "down",
            textPlacement: "above",
            color: "#ffffff",
            icon: null,
            iconColor: "#000000",
            useBaseMarker: true,
            shape: "pin",
          },
        ],
      };
      const { dm } = createDataManager(stored);

      const settings = await dm.loadSettings();

      expect(settings.templateFolders).toEqual([]);
    });

    it("migrates missing folderId on templates to null", async () => {
      const stored = {
        markerTemplates: [
          {
            id: "default",
            name: "Default",
            note: null,
            description: null,
            direction: "down",
            textPlacement: "above",
            color: "#ffffff",
            icon: null,
            iconColor: "#000000",
            useBaseMarker: true,
            shape: "pin",
          },
          {
            id: "custom",
            name: "Custom",
            note: null,
            description: null,
            direction: "up",
            textPlacement: "below",
            color: "#00ff00",
            icon: null,
            iconColor: "#ffffff",
            useBaseMarker: false,
            shape: "circle",
          },
        ],
        templateFolders: [{ id: "folder_1", name: "NPCs" }],
      };
      const { dm } = createDataManager(stored);

      const settings = await dm.loadSettings();

      expect(settings.markerTemplates[0].folderId).toBeNull();
      expect(settings.markerTemplates[1].folderId).toBeNull();
    });

    it("preserves existing folderId values during migration", async () => {
      const stored = {
        markerTemplates: [
          {
            id: "default",
            name: "Default",
            folderId: null,
            note: null,
            description: null,
            direction: "down",
            textPlacement: "above",
            color: "#ffffff",
            icon: null,
            iconColor: "#000000",
            useBaseMarker: true,
            shape: "pin",
          },
          {
            id: "custom",
            name: "Custom",
            folderId: "folder_1",
            note: null,
            description: null,
            direction: "up",
            textPlacement: "below",
            color: "#00ff00",
            icon: null,
            iconColor: "#ffffff",
            useBaseMarker: false,
            shape: "circle",
          },
        ],
        templateFolders: [{ id: "folder_1", name: "NPCs" }],
      };
      const { dm } = createDataManager(stored);

      const settings = await dm.loadSettings();

      expect(settings.markerTemplates[0].folderId).toBeNull();
      expect(settings.markerTemplates[1].folderId).toBe("folder_1");
      expect(settings.templateFolders).toHaveLength(1);
      expect(settings.templateFolders[0].name).toBe("NPCs");
    });

    it("ensures predefined default template exists even if data has templates without it", async () => {
      const stored = {
        markerTemplates: [
          {
            id: "custom",
            name: "Custom",
            note: null,
            description: null,
            direction: "up",
            textPlacement: "below",
            color: "#00ff00",
            icon: null,
            iconColor: "#ffffff",
            useBaseMarker: false,
            shape: "circle",
          },
        ],
      };
      const { dm } = createDataManager(stored);

      const settings = await dm.loadSettings();

      const defaultTemplate = settings.markerTemplates.find(
          (t: any) => t.id === "default"
      );
      expect(defaultTemplate).toBeDefined();
      expect(defaultTemplate!.name).toBe("Default");
      // default should be prepended
      expect(settings.markerTemplates[0].id).toBe("default");
      expect(settings.markerTemplates[1].id).toBe("custom");
    });
  });

  describe("saveSettings", () => {
    it("calls plugin.saveData with the settings", async () => {
      const { dm, plugin } = createDataManager();
      const settings = { ...DEFAULT_SETTINGS, defaultMarkerScale: 1.5 };

      await dm.saveSettings(settings);

      expect(plugin.saveData).toHaveBeenCalledWith(settings);
    });
  });

  describe("loadMapState", () => {
    it("returns default empty state when file does not exist", async () => {
      const { dm } = createDataManager();

      const state = await dm.loadMapState("test-id");

      expect(state.mapId).toBe("test-id");
      expect(state.markers).toEqual([]);
      expect(state.distanceScale).toBeNull();
      expect(state.layers).toHaveLength(1);
      expect(state.layers[0].id).toBe(DEFAULT_LAYER_ID);
    });

    it("loads and parses state from file when exists", async () => {
      const { app, dm } = createDataManager();
      const savedState: MapState = {
        mapId: "map-1",
        markers: [],
        layers: [{ ...DEFAULT_LAYER }],
        distanceScale: null,
      };

      app.vault.adapter.exists = vi.fn().mockResolvedValue(true);
      app.vault.adapter.read = vi
        .fn()
        .mockResolvedValue(JSON.stringify(savedState));

      const state = await dm.loadMapState("map-1");

      expect(state.mapId).toBe("map-1");
      expect(state.layers).toHaveLength(1);
      expect(app.vault.adapter.read).toHaveBeenCalledWith(
        ".ttrpgmap/map-1.json"
      );
    });

    it("ensures default layer is present in loaded state", async () => {
      const { app, dm } = createDataManager();
      const savedState = {
        mapId: "map-2",
        markers: [],
        layers: [],
        distanceScale: null,
      };

      app.vault.adapter.exists = vi.fn().mockResolvedValue(true);
      app.vault.adapter.read = vi
        .fn()
        .mockResolvedValue(JSON.stringify(savedState));

      const state = await dm.loadMapState("map-2");

      expect(state.layers).toHaveLength(1);
      expect(state.layers[0].id).toBe(DEFAULT_LAYER_ID);
    });
  });

  describe("saveMapState + flushSaves", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("saveMapState is debounced and does not write immediately", () => {
      const { app, dm } = createDataManager();
      app.vault.adapter.exists = vi.fn().mockResolvedValue(true);
      app.vault.adapter.write = vi.fn().mockResolvedValue(undefined);

      const state: MapState = {
        mapId: "map-1",
        markers: [],
        layers: [{ ...DEFAULT_LAYER }],
        distanceScale: null,
      };

       
      dm.saveMapState("map-1", state);

      expect(app.vault.adapter.write).not.toHaveBeenCalled();
    });

    it("flushSaves writes pending saves immediately", async () => {
      const { app, dm } = createDataManager();
      app.vault.adapter.exists = vi.fn().mockResolvedValue(false);
      app.vault.adapter.write = vi.fn().mockResolvedValue(undefined);
      app.vault.adapter.mkdir = vi.fn().mockResolvedValue(undefined);

      const state: MapState = {
        mapId: "map-1",
        markers: [],
        layers: [{ ...DEFAULT_LAYER }],
        distanceScale: null,
      };

       
      dm.saveMapState("map-1", state);
      expect(app.vault.adapter.write).not.toHaveBeenCalled();

      await dm.flushSaves();

      expect(app.vault.adapter.write).toHaveBeenCalledWith(
        ".ttrpgmap/map-1.json",
        JSON.stringify(state, null, 2)
      );
    });

    it("multiple saves for same mapId only writes once after flush", async () => {
      const { app, dm } = createDataManager();
      app.vault.adapter.exists = vi.fn().mockResolvedValue(true);
      app.vault.adapter.write = vi.fn().mockResolvedValue(undefined);

      const state1: MapState = {
        mapId: "map-1",
        markers: [],
        layers: [{ ...DEFAULT_LAYER }],
        distanceScale: null,
      };
      const state2: MapState = {
        mapId: "map-1",
        markers: [],
        layers: [{ ...DEFAULT_LAYER }],
        distanceScale: { pointA: { x: 0, y: 0 }, pointB: { x: 10, y: 10 }, units: 5, unitLabel: "ft" },
      };

       
      dm.saveMapState("map-1", state1);
       
      dm.saveMapState("map-1", state2);

      await dm.flushSaves();

      expect(app.vault.adapter.write).toHaveBeenCalledTimes(1);
      expect(app.vault.adapter.write).toHaveBeenCalledWith(
        ".ttrpgmap/map-1.json",
        JSON.stringify(state2, null, 2)
      );
    });
  });

  describe("deleteMapState", () => {
    it("removes file when it exists", async () => {
      const { app, dm } = createDataManager();
      app.vault.adapter.exists = vi.fn().mockResolvedValue(true);
      app.vault.adapter.remove = vi.fn().mockResolvedValue(undefined);

      await dm.deleteMapState("map-1");

      expect(app.vault.adapter.remove).toHaveBeenCalledWith(
        ".ttrpgmap/map-1.json"
      );
    });

    it("does nothing when file does not exist", async () => {
      const { app, dm } = createDataManager();
      app.vault.adapter.exists = vi.fn().mockResolvedValue(false);
      app.vault.adapter.remove = vi.fn().mockResolvedValue(undefined);

      await dm.deleteMapState("map-1");

      expect(app.vault.adapter.remove).not.toHaveBeenCalled();
    });
  });

  describe("loadAllMapStates", () => {
    it("returns empty array when dir does not exist", async () => {
      const { app, dm } = createDataManager();
      app.vault.adapter.exists = vi.fn().mockResolvedValue(false);

      const states = await dm.loadAllMapStates();

      expect(states).toEqual([]);
    });

    it("loads all JSON files from directory", async () => {
      const { app, dm } = createDataManager();

      const stateA: MapState = {
        mapId: "map-a",
        markers: [],
        layers: [{ ...DEFAULT_LAYER }],
        distanceScale: null,
      };
      const stateB: MapState = {
        mapId: "map-b",
        markers: [],
        layers: [{ ...DEFAULT_LAYER }],
        distanceScale: null,
      };

      app.vault.adapter.exists = vi.fn().mockResolvedValue(true);
      app.vault.adapter.list = vi.fn().mockResolvedValue({
        files: [".ttrpgmap/map-a.json", ".ttrpgmap/map-b.json"],
        folders: [],
      });
      app.vault.adapter.read = vi
        .fn()
        .mockImplementation(async (path: string) => {
          if (path.includes("map-a")) return JSON.stringify(stateA);
          if (path.includes("map-b")) return JSON.stringify(stateB);
          return "{}";
        });

      const states = await dm.loadAllMapStates();

      expect(states).toHaveLength(2);
      expect(states[0].mapId).toBe("map-a");
      expect(states[1].mapId).toBe("map-b");
    });
  });

  describe("marker migration", () => {
    it("splits note with pipe into note and alias on load", async () => {
      const { app, dm } = createDataManager();
      const savedState = {
        mapId: "mig-1",
        markers: [{
          id: "m1", templateId: "default", x: 0, y: 0, layerId: null,
          note: "Places/Tavern|The Red Dragon Inn",
          description: null, direction: null, textPlacement: null,
          color: null, icon: null, iconColor: null, iconRotation: null,
          useBaseMarker: null, shape: null,
          scale: null, scaleToZoom: null, textScale: null, textScaleToZoom: null,
        }],
        layers: [{ ...DEFAULT_LAYER }],
        distanceScale: null,
      };

      app.vault.adapter.exists = vi.fn().mockResolvedValue(true);
      app.vault.adapter.read = vi.fn().mockResolvedValue(JSON.stringify(savedState));

      const state = await dm.loadMapState("mig-1");

      expect(state.markers[0].note).toBe("Places/Tavern");
      expect(state.markers[0].alias).toBe("The Red Dragon Inn");
      expect(state.markers[0].previewNote).toBeNull();
    });

    it("sets alias to null when note has no pipe", async () => {
      const { app, dm } = createDataManager();
      const savedState = {
        mapId: "mig-2",
        markers: [{
          id: "m1", templateId: "default", x: 0, y: 0, layerId: null,
          note: "Places/Tavern",
          description: null, direction: null, textPlacement: null,
          color: null, icon: null, iconColor: null, iconRotation: null,
          useBaseMarker: null, shape: null,
          scale: null, scaleToZoom: null, textScale: null, textScaleToZoom: null,
        }],
        layers: [{ ...DEFAULT_LAYER }],
        distanceScale: null,
      };

      app.vault.adapter.exists = vi.fn().mockResolvedValue(true);
      app.vault.adapter.read = vi.fn().mockResolvedValue(JSON.stringify(savedState));

      const state = await dm.loadMapState("mig-2");

      expect(state.markers[0].note).toBe("Places/Tavern");
      expect(state.markers[0].alias).toBeNull();
      expect(state.markers[0].previewNote).toBeNull();
    });

    it("does not re-migrate markers that already have alias defined", async () => {
      const { app, dm } = createDataManager();
      const savedState = {
        mapId: "mig-3",
        markers: [{
          id: "m1", templateId: "default", x: 0, y: 0, layerId: null,
          note: "Places/Tavern",
          alias: "My Tavern",
          previewNote: null,
          description: null, direction: null, textPlacement: null,
          color: null, icon: null, iconColor: null, iconRotation: null,
          useBaseMarker: null, shape: null,
          scale: null, scaleToZoom: null, textScale: null, textScaleToZoom: null,
        }],
        layers: [{ ...DEFAULT_LAYER }],
        distanceScale: null,
      };

      app.vault.adapter.exists = vi.fn().mockResolvedValue(true);
      app.vault.adapter.read = vi.fn().mockResolvedValue(JSON.stringify(savedState));

      const state = await dm.loadMapState("mig-3");

      expect(state.markers[0].note).toBe("Places/Tavern");
      expect(state.markers[0].alias).toBe("My Tavern");
    });

    it("migrates markers in loadAllMapStates as well", async () => {
      const { app, dm } = createDataManager();
      const savedState = {
        mapId: "mig-4",
        markers: [{
          id: "m1", templateId: "default", x: 0, y: 0, layerId: null,
          note: "Page|Alias",
          description: null, direction: null, textPlacement: null,
          color: null, icon: null, iconColor: null, iconRotation: null,
          useBaseMarker: null, shape: null,
          scale: null, scaleToZoom: null, textScale: null, textScaleToZoom: null,
        }],
        layers: [{ ...DEFAULT_LAYER }],
        distanceScale: null,
      };

      app.vault.adapter.exists = vi.fn().mockResolvedValue(true);
      app.vault.adapter.list = vi.fn().mockResolvedValue({
        files: [".ttrpgmap/mig-4.json"],
        folders: [],
      });
      app.vault.adapter.read = vi.fn().mockResolvedValue(JSON.stringify(savedState));

      const states = await dm.loadAllMapStates();

      expect(states[0].markers[0].note).toBe("Page");
      expect(states[0].markers[0].alias).toBe("Alias");
    });
  });
});
