import { getMapIcon } from "./mapIcon";

// FA location-pin (solid teardrop, no inner circle) as the default pin shape
const MAP_MARKER = getMapIcon("location-pin");
export const PIN_VIEWBOX = MAP_MARKER?.viewBox ?? "0 0 384 512";
export const PIN_PATH = MAP_MARKER?.path ?? "M192 0C86 0 0 84.4 0 188.6 0 307.9 120.2 450.9 170.4 505.4 182.2 518.2 201.8 518.2 213.6 505.4 263.8 450.9 384 307.9 384 188.6 384 84.4 298 0 192 0z";
export const PIN_STROKE = "#000000";
export const PIN_STROKE_WIDTH = "8";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Create the SVG element for a marker pin shape */
export function createPinSvg(fillColor: string, cssClass: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", PIN_VIEWBOX);
  svg.setAttribute("class", cssClass);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", PIN_PATH);
  path.setAttribute("fill", fillColor);
  path.setAttribute("stroke", PIN_STROKE);
  path.setAttribute("stroke-width", PIN_STROKE_WIDTH);
  svg.appendChild(path);
  return svg;
}

/** Create an SVG circle shape for a marker using FA's circle icon */
export function createCircleSvg(fillColor: string, cssClass: string): SVGSVGElement {
  const faCircle = getMapIcon("circle");
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", faCircle?.viewBox ?? "0 0 512 512");
  svg.setAttribute("class", cssClass);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", faCircle?.path ?? "M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512z");
  path.setAttribute("fill", fillColor);
  path.setAttribute("stroke", PIN_STROKE);
  path.setAttribute("stroke-width", "12");
  svg.appendChild(path);
  return svg;
}

/** Create an SVG dashed-circle for a hotspot marker */
export function createHotspotSvg(cssClass: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 512 512");
  svg.setAttribute("class", cssClass);
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", "256");
  circle.setAttribute("cy", "256");
  circle.setAttribute("r", "240");
  circle.setAttribute("fill", "none");
  circle.setAttribute("stroke", "var(--text-muted)");
  circle.setAttribute("stroke-width", "16");
  circle.setAttribute("stroke-dasharray", "40 25");
  svg.appendChild(circle);
  return svg;
}

/** Render an FA icon SVG into a container */
function renderIcon(container: HTMLElement, iconName: string): void {
  const icon = getMapIcon(iconName);
  if (!icon) return;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", icon.viewBox);
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("class", "ttrpgmap-fa-icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", icon.path);
  svg.appendChild(path);
  container.appendChild(svg);
}

export interface PinElementOpts {
  pinClass: string;
  svgClass: string;
  color: string;
  icon?: string | null;
  iconColor?: string;
  iconRotation?: number;
  iconClass: string;
  useBaseMarker?: boolean;
  /** Pin shape: "pin" (default teardrop), "circle", or "hotspot" (transparent clickable area) */
  shape?: "pin" | "circle" | "hotspot";
}

/** Create a full pin element: pin shape, circle shape, or standalone icon */
export function createPinElement(container: HTMLElement, opts: PinElementOpts): HTMLElement {
  const useBase = opts.useBaseMarker ?? true;
  const shape = opts.shape ?? "pin";

  if (shape === "hotspot") {
    const cls = `ttrpgmap-pin ttrpgmap-pin--hotspot ${opts.pinClass}`;
    const pin = container.createDiv({ cls });
    pin.appendChild(createHotspotSvg(opts.svgClass));
    return pin;
  }

  if (useBase || !opts.icon) {
    const cls = `ttrpgmap-pin ${opts.pinClass}` + (shape === "circle" ? " ttrpgmap-pin--circle" : "");
    const pin = container.createDiv({ cls });
    pin.appendChild(shape === "circle"
      ? createCircleSvg(opts.color, opts.svgClass)
      : createPinSvg(opts.color, opts.svgClass)
    );

    if (opts.icon) {
      const iconEl = pin.createDiv({ cls: `ttrpgmap-pin-icon ${opts.iconClass}` });
      if (opts.iconColor) iconEl.style.color = opts.iconColor;
      if (opts.iconRotation) iconEl.style.setProperty("--icon-rotation", `${opts.iconRotation}deg`);
      renderIcon(iconEl, opts.icon);
    }

    return pin;
  }

  // Standalone icon mode: don't use the small iconClass, use standalone sizing
  const pin = container.createDiv({ cls: `ttrpgmap-pin ttrpgmap-pin--standalone ${opts.pinClass}` });
  const iconEl = pin.createDiv({ cls: "ttrpgmap-pin-standalone-icon" });
  if (opts.iconColor) iconEl.style.color = opts.iconColor;
  if (opts.iconRotation) iconEl.style.setProperty("--icon-rotation", `${opts.iconRotation}deg`);
  renderIcon(iconEl, opts.icon);

  return pin;
}
