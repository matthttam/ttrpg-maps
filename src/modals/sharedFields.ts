import { App, Setting } from "obsidian";
import { MarkerDirection, TextPlacement } from "../types";
import { IconSuggest } from "../suggests/IconSuggest";
import { setMapIcon, getMapIcon } from "../utils/mapIcon";

import { createPinSelector, PinSelection } from "../utils/pinSelector";
import { createColorPicker } from "../utils/colorPicker";

/** Shared state bag for the fields below */
export interface MarkerFieldState {
  icon: string | null;
  iconColor: string;
  iconRotation: number;
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
    .setName("Text placement")
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

/** Icon search + color picker + rotation. */
export function buildIconField(ctx: FieldContext): {
  setting: Setting;
  colorPicker: { setValue: (hex: string) => void };
  rotationInput: { setValue: (deg: number) => void };
  rotationEl: HTMLElement;
} {
  const setting = new Setting(ctx.contentEl).setName("Icon");

  // Wrapper that looks like a dropdown with icon + text + source badge
  const inputWrap = setting.controlEl.createDiv({ cls: "ttrpgmap-icon-input-wrap" });
  const iconPreview = inputWrap.createDiv({ cls: "ttrpgmap-icon-input-preview" });
  let sourceEl: HTMLElement;

  function updateInputPreview() {
    iconPreview.empty();
    if (ctx.state.icon) {
      setMapIcon(iconPreview, ctx.state.icon);
      iconPreview.removeClass("ttrpgmap-hidden");
      const icon = getMapIcon(ctx.state.icon);
      sourceEl.setText(icon ? (icon.set === "gi" ? "Game Icons" : "FA") : "");
      if (icon) { sourceEl.removeClass("ttrpgmap-hidden"); } else { sourceEl.addClass("ttrpgmap-hidden"); }
    } else {
      iconPreview.addClass("ttrpgmap-hidden");
      sourceEl.setText("");
      sourceEl.addClass("ttrpgmap-hidden");
    }
  }

  setting.addText((text) => {
    const inputEl = text.inputEl;

    // Auto-size input to content width, wide enough for placeholder when empty
    function autoSize() {
      inputEl.setCssStyles({ width: "0" });
      const minWidth = inputEl.value ? 80 : 150;
      inputEl.setCssStyles({ width: Math.max(inputEl.scrollWidth, minWidth) + "px" });
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

  // Inline color picker (same row as icon search)
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

  // Rotation (own row below the icon setting)
  const rotationWrap = ctx.contentEl.createDiv({ cls: "ttrpgmap-icon-rotation-row" });
  rotationWrap.createSpan({ cls: "ttrpgmap-icon-color-label", text: "Rotation:" });
  const rotationSlider = rotationWrap.createEl("input", {
    cls: "ttrpgmap-icon-rotation-slider",
    type: "range",
    attr: { min: "0", max: "359", step: "1" },
    value: String(ctx.state.iconRotation ?? 0),
  });
  const rotationInput = rotationWrap.createEl("input", {
    cls: "ttrpgmap-icon-rotation-input",
    type: "number",
    attr: { min: "0", max: "359", step: "1" },
    value: String(ctx.state.iconRotation ?? 0),
  });
  const updateRotation = (val: number) => {
    ctx.state.iconRotation = ((val % 360) + 360) % 360;
    ctx.onChanged();
  };
  rotationSlider.addEventListener("input", () => {
    const val = parseInt(rotationSlider.value, 10);
    if (!isNaN(val)) {
      rotationInput.value = String(val);
      updateRotation(val);
    }
  });
  rotationInput.addEventListener("input", () => {
    const val = parseInt(rotationInput.value, 10);
    if (!isNaN(val)) {
      rotationSlider.value = String(((val % 360) + 360) % 360);
      updateRotation(val);
    }
  });

  return {
    setting,
    colorPicker,
    rotationInput: {
      setValue(deg: number) { rotationInput.value = String(deg); rotationSlider.value = String(deg); },
    },
    rotationEl: rotationWrap,
  };
}

// ── Scale slider + text input ──

export interface ScaleSliderControls {
  setValue: (fraction: number) => void;
  setDisabled: (disabled: boolean) => void;
}

interface ScaleSliderOpts {
  setting: Setting;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * Add a linked slider (25-300%) + text input to a Setting.
 * Both controls stay in sync. Values are in fractions (1.0 = 100%).
 */
export function buildScaleSlider(opts: ScaleSliderOpts): ScaleSliderControls {
  const { setting, value, onChange, disabled = false } = opts;
  let sliderRef: { setValue: (v: number) => unknown; setDisabled: (d: boolean) => unknown } | null = null;
  let textRef: { setValue: (v: string) => unknown; setDisabled: (d: boolean) => unknown } | null = null;

  setting.addSlider((slider) => {
    sliderRef = slider;
    slider
      .setLimits(25, 300, 5)
      .setValue(Math.round(value * 100))
      .onChange((v: number) => {
        if (textRef) textRef.setValue(String(v));
        onChange(v / 100);
      });
    slider.sliderEl.addEventListener("input", () => {
      const v = parseInt(slider.sliderEl.value, 10);
      if (textRef) textRef.setValue(String(v));
    });
    if (disabled) slider.setDisabled(true);
  });

  setting.addText((text) => {
    textRef = text;
    text.inputEl.type = "number";
    text.inputEl.min = "25";
    text.inputEl.max = "300";
    text.inputEl.step = "5";
    text.inputEl.addClass("ttrpgmap-scale-input");
    text
      .setValue(String(Math.round(value * 100)))
      .onChange((v: string) => {
        const num = parseInt(v, 10);
        if (!isNaN(num) && num >= 25 && num <= 300) {
          if (sliderRef) sliderRef.setValue(num);
          onChange(num / 100);
        }
      });
    if (disabled) text.setDisabled(true);
  });

  return {
    setValue(fraction: number) {
      const pct = Math.round(fraction * 100);
      if (sliderRef) sliderRef.setValue(pct);
      if (textRef) textRef.setValue(String(pct));
    },
    setDisabled(d: boolean) {
      if (sliderRef) sliderRef.setDisabled(d);
      if (textRef) textRef.setDisabled(d);
    },
  };
}
