import { describe, it, expect } from "vitest";
import { getMapIcon, searchMapIcons, getMapIconNames, setMapIcon, loadGameIcons, isGameIconsLoaded } from "../../src/utils/mapIcon";
import * as fs from "fs";
import * as path from "path";

describe("getMapIcon", () => {
  it("returns data for a known icon", () => {
    const icon = getMapIcon("star");
    expect(icon).toBeDefined();
    expect(icon!.viewBox).toBeDefined();
    expect(icon!.path).toBeDefined();
  });

  it("returns undefined for an unknown icon", () => {
    const icon = getMapIcon("this-icon-definitely-does-not-exist-xyz");
    expect(icon).toBeUndefined();
  });
});

describe("searchMapIcons", () => {
  it("returns empty array for empty query", () => {
    expect(searchMapIcons("")).toEqual([]);
  });

  it("returns exact match as first result", () => {
    const results = searchMapIcons("star");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toBe("star");
  });

  it("returns results for partial match", () => {
    const results = searchMapIcons("arro");
    expect(results.length).toBeGreaterThan(0);
    // All results should contain the partial query
    for (const name of results) {
      const icon = getMapIcon(name);
      const nameMatches = name.includes("arro");
      const termMatches = icon?.terms?.some((t) => t.toLowerCase().includes("arro"));
      expect(nameMatches || termMatches).toBe(true);
    }
  });

  it("respects the limit parameter", () => {
    const results = searchMapIcons("a", 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });
});

describe("setMapIcon", () => {
  it("renders an SVG into the parent element", () => {
    const parent = document.createElement("div");
    setMapIcon(parent, "star");
    const svg = parent.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("fill")).toBe("currentColor");
    expect(svg!.getAttribute("class")).toBe("ttrpgmap-map-icon");
  });

  it("clears previous content before rendering", () => {
    const parent = document.createElement("div");
     
    parent.innerHTML = "<span>old content</span>";
    setMapIcon(parent, "star");
    expect(parent.querySelector("span")).toBeNull();
    expect(parent.querySelector("svg")).not.toBeNull();
  });

  it("does nothing for an unknown icon", () => {
    const parent = document.createElement("div");
     
    parent.innerHTML = "<span>existing</span>";
    setMapIcon(parent, "this-icon-definitely-does-not-exist-xyz");
    // Content should remain unchanged since the function returns early
    expect(parent.querySelector("span")).not.toBeNull();
  });
});

describe("loadGameIcons", () => {
  it("loads GI icons from gi-icons.json", async () => {
    const giPath = path.resolve(__dirname, "../../gi-icons.json");
    await loadGameIcons(giPath, (p) => fs.promises.readFile(p, "utf-8"));
    expect(isGameIconsLoaded()).toBe(true);
  });

  it("makes GI icons available via getMapIcon after loading", async () => {
    const icon = getMapIcon("gi-abacus");
    expect(icon).toBeDefined();
    expect(icon!.viewBox).toBe("0 0 512 512");
    expect(icon!.path).toBeDefined();
    expect(icon!.set).toBe("gi");
  });

  it("renders a GI icon via setMapIcon", async () => {
    const parent = document.createElement("div");
    setMapIcon(parent, "gi-abacus");
    const svg = parent.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("viewBox")).toBe("0 0 512 512");
    expect(svg!.querySelector("path")).not.toBeNull();
  });

  it("includes GI icons in search results", () => {
    const results = searchMapIcons("abacus");
    expect(results).toContain("gi-abacus");
  });

  it("does not re-load if already loaded", async () => {
    let callCount = 0;
    await loadGameIcons("fake-path", async () => { callCount++; return "{}"; });
    expect(callCount).toBe(0); // already loaded, should skip
  });
});

describe("getMapIconNames", () => {
  it("returns a non-empty array", () => {
    const names = getMapIconNames();
    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBeGreaterThan(0);
  });

  it("contains known icons", () => {
    const names = getMapIconNames();
    expect(names).toContain("star");
    expect(names).toContain("location-dot");
  });
});
