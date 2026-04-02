import { describe, it, expect, vi, beforeEach } from "vitest";
import { MapRenderer } from "./MapRenderer";
import { MapConfig, MapState, MapMarker, DEFAULT_SETTINGS, DEFAULT_LAYER } from "../types";
import { App } from "obsidian";

/** Create a mock plugin with controllable state */
function createMockPlugin(mapState?: Partial<MapState>) {
  const state: MapState = {
    mapId: "test-map",
    markers: [],
    layers: [{ ...DEFAULT_LAYER }],
    distanceScale: null,
    ...mapState,
  };

  const app = new App();
  // Mock vault to return a fake file for image loading
  const fakeFile = { path: "maps/test.png", basename: "test", extension: "png" };
  app.vault.getFileByPath = (path: string) => fakeFile as any;
  app.vault.getResourcePath = (file: any) => `app://local/${file.path}`;

  return {
    app,
    settings: { ...DEFAULT_SETTINGS },
    dataManager: {
      loadMapState: vi.fn().mockResolvedValue(state),
      saveMapState: vi.fn(),
      loadSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
      saveSettings: vi.fn(),
    },
    manifest: { id: "ttrpg-maps" },
    onMapRefresh: vi.fn(),
    offMapRefresh: vi.fn(),
    triggerMapRefresh: vi.fn(),
  } as any;
}

function createConfig(overrides?: Partial<MapConfig>): MapConfig {
  return {
    id: "test-map",
    image: "maps/test.png",
    height: null,
    width: null,
    zoomMin: 50,
    zoomMax: 200,
    zoomStep: 10,
    ...overrides,
  };
}

function createMarker(overrides?: Partial<MapMarker>): MapMarker {
  return {
    id: "marker_1",
    templateId: "default",
    x: 100,
    y: 200,
    layerId: null,
    note: null,
    description: null,
    direction: "down",
    textPlacement: "above",
    color: "#ffffff",
    icon: null,
    iconColor: "#000000",
    useBaseMarker: true,
    shape: "pin",
    ...overrides,
  };
}

describe("MapRenderer DOM", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
  });

  it("creates the root structure on load", async () => {
    const plugin = createMockPlugin();
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    // The root class is added to the container itself, not a child
    expect(container.classList.contains("ttrpgmap-root")).toBe(true);
    expect(container.querySelector(".ttrpgmap-wrapper")).not.toBeNull();
    expect(container.querySelector(".ttrpgmap-container")).not.toBeNull();
    expect(container.querySelector(".ttrpgmap-marker-overlay")).not.toBeNull();
    expect(container.querySelector(".ttrpgmap-image")).not.toBeNull();
    expect(container.querySelector(".ttrpgmap-svg-overlay")).not.toBeNull();
  });

  it("renders zoom controls", async () => {
    const plugin = createMockPlugin();
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const zoomControls = container.querySelector(".ttrpgmap-zoom-controls");
    expect(zoomControls).not.toBeNull();

    const buttons = zoomControls!.querySelectorAll(".ttrpgmap-zoom-btn");
    expect(buttons.length).toBe(3); // +, -, center

    const label = zoomControls!.querySelector(".ttrpgmap-zoom-label");
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe("100%");
  });

  it("renders toolbar with calibrate and measure buttons", async () => {
    const plugin = createMockPlugin();
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const toolbar = container.querySelector(".ttrpgmap-toolbar");
    expect(toolbar).not.toBeNull();
    const btns = toolbar!.querySelectorAll(".ttrpgmap-toolbar-btn");
    expect(btns.length).toBe(2);
  });

  it("renders settings button", async () => {
    const plugin = createMockPlugin();
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    expect(container.querySelector(".ttrpgmap-settings-btn")).not.toBeNull();
  });

  it("renders markers with pin SVG", async () => {
    const marker = createMarker({ color: "#ff0000", icon: "star" });
    const plugin = createMockPlugin({ markers: [marker] });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const markerEl = container.querySelector(".ttrpgmap-marker");
    expect(markerEl).not.toBeNull();
    expect(markerEl!.getAttribute("data-direction")).toBe("down");
    expect(markerEl!.getAttribute("data-text-placement")).toBe("above");

    // Pin SVG
    const pin = markerEl!.querySelector(".ttrpgmap-marker-pin");
    expect(pin).not.toBeNull();
    const svg = pin!.querySelector("svg");
    expect(svg).not.toBeNull();
    const path = svg!.querySelector("path");
    expect(path!.getAttribute("fill")).toBe("#ff0000");

    // Icon (FA icon renders as inline SVG)
    const iconEl = pin!.querySelector(".ttrpgmap-marker-icon");
    expect(iconEl).not.toBeNull();
    const iconSvg = iconEl!.querySelector("svg");
    expect(iconSvg).not.toBeNull();
    expect(iconSvg!.getAttribute("fill")).toBe("currentColor");
  });

  it("does not render label when no note or description", async () => {
    const marker = createMarker({ note: null, description: null });
    const plugin = createMockPlugin({ markers: [marker] });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const label = container.querySelector(".ttrpgmap-marker-label");
    expect(label).toBeNull();
  });

  it("renders label when note is set", async () => {
    const marker = createMarker({ note: "Places/Tavern" });
    const plugin = createMockPlugin({ markers: [marker] });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const label = container.querySelector(".ttrpgmap-marker-label");
    expect(label).not.toBeNull();
    const title = label!.querySelector(".ttrpgmap-marker-title");
    expect(title).not.toBeNull();
    expect(title!.textContent).toBe("Tavern");
  });

  it("renders label when only description is set", async () => {
    const marker = createMarker({ description: "A cozy inn" });
    const plugin = createMockPlugin({ markers: [marker] });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const label = container.querySelector(".ttrpgmap-marker-label");
    expect(label).not.toBeNull();
    expect(label!.querySelector(".ttrpgmap-marker-desc")!.textContent).toBe("A cozy inn");
  });

  it("renders multiple markers", async () => {
    const markers = [
      createMarker({ id: "m1", x: 10, y: 20 }),
      createMarker({ id: "m2", x: 30, y: 40, direction: "up" }),
      createMarker({ id: "m3", x: 50, y: 60, direction: "left" }),
    ];
    const plugin = createMockPlugin({ markers });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const markerEls = container.querySelectorAll(".ttrpgmap-marker");
    expect(markerEls.length).toBe(3);
    expect(markerEls[1].getAttribute("data-direction")).toBe("up");
    expect(markerEls[2].getAttribute("data-direction")).toBe("left");
  });

  it("sets marker CSS variables", async () => {
    const marker = createMarker({ color: "#ff0000" });
    const plugin = createMockPlugin({ markers: [marker] });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const markerEl = container.querySelector(".ttrpgmap-marker") as HTMLElement;
    expect(markerEl.style.getPropertyValue("--marker-color")).toBe("#ff0000");
  });

  it("shows error when image not found", async () => {
    const plugin = createMockPlugin();
    plugin.app.vault.getFileByPath = () => null; // Override to simulate missing file
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const error = container.querySelector(".ttrpgmap-error");
    expect(error).not.toBeNull();
    expect(error!.textContent).toContain("Image not found");
  });
});

describe("EmptyMapRenderer DOM", () => {
  it("renders placeholder with configure button", async () => {
    const { EmptyMapRenderer } = await import("./EmptyMapRenderer");
    const container = document.createElement("div");
    const plugin = createMockPlugin();
    const renderer = new EmptyMapRenderer(container, plugin, "test.md", null);
    renderer.onload();

    expect(container.querySelector(".ttrpgmap-placeholder")).not.toBeNull();
    expect(container.querySelector(".ttrpgmap-placeholder-text")!.textContent).toBe("TTRPG Map");
    expect(container.querySelector(".ttrpgmap-configure-btn")).not.toBeNull();
  });
});
