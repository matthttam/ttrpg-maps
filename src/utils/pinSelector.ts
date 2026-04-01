import { createPinSvg, createCircleSvg } from "./markerPin";

export type PinSelection = "none" | "down" | "up" | "left" | "right" | "circle";

const SELECTIONS: PinSelection[] = ["none", "down", "up", "left", "right", "circle"];

const ROTATION: Record<string, string> = {
  down: "0deg",
  up: "180deg",
  left: "90deg",
  right: "-90deg",
};

export interface PinSelectorOpts {
  container: HTMLElement;
  selected: PinSelection;
  color: string;
  onChange: (value: PinSelection) => void;
  onColorChange: (color: string) => void;
}

/**
 * Renders a pin selector: [None] [↓] [↑] [←] [→] + color circle.
 * Returns a function to update the color on all pin icons.
 */
export function createPinSelector(opts: PinSelectorOpts): { updateColor: (color: string) => void } {
  const row = opts.container.createDiv({ cls: "ttrpgmap-pin-selector" });

  // Button group wrapper so :first-child/:last-child work
  const btnGroup = row.createDiv({ cls: "ttrpgmap-pin-selector-group" });

  const ICON_COLOR = "var(--text-muted)";

  const buttons: HTMLElement[] = [];
  let currentColor = opts.color;

  for (const sel of SELECTIONS) {
    const btn = btnGroup.createDiv({
      cls: `ttrpgmap-pin-selector-btn ${opts.selected === sel ? "ttrpgmap-pin-selector-active" : ""}`,
      attr: { "aria-label": sel === "none" ? "No pin" : sel === "circle" ? "Circle" : `Pin ${sel}` },
    });

    if (sel === "none") {
      btn.createDiv({ cls: "ttrpgmap-pin-selector-none", text: "✕" });
    } else if (sel === "circle") {
      const circleWrap = btn.createDiv({ cls: "ttrpgmap-pin-selector-circle" });
      circleWrap.appendChild(createCircleSvg(ICON_COLOR, "ttrpgmap-pin-selector-svg"));
    } else {
      const pinWrap = btn.createDiv({ cls: "ttrpgmap-pin-selector-icon" });
      pinWrap.style.transform = `rotate(${ROTATION[sel]})`;
      pinWrap.appendChild(createPinSvg(ICON_COLOR, "ttrpgmap-pin-selector-svg"));
    }

    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.removeClass("ttrpgmap-pin-selector-active"));
      btn.addClass("ttrpgmap-pin-selector-active");
      opts.onChange(sel);
    });

    buttons.push(btn);
  }

  // Color picker
  const colorWrap = row.createDiv({ cls: "ttrpgmap-pin-selector-color-wrap" });
  colorWrap.createSpan({ cls: "ttrpgmap-pin-selector-color-label", text: "Color:" });
  const colorInput = colorWrap.createEl("input", { cls: "ttrpgmap-pin-selector-color" });
  colorInput.type = "color";
  colorInput.value = currentColor;
  colorInput.addEventListener("input", (e) => {
    currentColor = (e.target as HTMLInputElement).value;
    opts.onColorChange(currentColor);
  });

  return {
    updateColor: (color: string) => {
      currentColor = color;
      colorInput.value = color;
    },
  };
}
