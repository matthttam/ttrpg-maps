import { App, Setting } from "obsidian";
import { MarkerDirection, TextPlacement } from "../types";
import { IconSuggest } from "../suggests/IconSuggest";
import { setFAIcon, getFAIcon } from "../utils/faIcon";

import { createPinSelector, PinSelection } from "../utils/pinSelector";
import { createColorPicker } from "../utils/colorPicker";

/** Shared state bag for the fields below */
export interface MarkerFieldState {
  icon: string | null;
  iconColor: string;
  direction: MarkerDirection;
  textPlacement: TextPlacement;
  color: string;
  useBaseMarker: boolean;
  shape: "pin" | "circle" | "hotspot";
}

interface FieldContext {
  app: App;
  contentEl: HTMLElement;
  state: MarkerFieldState;
  onChanged: () => void;
}

/** Text Placement dropdown. Returns the Setting for adding extras (e.g. reset button). */
export function buildTextPlacementField(ctx: FieldContext): Setting {
  const setting = new Setting(ctx.contentEl)
    .setName("Text Placement")
    .setDesc("Where the label appears relative to the marker")
    .addDropdown((dropdown) => {
      dropdown.addOption("above", "Above");
      dropdown.addOption("below", "Below");
      dropdown.addOption("left", "Left");
      dropdown.addOption("right", "Right");
      dropdown.setValue(ctx.state.textPlacement);
      dropdown.onChange((value) => {
        ctx.state.textPlacement = value as TextPlacement;
        ctx.onChanged();
      });
    });
  return setting;
}

/** Pin selector (direction + color button group). Returns the Setting. */
export function buildPinSelectorField(ctx: FieldContext): Setting {
  const setting = new Setting(ctx.contentEl).setName("Pin");
  const container = setting.controlEl.createDiv();
  let selected: PinSelection;
  if (!ctx.state.useBaseMarker) {
    selected = "none";
  } else if (ctx.state.shape === "hotspot") {
    selected = "hotspot";
  } else if (ctx.state.shape === "circle") {
    selected = "circle";
  } else {
    selected = ctx.state.direction as PinSelection;
  }

  createPinSelector({
    container,
    selected,
    color: ctx.state.color,
    onChange: (value) => {
      if (value === "none") {
        ctx.state.useBaseMarker = false;
      } else if (value === "hotspot") {
        ctx.state.useBaseMarker = true;
        ctx.state.shape = "hotspot";
      } else if (value === "circle") {
        ctx.state.useBaseMarker = true;
        ctx.state.shape = "circle";
      } else {
        ctx.state.useBaseMarker = true;
        ctx.state.shape = "pin";
        ctx.state.direction = value as MarkerDirection;
      }
      ctx.onChanged();
    },
    onColorChange: (color) => {
      ctx.state.color = color;
      ctx.onChanged();
    },
  });

  return setting;
}

/** Icon search + color picker. Returns { setting, colorPicker }. */
export function buildIconField(ctx: FieldContext): {
  setting: Setting;
  colorPicker: { setValue: (hex: string) => void };
} {
  const setting = new Setting(ctx.contentEl).setName("Icon");

  // Wrapper that looks like a dropdown with icon + text + source badge
  const inputWrap = setting.controlEl.createDiv({ cls: "ttrpgmap-icon-input-wrap" });
  const iconPreview = inputWrap.createDiv({ cls: "ttrpgmap-icon-input-preview" });
  let sourceEl: HTMLElement;

  function updateInputPreview() {
    iconPreview.empty();
    if (ctx.state.icon) {
      setFAIcon(iconPreview, ctx.state.icon);
      iconPreview.style.display = "";
      const icon = getFAIcon(ctx.state.icon);
      sourceEl.setText(icon ? (icon.set === "gi" ? "Game Icons" : "FA") : "");
      sourceEl.style.display = icon ? "" : "none";
    } else {
      iconPreview.style.display = "none";
      sourceEl.setText("");
      sourceEl.style.display = "none";
    }
  }

  setting.addText((text) => {
    const inputEl = text.inputEl;

    // Auto-size input to content width
    function autoSize() {
      inputEl.style.width = "0";
      inputEl.style.width = Math.max(inputEl.scrollWidth, 80) + "px";
    }

    text
      .setPlaceholder("Search for an icon...")
      .setValue(ctx.state.icon ?? "")
      .onChange((value) => {
        ctx.state.icon = value || null;
        updateInputPreview();
        autoSize();
        ctx.onChanged();
      });
    // Move the input element inside our styled wrapper
    inputWrap.appendChild(inputEl);
    autoSize();

    // Select all text on focus, but not on subsequent clicks
    let justFocused = false;
    inputEl.addEventListener("focus", () => {
      justFocused = true;
      inputEl.select();
    });
    inputEl.addEventListener("mouseup", (e) => {
      if (justFocused) {
        e.preventDefault();
        justFocused = false;
      }
    });

    new IconSuggest(ctx.app, text.inputEl, (value) => {
      ctx.state.icon = value || null;
      text.setValue(value || "");
      updateInputPreview();
      autoSize();
      ctx.onChanged();
    });
  });

  sourceEl = inputWrap.createSpan({ cls: "ttrpgmap-icon-input-source" });
  updateInputPreview();

  // Inline color picker
  const colorWrap = setting.controlEl.createDiv({ cls: "ttrpgmap-icon-color-wrap" });
  colorWrap.createSpan({ cls: "ttrpgmap-icon-color-label", text: "Color:" });
  const colorPicker = createColorPicker({
    container: colorWrap,
    value: ctx.state.iconColor,
    onChange: (hex) => {
      ctx.state.iconColor = hex;
      ctx.onChanged();
    },
  });

  return { setting, colorPicker };
}
