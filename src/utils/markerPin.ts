import { setIcon } from "obsidian";

export const PIN_PATH = "M320 64C214 64 128 148.4 128 252.6C128 371.9 248.2 514.9 298.4 569.4C310.2 582.2 329.8 582.2 341.6 569.4C391.8 514.9 512 371.9 512 252.6C512 148.4 426 64 320 64z";
export const PIN_VIEWBOX = "0 0 640 640";
export const PIN_STROKE = "#000000";
export const PIN_STROKE_WIDTH = "16";

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

/** Create a full pin element with SVG and optional icon overlay */
export function createPinElement(
  container: HTMLElement,
  opts: {
    pinClass: string;
    svgClass: string;
    color: string;
    icon?: string | null;
    iconColor?: string;
    iconClass: string;
  }
): HTMLElement {
  const pin = container.createDiv({ cls: `ttrpgmap-pin ${opts.pinClass}` });
  pin.appendChild(createPinSvg(opts.color, opts.svgClass));

  if (opts.icon) {
    const iconEl = pin.createDiv({ cls: `ttrpgmap-pin-icon ${opts.iconClass}` });
    if (opts.iconColor) iconEl.style.color = opts.iconColor;
    setIcon(iconEl, opts.icon);
  }

  return pin;
}
