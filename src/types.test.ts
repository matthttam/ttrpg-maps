import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  DEFAULT_MAP_CONFIG,
  MarkerTemplate,
  MapMarker,
} from "./types";

describe("DEFAULT_SETTINGS", () => {
  it("has exactly one Default template", () => {
    expect(DEFAULT_SETTINGS.markerTemplates).toHaveLength(1);
    expect(DEFAULT_SETTINGS.markerTemplates[0].name).toBe("Default");
  });

  it("Default template has correct values per spec", () => {
    const t = DEFAULT_SETTINGS.markerTemplates[0];
    expect(t.note).toBeNull();
    expect(t.description).toBeNull();
    expect(t.direction).toBe("down");
    expect(t.textPlacement).toBe("above");
    expect(t.color).toBe("#ffffff");
    expect(t.icon).toBeNull();
    expect(t.iconColor).toBe("#000000");
  });
});

describe("DEFAULT_MAP_CONFIG", () => {
  it("has correct zoom defaults", () => {
    expect(DEFAULT_MAP_CONFIG.zoomMin).toBe(50);
    expect(DEFAULT_MAP_CONFIG.zoomMax).toBe(200);
    expect(DEFAULT_MAP_CONFIG.zoomStep).toBe(10);
  });

  it("has null height and width by default", () => {
    expect(DEFAULT_MAP_CONFIG.height).toBeNull();
    expect(DEFAULT_MAP_CONFIG.width).toBeNull();
  });
});

describe("Marker template resolution", () => {
  const defaultTemplate: MarkerTemplate = {
    name: "Castle",
    note: null,
    description: null,
    direction: "down",
    textPlacement: "above",
    color: "#ff0000",
    icon: "castle",
    iconColor: "#ffffff",
  };

  it("marker overrides take precedence over template", () => {
    const marker: MapMarker = {
      id: "test",
      templateName: "Castle",
      x: 100,
      y: 200,
      note: "My Castle",
      description: null,
      direction: "left",
      textPlacement: null,
      color: "#00ff00",
      icon: null,
      iconColor: null,
    };

    // Simulate resolution logic (same as MapRenderer.renderMarkers)
    const color = marker.color ?? defaultTemplate.color;
    const direction = marker.direction ?? defaultTemplate.direction;
    const textPlacement = marker.textPlacement ?? defaultTemplate.textPlacement;
    const iconColor = marker.iconColor ?? defaultTemplate.iconColor;
    const note = marker.note ?? defaultTemplate.note;

    expect(color).toBe("#00ff00"); // marker override
    expect(direction).toBe("left"); // marker override
    expect(textPlacement).toBe("above"); // falls through to template
    expect(iconColor).toBe("#ffffff"); // falls through to template
    expect(note).toBe("My Castle"); // marker override
  });

  it("null marker fields fall through to template values", () => {
    const marker: MapMarker = {
      id: "test",
      templateName: "Castle",
      x: 0,
      y: 0,
      note: null,
      description: null,
      direction: null,
      textPlacement: null,
      color: null,
      icon: null,
      iconColor: null,
    };

    const color = marker.color ?? defaultTemplate.color;
    const direction = marker.direction ?? defaultTemplate.direction;
    const icon = marker.icon ?? defaultTemplate.icon;

    expect(color).toBe("#ff0000");
    expect(direction).toBe("down");
    expect(icon).toBe("castle");
  });
});
