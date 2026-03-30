import { describe, it, expect } from "vitest";
import { parseMapConfig, resolveConfig, serializeMapConfig } from "./configSerializer";

describe("resolveConfig", () => {
  it("returns null when no image is provided", () => {
    expect(resolveConfig({})).toBeNull();
    expect(resolveConfig({ height: "500" })).toBeNull();
  });

  it("applies defaults for missing fields", () => {
    const config = resolveConfig({ image: "map.png" });
    expect(config).not.toBeNull();
    expect(config!.image).toBe("map.png");
    expect(config!.height).toBeNull();
    expect(config!.width).toBeNull();
    expect(config!.zoomMin).toBe(50);
    expect(config!.zoomMax).toBe(200);
    expect(config!.zoomStep).toBe(10);
  });

  it("generates an ID from the image path when none provided", () => {
    const config = resolveConfig({ image: "map.png" });
    expect(config!.id).toMatch(/^map_/);
  });

  it("uses provided ID over generated one", () => {
    const config = resolveConfig({ id: "custom-id", image: "map.png" });
    expect(config!.id).toBe("custom-id");
  });

  it("preserves provided values over defaults", () => {
    const config = resolveConfig({
      image: "map.png",
      height: "600",
      width: "80%",
      zoomMin: 25,
      zoomMax: 400,
      zoomStep: 5,
    });
    expect(config!.height).toBe("600");
    expect(config!.width).toBe("80%");
    expect(config!.zoomMin).toBe(25);
    expect(config!.zoomMax).toBe(400);
    expect(config!.zoomStep).toBe(5);
  });
});

describe("serializeMapConfig", () => {
  it("always includes image", () => {
    const lines = serializeMapConfig({ image: "map.png" });
    expect(lines).toEqual(["image: map.png"]);
  });

  it("includes height and width when set", () => {
    const lines = serializeMapConfig({ image: "map.png", height: "500", width: "80%" });
    expect(lines).toContain("height: 500");
    expect(lines).toContain("width: 80%");
  });

  it("omits null/undefined height and width", () => {
    const lines = serializeMapConfig({ image: "map.png", height: null, width: undefined });
    expect(lines).toEqual(["image: map.png"]);
  });

  it("omits default zoom values", () => {
    const lines = serializeMapConfig({ image: "map.png", zoomMin: 50, zoomMax: 200, zoomStep: 10 });
    expect(lines).toEqual(["image: map.png"]);
  });

  it("includes non-default zoom values", () => {
    const lines = serializeMapConfig({ image: "map.png", zoomMin: 25, zoomMax: 300, zoomStep: 5 });
    expect(lines).toContain("zoommin: 25");
    expect(lines).toContain("zoommax: 300");
    expect(lines).toContain("zoomstep: 5");
  });

  it("roundtrips through parse", () => {
    const original = { image: "maps/world.png", height: "600", width: "80%", zoomMin: 30, zoomMax: 300, zoomStep: 15 };
    const lines = serializeMapConfig(original);
    const parsed = parseMapConfig(lines.join("\n"));
    expect(parsed.image).toBe(original.image);
    expect(parsed.height).toBe(original.height);
    expect(parsed.width).toBe(original.width);
    expect(parsed.zoomMin).toBe(original.zoomMin);
    expect(parsed.zoomMax).toBe(original.zoomMax);
    expect(parsed.zoomStep).toBe(original.zoomStep);
  });
});
