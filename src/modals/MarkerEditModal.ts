import { App, Modal, Setting, setIcon } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MarkerTemplate, MarkerDirection, TextPlacement, MarkerLayer, DEFAULT_LAYER_ID } from "../types";
import { NoteLinkSuggest } from "../suggests/NoteLinkSuggest";
import { createPinElement } from "../utils/markerPin";
import { buildMarkerLabel } from "../utils/markerLabel";
import { buildTextPlacementField, buildPinSelectorField, buildIconField, buildScaleSlider, MarkerFieldState } from "./sharedFields";

export class MarkerEditModal extends Modal {
  private plugin: TTRPGMapsPlugin;
  private layers: MarkerLayer[];
  private marker: {
    note: string | null;
    alias: string | null;
    previewNote: string | null;
    description: string | null;
    templateId: string;
    layerId: string | null;
    direction: string | null;
    textPlacement: string | null;
    color: string | null;
    icon: string | null;
    iconColor: string | null;
    iconRotation: number | null;
    useBaseMarker: boolean | null;
    shape: "pin" | "circle" | "hotspot" | null;
    scale: number | null;
    scaleToZoom: boolean | null;
    textScale: number | null;
    textScaleToZoom: boolean | null;
  };
  private onSave: (marker: typeof this.marker) => void;

  constructor(
    app: App,
    plugin: TTRPGMapsPlugin,
    marker: typeof MarkerEditModal.prototype.marker,
    layers: MarkerLayer[],
    onSave: (marker: typeof MarkerEditModal.prototype.marker) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.marker = { ...marker };
    this.layers = layers;
    this.onSave = onSave;
  }

  private getTemplate(): MarkerTemplate | undefined {
    return this.plugin.settings.markerTemplates.find(
      (t) => t.id === this.marker.templateId
    );
  }

  private addResetButton(setting: Setting, onReset: () => void): void {
    setting.addExtraButton((btn) =>
      btn
        .setIcon("history")
        .setTooltip("Reset to template default")
        .onClick(() => {
          if (this.getTemplate()) {
            onReset();
            this.onOpen();
          }
        })
    );
  }

  private addInlineResetButton(container: HTMLElement, onReset: () => void): void {
    const btn = container.createDiv({ cls: "clickable-icon ttrpgmap-inline-reset", attr: { "aria-label": "Reset to template default" } });
    setIcon(btn, "history");
    btn.addEventListener("click", () => {
      if (this.getTemplate()) {
        onReset();
        this.onOpen();
      }
    });
  }

  /** Bridge marker's nullable fields into the non-null MarkerFieldState the shared builders expect */
  private getFieldState(): MarkerFieldState {
    return {
      icon: this.marker.icon,
      iconColor: this.marker.iconColor ?? "#000000",
      iconRotation: this.marker.iconRotation ?? 0,
      direction: (this.marker.direction ?? "down") as MarkerDirection,
      textPlacement: (this.marker.textPlacement ?? "above") as TextPlacement,
      color: this.marker.color ?? "#ffffff",
      useBaseMarker: this.marker.useBaseMarker ?? true,
      shape: this.marker.shape ?? "pin",
    };
  }

  /** Write shared field state back to marker's nullable fields */
  private syncFromFieldState(fs: MarkerFieldState): void {
    this.marker.icon = fs.icon;
    this.marker.iconColor = fs.iconColor;
    this.marker.iconRotation = fs.iconRotation;
    this.marker.direction = fs.direction;
    this.marker.textPlacement = fs.textPlacement;
    this.marker.color = fs.color;
    this.marker.useBaseMarker = fs.useBaseMarker;
    this.marker.shape = fs.shape;
  }

  private renderPreview(container: HTMLElement): void {
    container.empty();
    const usePin = this.marker.useBaseMarker ?? true;
    const direction = (this.marker.direction ?? "down") as MarkerDirection;
    const textPlacement = (this.marker.textPlacement ?? "above") as TextPlacement;

    const wrapper = container.createDiv({ cls: "ttrpgmap-edit-preview-wrapper" });
    wrapper.dataset.direction = direction;
    wrapper.dataset.textPlacement = textPlacement;

    createPinElement(wrapper, {
      pinClass: "ttrpgmap-edit-preview-pin",
      svgClass: "ttrpgmap-pin-svg",
      color: this.marker.color ?? "#ffffff",
      icon: this.marker.icon,
      iconColor: this.marker.iconColor ?? "#000000",
      iconRotation: this.marker.iconRotation ?? 0,
      iconClass: "ttrpgmap-edit-preview-icon",
      useBaseMarker: usePin,
      shape: this.marker.shape ?? "pin",
    });

    buildMarkerLabel(wrapper, this.marker.note, this.marker.alias, this.marker.description, "ttrpgmap-edit-preview-label");
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("ttrpgmap-modal-container", "ttrpgmap-modal-container--wide", "mod-settings");
    contentEl.addClass("ttrpgmap-modal");

    const template = this.getTemplate();

    new Setting(contentEl).setName("Edit marker").setHeading();

    const layout = contentEl.createDiv({ cls: "ttrpgmap-modal-layout" });
    const mainCol = layout.createDiv({ cls: "ttrpgmap-modal-main" });
    const previewContainer = layout.createDiv({ cls: "ttrpgmap-edit-preview" });
    this.renderPreview(previewContainer);

    // ── Template ──
    new Setting(mainCol)
      .setName("Template")
      .addDropdown((dropdown) => {
        for (const t of this.plugin.settings.markerTemplates) {
          dropdown.addOption(t.id, t.name);
        }
        dropdown.setValue(this.marker.templateId);
        dropdown.onChange((value) => {
          this.marker.templateId = value;
          const newTemplate = this.plugin.settings.markerTemplates.find((t) => t.id === value);
          if (newTemplate) {
            this.marker.direction = newTemplate.direction;
            this.marker.textPlacement = newTemplate.textPlacement;
            this.marker.color = newTemplate.color;
            this.marker.icon = newTemplate.icon;
            this.marker.iconColor = newTemplate.iconColor;
            this.marker.iconRotation = newTemplate.iconRotation;
            this.marker.useBaseMarker = newTemplate.useBaseMarker;
            this.marker.shape = newTemplate.shape;
          }
          activeWindow.requestAnimationFrame(() => this.onOpen());
        });
      });

    // ── Layer ──
    if (this.layers.length > 1) {
      new Setting(mainCol)
        .setName("Layer")
        .setDesc("Visibility layer for zoom-based show/hide")
        .addDropdown((dropdown) => {
          for (const layer of this.layers) {
            dropdown.addOption(layer.id, layer.name);
          }
          dropdown.setValue(this.marker.layerId ?? DEFAULT_LAYER_ID);
          dropdown.onChange((value) => {
            this.marker.layerId = value === DEFAULT_LAYER_ID ? null : value;
          });
        });
    }

    // ── Note ──
    new Setting(mainCol)
      .setName("Note")
      .setDesc("Link to a note. Type # for headings, #^ for blocks.")
      .addText((text) => {
        text
          .setPlaceholder("Search for a note...")
          .setValue(this.marker.note ?? "")
          .onChange((value) => {
            this.marker.note = value || null;
            this.renderPreview(previewContainer);
          });
        new NoteLinkSuggest(this.app, text.inputEl, (value) => {
          this.marker.note = value || null;
          this.renderPreview(previewContainer);
        });
      });

    // ── Alias ──
    new Setting(mainCol)
      .setName("Alias")
      .setDesc("Display name shown instead of the note filename")
      .addText((text) => {
        text
          .setPlaceholder("Display name...")
          .setValue(this.marker.alias ?? "")
          .onChange((value) => {
            this.marker.alias = value || null;
            this.renderPreview(previewContainer);
          });
      });

    // ── Preview Note ──
    new Setting(mainCol)
      .setName("Preview note")
      .setDesc("Note shown on hover preview (blank uses the linked note)")
      .addText((text) => {
        text
          .setPlaceholder("Search for a note...")
          .setValue(this.marker.previewNote ?? "")
          .onChange((value) => {
            this.marker.previewNote = value || null;
          });
        new NoteLinkSuggest(this.app, text.inputEl, (value) => {
          this.marker.previewNote = value || null;
        });
      });

    // ── Description ──
    new Setting(mainCol)
      .setName("Description")
      .setDesc("Additional text shown below the note name")
      .addTextArea((textArea) => {
        textArea
          .setValue(this.marker.description ?? "")
          .onChange((value) => {
            this.marker.description = value || null;
            this.renderPreview(previewContainer);
          });
        textArea.inputEl.addClass("ttrpgmap-description-input");
        textArea.inputEl.rows = 3;
      });

    // ── Shared fields (text placement, pin, icon) ──
    const fieldState = this.getFieldState();
    const ctx = {
      app: this.app,
      contentEl: mainCol,
      state: fieldState,
      onChanged: () => {
        this.syncFromFieldState(fieldState);
        this.renderPreview(previewContainer);
      },
    };

    const tpSetting = buildTextPlacementField(ctx);
    this.addResetButton(tpSetting, () => {
      this.marker.textPlacement = template?.textPlacement ?? "above";
    });

    const pinSetting = buildPinSelectorField(ctx);
    this.addResetButton(pinSetting, () => {
      this.marker.useBaseMarker = template?.useBaseMarker ?? true;
      this.marker.direction = template?.direction ?? "down";
      this.marker.color = template?.color ?? "#ffffff";
    });

    const { setting: iconSetting, colorPicker: iconColorPicker, rotationInput: iconRotationInput, rotationEl } = buildIconField(ctx);
    this.addResetButton(iconSetting, () => {
      this.marker.icon = template?.icon ?? null;
      this.marker.iconColor = template?.iconColor ?? "#000000";
      iconColorPicker.setValue(this.marker.iconColor);
    });
    this.addInlineResetButton(rotationEl, () => {
      this.marker.iconRotation = template?.iconRotation ?? 0;
      iconRotationInput.setValue(this.marker.iconRotation);
    });

    // ── Remaining fields are full-width (below the 2-column layout) ──

    // ── Scale ──
    const hasScaleOverride = this.marker.scale != null;

    const markerScaleSetting = new Setting(contentEl)
      .setName("Marker size")
      .setDesc("Override the map marker scale for this marker");

    const scaleControls = buildScaleSlider({
      setting: markerScaleSetting,
      value: this.marker.scale ?? 1.0,
      onChange: (value) => { this.marker.scale = value; },
      disabled: !hasScaleOverride,
    });

    markerScaleSetting.addToggle((toggle) => {
      toggle
        .setValue(hasScaleOverride)
        .onChange((enabled) => {
          if (enabled) {
            scaleControls.setDisabled(false);
            scaleControls.setValue(1.0);
            this.marker.scale = 1.0;
          } else {
            scaleControls.setDisabled(true);
            scaleControls.setValue(1.0);
            this.marker.scale = null;
          }
        });
    });

    // ── Scale to Zoom ──
    new Setting(contentEl)
      .setName("Scale to zoom")
      .setDesc("How this marker behaves when zooming")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("inherit", "Inherit")
          .addOption("screen", "Screen-constant")
          .addOption("map", "Fixed to map")
          .setValue(this.marker.scaleToZoom === null ? "inherit" : this.marker.scaleToZoom ? "screen" : "map")
          .onChange((value) => {
            if (value === "inherit") this.marker.scaleToZoom = null;
            else if (value === "screen") this.marker.scaleToZoom = true;
            else this.marker.scaleToZoom = false;
          });
      });

    // ── Text Scale ──
    const hasTextScaleOverride = this.marker.textScale != null;

    const textScaleSetting = new Setting(contentEl)
      .setName("Text size")
      .setDesc("Override the text label scale for this marker");

    const textScaleControls = buildScaleSlider({
      setting: textScaleSetting,
      value: this.marker.textScale ?? 1.0,
      onChange: (value) => { this.marker.textScale = value; },
      disabled: !hasTextScaleOverride,
    });

    textScaleSetting.addToggle((toggle) => {
      toggle
        .setValue(hasTextScaleOverride)
        .onChange((enabled) => {
          if (enabled) {
            textScaleControls.setDisabled(false);
            textScaleControls.setValue(1.0);
            this.marker.textScale = 1.0;
          } else {
            textScaleControls.setDisabled(true);
            textScaleControls.setValue(1.0);
            this.marker.textScale = null;
          }
        });
    });

    // ── Text Scale to Zoom ──
    new Setting(contentEl)
      .setName("Text scale to zoom")
      .setDesc("How this marker's text behaves when zooming")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("inherit", "Inherit")
          .addOption("screen", "Screen-constant")
          .addOption("map", "Fixed to map")
          .setValue(this.marker.textScaleToZoom === null ? "inherit" : this.marker.textScaleToZoom ? "screen" : "map")
          .onChange((value) => {
            if (value === "inherit") this.marker.textScaleToZoom = null;
            else if (value === "screen") this.marker.textScaleToZoom = true;
            else this.marker.textScaleToZoom = false;
          });
      });

    // ── Save / Cancel ──
    const actionSetting = new Setting(contentEl);
    actionSetting.controlEl.addClass("ttrpgmap-action-row");

    actionSetting
      .addButton((btn) =>
        btn
          .setButtonText("Reset to template & save")
          .setWarning()
          .onClick(() => {
            const tpl = this.getTemplate();
            if (tpl) {
              this.marker.direction = tpl.direction;
              this.marker.textPlacement = tpl.textPlacement;
              this.marker.color = tpl.color;
              this.marker.icon = tpl.icon;
              this.marker.iconColor = tpl.iconColor;
              this.marker.iconRotation = tpl.iconRotation;
              this.marker.useBaseMarker = tpl.useBaseMarker;
              this.marker.shape = tpl.shape;
              this.marker.scale = null;
              this.marker.scaleToZoom = null;
              this.marker.textScale = null;
              this.marker.textScaleToZoom = null;
            }
            this.onSave(this.marker);
            this.close();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            this.onSave(this.marker);
            this.close();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.close())
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
