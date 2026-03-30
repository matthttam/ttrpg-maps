import { describe, it, expect } from "vitest";
import { parseMapConfig } from "./MapRenderer";

describe("parseMapConfig", () => {
  it("parses a full config", () => {
    const source = `
image: maps/world.png
height: 600
width: 80%
zoommin: 30
zoommax: 300
zoomstep: 15
id: my-map
    `.trim();

    const config = parseMapConfig(source);

    expect(config.image).toBe("maps/world.png");
    expect(config.height).toBe("600");
    expect(config.width).toBe("80%");
    expect(config.zoomMin).toBe(30);
    expect(config.zoomMax).toBe(300);
    expect(config.zoomStep).toBe(15);
    expect(config.id).toBe("my-map");
  });

  it("parses only image", () => {
    const config = parseMapConfig("image: dungeon.webp");

    expect(config.image).toBe("dungeon.webp");
    expect(config.height).toBeUndefined();
    expect(config.width).toBeUndefined();
    expect(config.zoomMin).toBeUndefined();
    expect(config.zoomMax).toBeUndefined();
    expect(config.zoomStep).toBeUndefined();
  });

  it("returns empty for blank source", () => {
    const config = parseMapConfig("");
    expect(config.image).toBeUndefined();
  });

  it("returns empty for whitespace-only source", () => {
    const config = parseMapConfig("   \n  \n  ");
    expect(config.image).toBeUndefined();
  });

  it("ignores comment lines", () => {
    const source = `
# This is a comment
image: map.png
# Another comment
height: 400
    `.trim();

    const config = parseMapConfig(source);
    expect(config.image).toBe("map.png");
    expect(config.height).toBe("400");
  });

  it("handles keys case-insensitively", () => {
    const source = `
Image: test.png
ZoomMin: 25
ZoomMax: 250
ZOOMSTEP: 20
    `.trim();

    const config = parseMapConfig(source);
    expect(config.image).toBe("test.png");
    expect(config.zoomMin).toBe(25);
    expect(config.zoomMax).toBe(250);
    expect(config.zoomStep).toBe(20);
  });

  it("handles image paths with spaces", () => {
    const config = parseMapConfig("image: Maps/My World Map.png");
    expect(config.image).toBe("Maps/My World Map.png");
  });

  it("handles image paths with colons in value", () => {
    const config = parseMapConfig("image: folder/file:name.png");
    expect(config.image).toBe("folder/file:name.png");
  });

  it("ignores lines without colons", () => {
    const source = `
image: map.png
this line has no colon
height: 300
    `.trim();

    const config = parseMapConfig(source);
    expect(config.image).toBe("map.png");
    expect(config.height).toBe("300");
  });

  it("handles percentage heights and widths", () => {
    const source = `
image: map.png
height: 80%
width: 50%
    `.trim();

    const config = parseMapConfig(source);
    expect(config.height).toBe("80%");
    expect(config.width).toBe("50%");
  });

  it("returns NaN-safe zoom values for non-numeric input", () => {
    const source = `
image: map.png
zoommin: abc
    `.trim();

    const config = parseMapConfig(source);
    expect(config.zoomMin).toBeNaN();
  });
});
