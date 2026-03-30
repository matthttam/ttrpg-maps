import { describe, it, expect } from "vitest";
import { createPinSvg, createPinElement, PIN_PATH, PIN_VIEWBOX } from "./markerPin";

describe("createPinSvg", () => {
  it("creates an SVG element with correct viewBox", () => {
    const svg = createPinSvg("#ff0000", "test-svg");
    expect(svg.tagName).toBe("svg");
    expect(svg.getAttribute("viewBox")).toBe(PIN_VIEWBOX);
    expect(svg.getAttribute("class")).toBe("test-svg");
  });

  it("sets fill color on the path", () => {
    const svg = createPinSvg("#00ff00", "test");
    const path = svg.querySelector("path");
    expect(path).not.toBeNull();
    expect(path!.getAttribute("fill")).toBe("#00ff00");
  });

  it("has a black stroke", () => {
    const svg = createPinSvg("#ffffff", "test");
    const path = svg.querySelector("path");
    expect(path!.getAttribute("stroke")).toBe("#000000");
  });
});

describe("createPinElement", () => {
  it("creates a pin container with SVG", () => {
    const container = document.createElement("div");
    const pin = createPinElement(container, {
      pinClass: "my-pin",
      svgClass: "my-svg",
      color: "#ffffff",
      iconClass: "my-icon",
    });

    expect(pin.classList.contains("ttrpgmap-pin")).toBe(true);
    expect(pin.classList.contains("my-pin")).toBe(true);
    expect(pin.querySelector("svg")).not.toBeNull();
    expect(pin.querySelector(".my-icon")).toBeNull(); // No icon when not specified
  });

  it("adds an icon element when icon is provided", () => {
    const container = document.createElement("div");
    const pin = createPinElement(container, {
      pinClass: "my-pin",
      svgClass: "my-svg",
      color: "#ffffff",
      icon: "sword",
      iconColor: "#ff0000",
      iconClass: "my-icon",
    });

    const iconEl = pin.querySelector(".my-icon");
    expect(iconEl).not.toBeNull();
    expect(iconEl!.classList.contains("ttrpgmap-pin-icon")).toBe(true);
    expect((iconEl as HTMLElement).style.color).toBe("rgb(255, 0, 0)");
    // setIcon mock inserts an SVG with data-icon attribute
    const iconSvg = iconEl!.querySelector("svg");
    expect(iconSvg).not.toBeNull();
    expect(iconSvg!.getAttribute("data-icon")).toBe("sword");
  });

  it("does not add icon when icon is null", () => {
    const container = document.createElement("div");
    const pin = createPinElement(container, {
      pinClass: "pin",
      svgClass: "svg",
      color: "#000",
      icon: null,
      iconClass: "icon",
    });

    expect(pin.querySelector(".icon")).toBeNull();
  });

  it("appends the pin to the container", () => {
    const container = document.createElement("div");
    createPinElement(container, {
      pinClass: "pin",
      svgClass: "svg",
      color: "#fff",
      iconClass: "icon",
    });

    expect(container.children.length).toBe(1);
    expect(container.firstElementChild!.classList.contains("pin")).toBe(true);
  });
});
