import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, Notice } from "obsidian";
import { exportMap } from "./mapExport";
import { MapConfig, MapState, MapExportManifest } from "../types";

// Mock JSZip
const mockGenerateAsync = vi.fn();
const mockZipFile = vi.fn();
function MockJSZip() {
  return { file: mockZipFile, generateAsync: mockGenerateAsync };
}
vi.mock("jszip", () => ({
  default: MockJSZip,
  __esModule: true,
}));

function createMockApp() {
  const app = new App();
  (app.vault as any).getFileByPath = vi.fn();
  (app.vault as any).readBinary = vi.fn();
  return app;
}

function createMockPlugin() {
  return {
    manifest: { version: "0.3.0" },
    dataManager: {
      flushSaves: vi.fn().mockResolvedValue(undefined),
    },
  } as any;
}

const testConfig: MapConfig = {
  id: "map_abc123",
  image: "maps/dungeon.png",
  height: "500",
  width: "800",
  zoomMin: 50,
  zoomMax: 200,
  zoomStep: 10,
};

const testState: MapState = {
  mapId: "map_abc123",
  markers: [],
  layers: [{ id: "default", name: "Default Layer", zoomMin: null, zoomMax: null }],
  distanceScale: null,
};

describe("exportMap", () => {
  let app: App;
  let plugin: ReturnType<typeof createMockPlugin>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createMockApp();
    plugin = createMockPlugin();
    // Mock URL and anchor click
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        return { href: "", download: "", click: vi.fn() } as any;
      }
      return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    });
  });

  it("flushes pending saves before exporting", async () => {
    (app.vault.getFileByPath as any).mockReturnValue({ path: "maps/dungeon.png", name: "dungeon.png" });
    (app.vault as any).readBinary.mockResolvedValue(new ArrayBuffer(8));
    mockGenerateAsync.mockResolvedValue(new Blob(["test"]));

    await exportMap(app, plugin, testConfig, testState);

    expect(plugin.dataManager.flushSaves).toHaveBeenCalledOnce();
  });

  it("shows notice and returns when image not found", async () => {
    (app.vault.getFileByPath as any).mockReturnValue(null);

    await exportMap(app, plugin, testConfig, testState);

    expect(mockZipFile).not.toHaveBeenCalled();
  });

  it("adds manifest.json and image to the ZIP", async () => {
    const imageData = new ArrayBuffer(16);
    (app.vault.getFileByPath as any).mockReturnValue({ path: "maps/dungeon.png", name: "dungeon.png" });
    (app.vault as any).readBinary.mockResolvedValue(imageData);
    mockGenerateAsync.mockResolvedValue(new Blob(["zipdata"]));

    await exportMap(app, plugin, testConfig, testState);

    expect(mockZipFile).toHaveBeenCalledTimes(2);

    // First call: manifest.json
    const manifestCall = mockZipFile.mock.calls[0];
    expect(manifestCall[0]).toBe("manifest.json");
    const manifest: MapExportManifest = JSON.parse(manifestCall[1]);
    expect(manifest.pluginVersion).toBe("0.3.0");
    expect(manifest.config).toEqual(testConfig);
    expect(manifest.state).toEqual(testState);
    expect(manifest.imageFilename).toBe("dungeon.png");

    // Second call: image
    expect(mockZipFile.mock.calls[1][0]).toBe("dungeon.png");
    expect(mockZipFile.mock.calls[1][1]).toBe(imageData);
  });

  it("generates ZIP as blob and triggers download", async () => {
    const blob = new Blob(["zipdata"]);
    (app.vault.getFileByPath as any).mockReturnValue({ path: "maps/dungeon.png", name: "dungeon.png" });
    (app.vault as any).readBinary.mockResolvedValue(new ArrayBuffer(8));
    mockGenerateAsync.mockResolvedValue(blob);

    await exportMap(app, plugin, testConfig, testState);

    expect(mockGenerateAsync).toHaveBeenCalledWith({ type: "blob" });
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("uses map ID in the download filename", async () => {
    (app.vault.getFileByPath as any).mockReturnValue({ path: "maps/dungeon.png", name: "dungeon.png" });
    (app.vault as any).readBinary.mockResolvedValue(new ArrayBuffer(8));
    mockGenerateAsync.mockResolvedValue(new Blob(["test"]));

    const createElementSpy = vi.spyOn(document, "createElement");
    let anchor: any;
    createElementSpy.mockImplementation((tag: string) => {
      if (tag === "a") {
        anchor = { href: "", download: "", click: vi.fn() };
        return anchor as any;
      }
      return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    });

    await exportMap(app, plugin, testConfig, testState);

    expect(anchor.download).toBe("ttrpg-map-map_abc123.zip");
  });
});
