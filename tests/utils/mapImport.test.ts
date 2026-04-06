import { describe, it, expect, vi } from "vitest";
import { App } from "obsidian";
import { validateManifest, resolveUniquePath } from "../../src/utils/mapImport";

describe("validateManifest", () => {
  it("accepts a valid manifest", () => {
    expect(validateManifest({
      pluginVersion: "0.3.0",
      config: { id: "map_1", image: "img.png" },
      state: { mapId: "map_1", markers: [], layers: [] },
      imageFilename: "img.png",
    })).toBe(true);
  });

  it("rejects null", () => {
    expect(validateManifest(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(validateManifest(undefined)).toBe(false);
  });

  it("rejects missing config", () => {
    expect(validateManifest({
      state: { mapId: "map_1" },
      imageFilename: "img.png",
    })).toBe(false);
  });

  it("rejects missing state", () => {
    expect(validateManifest({
      config: { id: "map_1" },
      imageFilename: "img.png",
    })).toBe(false);
  });

  it("rejects missing imageFilename", () => {
    expect(validateManifest({
      config: { id: "map_1" },
      state: { mapId: "map_1" },
    })).toBe(false);
  });

  it("rejects empty imageFilename", () => {
    expect(validateManifest({
      config: { id: "map_1" },
      state: { mapId: "map_1" },
      imageFilename: "",
    })).toBe(false);
  });

  it("rejects non-string imageFilename", () => {
    expect(validateManifest({
      config: { id: "map_1" },
      state: { mapId: "map_1" },
      imageFilename: 42,
    })).toBe(false);
  });

  it("rejects a primitive", () => {
    expect(validateManifest("not an object")).toBe(false);
  });
});

describe("resolveUniquePath", () => {
  function createMockApp(existingPaths: string[]) {
    const app = new App();
    const existing = new Set(existingPaths);
    (app.vault as any).adapter = {
      exists: vi.fn().mockImplementation((path: string) => Promise.resolve(existing.has(path))),
    };
    return app;
  }

  it("returns the direct path when no conflict", async () => {
    const app = createMockApp([]);
    const result = await resolveUniquePath(app, "maps", "dungeon.png");
    expect(result).toBe("maps/dungeon.png");
  });

  it("returns filename only when folder is empty", async () => {
    const app = createMockApp([]);
    const result = await resolveUniquePath(app, "", "dungeon.png");
    expect(result).toBe("dungeon.png");
  });

  it("appends (2) when the path already exists", async () => {
    const app = createMockApp(["maps/dungeon.png"]);
    const result = await resolveUniquePath(app, "maps", "dungeon.png");
    expect(result).toBe("maps/dungeon (2).png");
  });

  it("increments suffix until a unique path is found", async () => {
    const app = createMockApp([
      "maps/dungeon.png",
      "maps/dungeon (2).png",
      "maps/dungeon (3).png",
    ]);
    const result = await resolveUniquePath(app, "maps", "dungeon.png");
    expect(result).toBe("maps/dungeon (4).png");
  });

  it("handles filenames without extension", async () => {
    const app = createMockApp(["maps/README"]);
    const result = await resolveUniquePath(app, "maps", "README");
    expect(result).toBe("maps/README (2)");
  });

  it("handles filenames with multiple dots", async () => {
    const app = createMockApp(["maps/my.world.map.png"]);
    const result = await resolveUniquePath(app, "maps", "my.world.map.png");
    expect(result).toBe("maps/my.world.map (2).png");
  });

  it("handles root folder path", async () => {
    const app = createMockApp(["dungeon.png"]);
    const result = await resolveUniquePath(app, "", "dungeon.png");
    expect(result).toBe("dungeon (2).png");
  });
});
