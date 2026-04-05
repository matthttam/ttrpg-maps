import { App, Modal, Setting, setIcon } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MapConfig, MapState, MarkerLayer, DEFAULT_LAYER, DEFAULT_LAYER_ID, DEFAULT_MARKER_SCALE, DEFAULT_MARKER_TEXT_SCALE } from "../types";
import { ImageSuggest } from "../suggests/ImageSuggest";
import { LayerEditModal } from "./LayerEditModal";

/** Replace setDesc with a (?) icon that shows the tooltip on hover */
function addHelpIcon(setting: Setting, tooltip: string): void {
  const icon = setting.nameEl.createSpan({ cls: "ttrpgmap-help-icon" });
  setIcon(icon, "help-circle");
  icon.setAttribute("aria-label", tooltip);
  icon.setAttribute("data-tooltip-position", "top");
}

export class MapSettingsModal extends Modal {
  private plugin: TTRPGMapsPlugin;
  private config: MapConfig;
  private state: MapState;
  private onSave: (config: MapConfig) => void;
  private onLayerChange: (state: MapState) => void;

  constructor(
    app: App,
    plugin: TTRPGMapsPlugin,
    config: MapConfig,
    state: MapState,
    onSave: (config: MapConfig) => void,
    onLayerChange: (state: MapState) => void,
  ) {
    super(app);
    this.plugin = plugin;
    this.config = { ...config };
    this.state = state;
    this.onSave = onSave;
    this.onLayerChange = onLayerChange;
  }

  private loadImageDimensions(container: HTMLElement): void {
    container.empty();
    const file = this.app.vault.getFileByPath(this.config.image);
    if (!file) {
      container.setText("Image not found");
      return;
    }
    const resourcePath = this.app.vault.getResourcePath(file);
    const img = new Image();
    img.onload = () => {
      container.setText(`Native size: ${img.naturalWidth} \u00d7 ${img.naturalHeight} px`);
    };
    img.onerror = () => {
      container.setText("Could not load image");
    };
    img.src = resourcePath;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("ttrpgmap-modal-container");
    contentEl.addClass("ttrpgmap-modal");

    contentEl.createEl("h2", { text: "Map Settings" });

    const imageDimsEl = contentEl.createDiv({ cls: "ttrpgmap-image-dims" });

    const imageSetting = new Setting(contentEl)
      .setName("Image")
      .addText((text) => {
        text
          .setPlaceholder("Search for an image...")
          .setValue(this.config.image)
          .onChange((value) => {
            this.config.image = value;
            this.loadImageDimensions(imageDimsEl);
          });
        new ImageSuggest(this.app, text.inputEl, (value) => {
          this.config.image = value;
          this.loadImageDimensions(imageDimsEl);
        });
      });
    addHelpIcon(imageSetting, "Search for a map image in your vault");

    contentEl.appendChild(imageDimsEl);
    this.loadImageDimensions(imageDimsEl);

    const idSetting = new Setting(contentEl)
      .setName("Map ID")
      .addText((text) =>
        text
          .setValue(this.config.id)
          .onChange((value) => (this.config.id = value))
      );
    addHelpIcon(idSetting, "Unique identifier. Use different IDs to have separate markers on the same image.");

    const heightSetting = new Setting(contentEl)
      .setName("Height")
      .addText((text) =>
        text
          .setPlaceholder("e.g. 500 or 80%")
          .setValue(this.config.height ?? "")
          .onChange((value) => (this.config.height = value || null))
      );
    addHelpIcon(heightSetting, "Display height (blank = auto from width/image)");

    const widthSetting = new Setting(contentEl)
      .setName("Width")
      .addText((text) =>
        text
          .setPlaceholder("e.g. 800 or 100%")
          .setValue(this.config.width ?? "")
          .onChange((value) => (this.config.width = value || null))
      );
    addHelpIcon(widthSetting, "Display width (blank = auto from height/image)");

    contentEl.createEl("h3", { text: "Zoom" });

    const zoomMinSetting = new Setting(contentEl)
      .setName("Minimum Zoom")
      .addText((text) =>
        text
          .setValue(String(this.config.zoomMin))
          .onChange((value) => (this.config.zoomMin = parseInt(value, 10) || 50))
      );
    addHelpIcon(zoomMinSetting, "Minimum zoom level (%)");

    const zoomMaxSetting = new Setting(contentEl)
      .setName("Maximum Zoom")
      .addText((text) =>
        text
          .setValue(String(this.config.zoomMax))
          .onChange((value) => (this.config.zoomMax = parseInt(value, 10) || 200))
      );
    addHelpIcon(zoomMaxSetting, "Maximum zoom level (%)");

    const zoomStepSetting = new Setting(contentEl)
      .setName("Zoom Step")
      .addText((text) =>
        text
          .setValue(String(this.config.zoomStep))
          .onChange((value) => (this.config.zoomStep = parseInt(value, 10) || 10))
      );
    addHelpIcon(zoomStepSetting, "Amount to change per zoom increment (%)");

    // ── Marker Scale ──
    contentEl.createEl("h3", { text: "Markers" });

    const globalScale = this.plugin.settings.defaultMarkerScale ?? DEFAULT_MARKER_SCALE;
    const hasOverride = this.state.markerScale != null;
    const effectiveScale = this.state.markerScale ?? globalScale;

    const scaleDescEl = contentEl.createDiv({ cls: "setting-item-description", text: "" });
    const updateScaleDesc = (val: number, isOverride: boolean) => {
      scaleDescEl.textContent = isOverride
        ? `Map override: ${Math.round(val * 100)}% (global default: ${Math.round(globalScale * 100)}%)`
        : `Using global default: ${Math.round(globalScale * 100)}%`;
    };
    updateScaleDesc(effectiveScale, hasOverride);

    let currentSlider: { setValue: (v: number) => any } | null = null;
    let currentTextInput: { setValue: (v: string) => any } | null = null;

    const scaleSetting = new Setting(contentEl)
      .setName("Marker Size");

    scaleSetting.addSlider((slider) => {
      currentSlider = slider;
      slider
        .setLimits(25, 300, 5)
        .setValue(Math.round(effectiveScale * 100))
        .onChange((value) => {
          this.state.markerScale = value / 100;
          if (currentTextInput) currentTextInput.setValue(String(value));
          updateScaleDesc(value / 100, true);
          this.onLayerChange(this.state);
        });
      if (!hasOverride) slider.setDisabled(true);
    });

    scaleSetting.addText((text) => {
      currentTextInput = text;
      text.inputEl.type = "number";
      text.inputEl.min = "25";
      text.inputEl.max = "300";
      text.inputEl.step = "5";
      text.inputEl.addClass("ttrpgmap-scale-input");
      text
        .setValue(String(Math.round(effectiveScale * 100)))
        .onChange((value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num >= 25 && num <= 300) {
            this.state.markerScale = num / 100;
            if (currentSlider) currentSlider.setValue(num);
            updateScaleDesc(num / 100, true);
            this.onLayerChange(this.state);
          }
        });
      if (!hasOverride) text.setDisabled(true);
    });

    scaleSetting.addToggle((toggle) => {
      toggle
        .setValue(hasOverride)
        .onChange((enabled) => {
          if (enabled) {
            this.state.markerScale = globalScale;
            if (currentSlider) {
              (currentSlider as any).setDisabled(false);
              currentSlider.setValue(Math.round(globalScale * 100));
            }
            if (currentTextInput) {
              (currentTextInput as any).setDisabled(false);
              currentTextInput.setValue(String(Math.round(globalScale * 100)));
            }
            updateScaleDesc(globalScale, true);
          } else {
            this.state.markerScale = undefined;
            if (currentSlider) {
              (currentSlider as any).setDisabled(true);
              currentSlider.setValue(Math.round(globalScale * 100));
            }
            if (currentTextInput) {
              (currentTextInput as any).setDisabled(true);
              currentTextInput.setValue(String(Math.round(globalScale * 100)));
            }
            updateScaleDesc(globalScale, false);
          }
          this.onLayerChange(this.state);
        });
    });

    addHelpIcon(scaleSetting, "Override the global marker size for this map. Toggle enables the override.");

    contentEl.appendChild(scaleDescEl);

    // Scale to Zoom
    const globalScaleToZoom = this.plugin.settings.defaultScaleMarkersToZoom ?? true;
    const globalZoomLabel = globalScaleToZoom ? "Screen-constant" : "Fixed to map";

    const markerZoomSetting = new Setting(contentEl)
      .setName("Scale Markers to Zoom")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("inherit", "Inherit")
          .addOption("screen", "Screen-constant")
          .addOption("map", "Fixed to map")
          .setValue(this.state.scaleMarkersToZoom == null ? "inherit" : this.state.scaleMarkersToZoom ? "screen" : "map")
          .onChange((value) => {
            if (value === "inherit") this.state.scaleMarkersToZoom = undefined;
            else this.state.scaleMarkersToZoom = value === "screen";
            this.onLayerChange(this.state);
          });
      });
    addHelpIcon(markerZoomSetting, `Inherit uses the global default (currently ${globalZoomLabel}). Screen-constant keeps markers the same size on screen. Fixed to map makes markers scale with zoom.`);

    // ── Text Scale ──
    contentEl.createEl("h3", { text: "Text" });

    const globalTextScale = this.plugin.settings.defaultMarkerTextScale ?? DEFAULT_MARKER_TEXT_SCALE;
    const hasTextOverride = this.state.markerTextScale != null;
    const effectiveTextScale = this.state.markerTextScale ?? globalTextScale;

    const textScaleDescEl = contentEl.createDiv({ cls: "setting-item-description", text: "" });
    const updateTextScaleDesc = (val: number, isOverride: boolean) => {
      textScaleDescEl.textContent = isOverride
        ? `Map override: ${Math.round(val * 100)}% (global default: ${Math.round(globalTextScale * 100)}%)`
        : `Using global default: ${Math.round(globalTextScale * 100)}%`;
    };
    updateTextScaleDesc(effectiveTextScale, hasTextOverride);

    let textScaleSlider: { setValue: (v: number) => any } | null = null;
    let textScaleInput: { setValue: (v: string) => any } | null = null;

    const textScaleSetting = new Setting(contentEl)
      .setName("Text Size");

    textScaleSetting.addSlider((slider) => {
      textScaleSlider = slider;
      slider
        .setLimits(25, 300, 5)
        .setValue(Math.round(effectiveTextScale * 100))
        .onChange((value) => {
          this.state.markerTextScale = value / 100;
          if (textScaleInput) textScaleInput.setValue(String(value));
          updateTextScaleDesc(value / 100, true);
          this.onLayerChange(this.state);
        });
      if (!hasTextOverride) slider.setDisabled(true);
    });

    textScaleSetting.addText((text) => {
      textScaleInput = text;
      text.inputEl.type = "number";
      text.inputEl.min = "25";
      text.inputEl.max = "300";
      text.inputEl.step = "5";
      text.inputEl.addClass("ttrpgmap-scale-input");
      text
        .setValue(String(Math.round(effectiveTextScale * 100)))
        .onChange((value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num >= 25 && num <= 300) {
            this.state.markerTextScale = num / 100;
            if (textScaleSlider) textScaleSlider.setValue(num);
            updateTextScaleDesc(num / 100, true);
            this.onLayerChange(this.state);
          }
        });
      if (!hasTextOverride) text.setDisabled(true);
    });

    textScaleSetting.addToggle((toggle) => {
      toggle
        .setValue(hasTextOverride)
        .onChange((enabled) => {
          if (enabled) {
            this.state.markerTextScale = globalTextScale;
            if (textScaleSlider) {
              (textScaleSlider as any).setDisabled(false);
              textScaleSlider.setValue(Math.round(globalTextScale * 100));
            }
            if (textScaleInput) {
              (textScaleInput as any).setDisabled(false);
              textScaleInput.setValue(String(Math.round(globalTextScale * 100)));
            }
            updateTextScaleDesc(globalTextScale, true);
          } else {
            this.state.markerTextScale = undefined;
            if (textScaleSlider) {
              (textScaleSlider as any).setDisabled(true);
              textScaleSlider.setValue(Math.round(globalTextScale * 100));
            }
            if (textScaleInput) {
              (textScaleInput as any).setDisabled(true);
              textScaleInput.setValue(String(Math.round(globalTextScale * 100)));
            }
            updateTextScaleDesc(globalTextScale, false);
          }
          this.onLayerChange(this.state);
        });
    });

    addHelpIcon(textScaleSetting, "Override the global text label size for this map. Toggle enables the override.");

    contentEl.appendChild(textScaleDescEl);

    // Scale Text to Zoom
    const globalTextScaleToZoom = this.plugin.settings.defaultScaleMarkerTextToZoom ?? true;
    const globalTextZoomLabel = globalTextScaleToZoom ? "Screen-constant" : "Fixed to map";

    const textZoomSetting = new Setting(contentEl)
      .setName("Scale Text to Zoom")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("inherit", "Inherit")
          .addOption("screen", "Screen-constant")
          .addOption("map", "Fixed to map")
          .setValue(this.state.scaleMarkerTextToZoom == null ? "inherit" : this.state.scaleMarkerTextToZoom ? "screen" : "map")
          .onChange((value) => {
            if (value === "inherit") this.state.scaleMarkerTextToZoom = undefined;
            else this.state.scaleMarkerTextToZoom = value === "screen";
            this.onLayerChange(this.state);
          });
      });
    addHelpIcon(textZoomSetting, `Inherit uses the global default (currently ${globalTextZoomLabel}). Screen-constant keeps text the same size on screen. Fixed to map makes text scale with zoom.`);

    // ── Marker Layers ──
    const layersContainer = contentEl.createDiv({ cls: "ttrpgmap-layers-container" });
    this.renderLayers(layersContainer);

    // ── Save ──
    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Save")
        .setCta()
        .onClick(() => {
          this.onSave(this.config);
          this.close();
        })
    );
  }

  private formatZoomRange(layer: MarkerLayer): string {
    const min = layer.zoomMin;
    const max = layer.zoomMax;
    if (min == null && max == null) return "Always visible";
    if (min != null && max != null) return `${min}% \u2013 ${max}%`;
    if (min != null) return `${min}%+`;
    return `Up to ${max}%`;
  }

  private renderLayers(container: HTMLElement): void {
    container.empty();

    // Header row with "Add Layer" button
    const header = container.createDiv({ cls: "setting-item setting-item-heading" });
    const headerInfo = header.createDiv({ cls: "setting-item-info" });
    headerInfo.createDiv({ cls: "setting-item-name", text: "Marker Layers" });
    headerInfo.createDiv({ cls: "setting-item-description", text: "Control marker visibility based on zoom level" });
    const headerControl = header.createDiv({ cls: "setting-item-control" });
    const addBtn = headerControl.createEl("button", { text: "Add Layer" });
    addBtn.addEventListener("click", () => {
      const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newLayer: MarkerLayer = {
        id,
        name: "New Layer",
        zoomMin: this.config.zoomMin,
        zoomMax: this.config.zoomMax,
      };
      new LayerEditModal(this.app, newLayer, (saved) => {
        this.state.layers.push(saved);
        this.onLayerChange(this.state);
        this.renderLayers(container);
      }).open();
    });

    for (const layer of this.state.layers) {
      const isDefault = layer.id === DEFAULT_LAYER_ID;

      const row = container.createDiv({ cls: "setting-item" });
      const info = row.createDiv({ cls: "setting-item-info" });
      const nameRow = info.createDiv({ cls: "setting-item-name ttrpgmap-layer-name-row" });

      // Layer icon
      const iconEl = nameRow.createDiv({ cls: "ttrpgmap-layer-icon" });
      setIcon(iconEl, "layers");

      nameRow.createSpan({ text: layer.name });

      info.createDiv({
        cls: "setting-item-description",
        text: `Zoom: ${this.formatZoomRange(layer)}`,
      });

      const control = row.createDiv({ cls: "setting-item-control" });

      // Edit button
      const editBtn = control.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Edit layer" } });
      setIcon(editBtn, "pencil");
      editBtn.addEventListener("click", () => {
        new LayerEditModal(this.app, layer, (saved) => {
          Object.assign(layer, saved);
          this.onLayerChange(this.state);
          this.renderLayers(container);
        }).open();
      });

      if (isDefault) {
        // Reset button
        const resetBtn = control.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Reset to defaults" } });
        setIcon(resetBtn, "rotate-ccw");
        resetBtn.addEventListener("click", () => {
          layer.zoomMin = DEFAULT_LAYER.zoomMin;
          layer.zoomMax = DEFAULT_LAYER.zoomMax;
          this.onLayerChange(this.state);
          this.renderLayers(container);
        });
      } else {
        // Delete button
        const deleteBtn = control.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Delete layer" } });
        setIcon(deleteBtn, "trash-2");
        deleteBtn.addEventListener("click", () => {
          const count = this.state.markers.filter((m) => m.layerId === layer.id).length;
          if (count > 0) {
            const msg = `${count} marker${count === 1 ? "" : "s"} will be moved to the Default Marker layer.`;
            if (!confirm(msg)) return;
          }
          for (const m of this.state.markers) {
            if (m.layerId === layer.id) m.layerId = null;
          }
          this.state.layers = this.state.layers.filter((l) => l.id !== layer.id);
          this.onLayerChange(this.state);
          this.renderLayers(container);
        });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
