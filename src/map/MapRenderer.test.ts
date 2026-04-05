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
    scale: null,
    scaleToZoom: null,
    textScale: null,
    textScaleToZoom: null,
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

  it("renders measurement drawer with calibrate, measure, and freehand buttons", async () => {
    const plugin = createMockPlugin();
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const panel = container.querySelector(".ttrpgmap-measure-panel");
    expect(panel).not.toBeNull();
    const tools = panel!.querySelector(".ttrpgmap-measure-tools");
    expect(tools).not.toBeNull();
    const btns = tools!.querySelectorAll(".ttrpgmap-toolbar-btn");
    expect(btns.length).toBe(3);
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

  it("renders total display element (hidden by default)", async () => {
    const plugin = createMockPlugin();
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const total = container.querySelector(".ttrpgmap-measure-total");
    expect(total).not.toBeNull();
    expect((total as HTMLElement).style.display).toBe("none");
  });

  it("renders rounding controls in the measurement drawer", async () => {
    const plugin = createMockPlugin();
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const rounding = container.querySelector(".ttrpgmap-measure-rounding");
    expect(rounding).not.toBeNull();

    const select = rounding!.querySelector("select");
    expect(select).not.toBeNull();
    const options = select!.querySelectorAll("option");
    expect(options.length).toBe(3);
    expect(options[0].value).toBe("none");
    expect(options[1].value).toBe("up");
    expect(options[2].value).toBe("down");

    const input = rounding!.querySelector("input[type='number']");
    expect(input).not.toBeNull();
  });

  it("measurement drawer is hidden by default", async () => {
    const plugin = createMockPlugin();
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const drawer = container.querySelector(".ttrpgmap-measure-drawer");
    expect(drawer).not.toBeNull();
    expect((drawer as HTMLElement).style.display).toBe("none");
  });

  it("renders measurement toggle button", async () => {
    const plugin = createMockPlugin();
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const toggle = container.querySelector(".ttrpgmap-measure-toggle");
    expect(toggle).not.toBeNull();
  });

  it("initializes rounding select from state", async () => {
    const plugin = createMockPlugin({ roundingMode: "up", roundingMultiple: 10 });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const select = container.querySelector(".ttrpgmap-measure-rounding-select") as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe("up");

    const input = container.querySelector(".ttrpgmap-measure-rounding-input") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("10");
  });

  it("sets --marker-scale to 1 on markers by default", async () => {
    const marker = createMarker();
    const plugin = createMockPlugin({ markers: [marker] });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const markerEl = container.querySelector(".ttrpgmap-marker") as HTMLElement;
    expect(markerEl.style.getPropertyValue("--marker-scale")).toBe("1");
  });

  it("sets --marker-scale from per-map state", async () => {
    const marker = createMarker();
    const plugin = createMockPlugin({ markers: [marker], markerScale: 0.75 });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const markerEl = container.querySelector(".ttrpgmap-marker") as HTMLElement;
    expect(markerEl.style.getPropertyValue("--marker-scale")).toBe("0.75");
  });

  it("falls back to global defaultMarkerScale when per-map is not set", async () => {
    const marker = createMarker();
    const plugin = createMockPlugin({ markers: [marker] });
    plugin.settings.defaultMarkerScale = 1.5;
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const markerEl = container.querySelector(".ttrpgmap-marker") as HTMLElement;
    expect(markerEl.style.getPropertyValue("--marker-scale")).toBe("1.5");
  });

  it("per-map markerScale takes precedence over global default", async () => {
    const marker = createMarker();
    const plugin = createMockPlugin({ markers: [marker], markerScale: 0.5 });
    plugin.settings.defaultMarkerScale = 2.0;
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const markerEl = container.querySelector(".ttrpgmap-marker") as HTMLElement;
    expect(markerEl.style.getPropertyValue("--marker-scale")).toBe("0.5");
  });

  it("scaleMarkersToZoom defaults to true (screen-constant, no zoom factor)", async () => {
    const marker = createMarker();
    const plugin = createMockPlugin({ markers: [marker] });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const markerEl = container.querySelector(".ttrpgmap-marker") as HTMLElement;
    // At 100% zoom with scaleToZoom=true: just baseScale, no zoom multiplication
    expect(markerEl.style.getPropertyValue("--marker-scale")).toBe("1");
  });

  it("scaleMarkersToZoom=false multiplies scale by zoom factor", async () => {
    const marker = createMarker();
    const plugin = createMockPlugin({ markers: [marker], scaleMarkersToZoom: false, markerScale: 1.0 });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const markerEl = container.querySelector(".ttrpgmap-marker") as HTMLElement;
    // At 100% zoom: 1.0 * (100/100) = 1.0
    expect(markerEl.style.getPropertyValue("--marker-scale")).toBe("1");
  });

  it("per-marker scale override sets --marker-scale on element", async () => {
    const marker = createMarker({ scale: 0.5 });
    const plugin = createMockPlugin({ markers: [marker] });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const markerEl = container.querySelector(".ttrpgmap-marker") as HTMLElement;
    expect(markerEl.style.getPropertyValue("--marker-scale")).toBe("0.5");
  });

  it("per-marker scaleToZoom=false applies zoom factor to that marker", async () => {
    const marker = createMarker({ scaleToZoom: false });
    const plugin = createMockPlugin({ markers: [marker] });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const markerEl = container.querySelector(".ttrpgmap-marker") as HTMLElement;
    // At 100% zoom: 1.0 * 1.0 = 1.0 (fixed to map but zoom is 100%)
    expect(markerEl.style.getPropertyValue("--marker-scale")).toBe("1");
  });

  it("marker with null overrides inherits map-level scale", async () => {
    const marker = createMarker({ scale: null, scaleToZoom: null });
    const plugin = createMockPlugin({ markers: [marker], markerScale: 1.5 });
    const renderer = new MapRenderer(container, plugin, createConfig(), "test.md", null);
    await renderer.onload();

    const markerEl = container.querySelector(".ttrpgmap-marker") as HTMLElement;
    expect(markerEl.style.getPropertyValue("--marker-scale")).toBe("1.5");
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
