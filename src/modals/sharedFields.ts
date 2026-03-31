import { App, Setting } from "obsidian";
import { MarkerDirection, TextPlacement } from "../types";
import { IconSuggest } from "../suggests/IconSuggest";
import { setFAIcon } from "../utils/faIcon";
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
  shape: "pin" | "circle";
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

/** Icon search + inline preview. Returns { setting, updatePreview }. */
export function buildIconField(ctx: FieldContext): { setting: Setting; updatePreview: () => void } {
  const setting = new Setting(ctx.contentEl)
    .setName("Icon")
    .addText((text) => {
      text
        .setPlaceholder("Search for an icon...")
        .setValue(ctx.state.icon ?? "")
        .onChange((value) => {
          ctx.state.icon = value || null;
          updatePreview();
          ctx.onChanged();
        });
      new IconSuggest(ctx.app, text.inputEl, (value) => {
        ctx.state.icon = value || null;
        updatePreview();
        ctx.onChanged();
      });
    });

  const preview = setting.controlEl.createDiv({ cls: "ttrpgmap-icon-inline-preview" });
  preview.style.color = ctx.state.iconColor;

  function updatePreview() {
    preview.empty();
    preview.style.color = ctx.state.iconColor;
    if (ctx.state.icon) setFAIcon(preview, ctx.state.icon);
  }
  updatePreview();

  return { setting, updatePreview };
}

/** Icon color picker with hex + RGB. Returns { setting, picker }. */
export function buildIconColorField(
  ctx: FieldContext,
  updateIconPreview: () => void
): { setting: Setting; picker: { setValue: (hex: string) => void } } {
  const setting = new Setting(ctx.contentEl).setName("Icon Color");
  const picker = createColorPicker({
    container: setting.controlEl,
    value: ctx.state.iconColor,
    onChange: (hex) => {
      ctx.state.iconColor = hex;
      updateIconPreview();
      ctx.onChanged();
    },
  });
  return { setting, picker };
}
