import { getFAIcon } from "./faIcon";

// FA map-marker as the default pin shape
const MAP_MARKER = getFAIcon("map-marker");
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

/** Render an FA icon SVG into a container */
function renderIcon(container: HTMLElement, iconName: string): void {
  const icon = getFAIcon(iconName);
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
  iconClass: string;
  useBaseMarker?: boolean;
}

/** Create a full pin element — either base pin with icon overlay, or standalone icon */
export function createPinElement(container: HTMLElement, opts: PinElementOpts): HTMLElement {
  const useBase = opts.useBaseMarker ?? true;

  if (useBase || !opts.icon) {
    const pin = container.createDiv({ cls: `ttrpgmap-pin ${opts.pinClass}` });
    pin.appendChild(createPinSvg(opts.color, opts.svgClass));

    if (opts.icon) {
      const iconEl = pin.createDiv({ cls: `ttrpgmap-pin-icon ${opts.iconClass}` });
      if (opts.iconColor) iconEl.style.color = opts.iconColor;
      renderIcon(iconEl, opts.icon);
    }

    return pin;
  }

  // Standalone icon mode — don't use the small iconClass, use standalone sizing
  const pin = container.createDiv({ cls: `ttrpgmap-pin ttrpgmap-pin--standalone ${opts.pinClass}` });
  const iconEl = pin.createDiv({ cls: "ttrpgmap-pin-standalone-icon" });
  if (opts.iconColor) iconEl.style.color = opts.iconColor;
  renderIcon(iconEl, opts.icon);

  return pin;
}
