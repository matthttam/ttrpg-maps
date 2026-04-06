import { App, Modal, Setting, setIcon } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MapConfig, MapState, MarkerLayer, DEFAULT_LAYER, DEFAULT_LAYER_ID, DEFAULT_MARKER_SCALE, DEFAULT_MARKER_TEXT_SCALE } from "../types";
import { ImageSuggest } from "../suggests/ImageSuggest";
import { LayerEditModal } from "./LayerEditModal";
import { buildScaleSlider } from "./sharedFields";

/** Add a (?) icon to the right side of a setting row that shows a tooltip on hover */
function addHelpIcon(setting: Setting, tooltip: string): void {
  const icon = setting.controlEl.createSpan({ cls: "ttrpgmap-help-icon" });
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
    this.modalEl.addClass("ttrpgmap-modal-container", "mod-settings");
    contentEl.addClass("ttrpgmap-modal");

    contentEl.createEl("h2", { text: "Map Settings" });

    const imageDimsEl = createSpan({ cls: "ttrpgmap-image-dims" });

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
    imageSetting.descEl.appendChild(imageDimsEl);
    this.loadImageDimensions(imageDimsEl);
    addHelpIcon(imageSetting, "Search for a map image in your vault");

    const idSetting = new Setting(contentEl)
      .setName("Map ID")
      .addText((text) =>
        text
          .setValue(this.config.id)
          .onChange((value) => (this.config.id = value))
      );
    addHelpIcon(idSetting, "Unique identifier. Use different IDs to have separate markers on the same image.");

    const sizeSetting = new Setting(contentEl)
      .setName("Map Size");
    const sizeControl = sizeSetting.controlEl;
    sizeControl.addClass("ttrpgmap-size-control");
    sizeControl.createSpan({ text: "Height:", cls: "ttrpgmap-size-label" });
    const heightInput = sizeControl.createEl("input", {
      type: "text",
      cls: "ttrpgmap-size-input",
      value: this.config.height ?? "",
      attr: { placeholder: "e.g. 500" },
    });
    heightInput.addEventListener("input", () => {
      this.config.height = heightInput.value || null;
    });
    sizeControl.createSpan({ text: "\u00d7", cls: "ttrpgmap-size-separator" });
    sizeControl.createSpan({ text: "Width:", cls: "ttrpgmap-size-label" });
    const widthInput = sizeControl.createEl("input", {
      type: "text",
      cls: "ttrpgmap-size-input",
      value: this.config.width ?? "",
      attr: { placeholder: "e.g. 800" },
    });
    widthInput.addEventListener("input", () => {
      this.config.width = widthInput.value || null;
    });
    addHelpIcon(sizeSetting, "Display dimensions (blank = auto from image aspect ratio)");

    const zoomSetting = new Setting(contentEl)
      .setName("Zoom Range");
    const zoomControl = zoomSetting.controlEl;
    zoomControl.addClass("ttrpgmap-size-control");
    zoomControl.createSpan({ text: "Min:", cls: "ttrpgmap-size-label" });
    const zoomMinInput = zoomControl.createEl("input", {
      type: "text",
      cls: "ttrpgmap-size-input",
      value: String(this.config.zoomMin),
    });
    zoomMinInput.addEventListener("input", () => {
      this.config.zoomMin = parseInt(zoomMinInput.value, 10) || 50;
    });
    zoomControl.createSpan({ text: "Max:", cls: "ttrpgmap-size-label" });
    const zoomMaxInput = zoomControl.createEl("input", {
      type: "text",
      cls: "ttrpgmap-size-input",
      value: String(this.config.zoomMax),
    });
    zoomMaxInput.addEventListener("input", () => {
      this.config.zoomMax = parseInt(zoomMaxInput.value, 10) || 200;
    });
    zoomControl.createSpan({ text: "Step:", cls: "ttrpgmap-size-label" });
    const zoomStepInput = zoomControl.createEl("input", {
      type: "text",
      cls: "ttrpgmap-size-input",
      value: String(this.config.zoomStep),
    });
    zoomStepInput.addEventListener("input", () => {
      this.config.zoomStep = parseInt(zoomStepInput.value, 10) || 10;
    });
    addHelpIcon(zoomSetting, "Zoom range (%) and step size per scroll increment");

    // ── Marker Scale ──
    contentEl.createEl("h3", { text: "Markers" });

    const globalScale = this.plugin.settings.defaultMarkerScale ?? DEFAULT_MARKER_SCALE;
    const hasOverride = this.state.markerScale != null;
    const effectiveScale = this.state.markerScale ?? globalScale;

    const scaleDescEl = createSpan();
    const updateScaleDesc = (val: number, isOverride: boolean) => {
      scaleDescEl.textContent = isOverride
        ? `Map override: ${Math.round(val * 100)}% (global default: ${Math.round(globalScale * 100)}%)`
        : `Using global default: ${Math.round(globalScale * 100)}%`;
    };
    updateScaleDesc(effectiveScale, hasOverride);

    const scaleSetting = new Setting(contentEl)
      .setName("Marker Size");

    const scaleControls = buildScaleSlider({
      setting: scaleSetting,
      value: effectiveScale,
      onChange: (value) => {
        this.state.markerScale = value;
        updateScaleDesc(value, true);
        this.onLayerChange(this.state);
      },
      disabled: !hasOverride,
    });

    scaleSetting.addToggle((toggle) => {
      toggle
        .setValue(hasOverride)
        .onChange((enabled) => {
          if (enabled) {
            this.state.markerScale = globalScale;
            scaleControls.setDisabled(false);
            scaleControls.setValue(globalScale);
            updateScaleDesc(globalScale, true);
          } else {
            this.state.markerScale = undefined;
            scaleControls.setDisabled(true);
            scaleControls.setValue(globalScale);
            updateScaleDesc(globalScale, false);
          }
          this.onLayerChange(this.state);
        });
    });

    scaleSetting.descEl.appendChild(scaleDescEl);
    addHelpIcon(scaleSetting, "Override the global marker size for this map. Toggle enables the override.");

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

    const textScaleDescEl = createSpan();
    const updateTextScaleDesc = (val: number, isOverride: boolean) => {
      textScaleDescEl.textContent = isOverride
        ? `Map override: ${Math.round(val * 100)}% (global default: ${Math.round(globalTextScale * 100)}%)`
        : `Using global default: ${Math.round(globalTextScale * 100)}%`;
    };
    updateTextScaleDesc(effectiveTextScale, hasTextOverride);

    const textScaleSetting = new Setting(contentEl)
      .setName("Text Size");

    const textScaleControls = buildScaleSlider({
      setting: textScaleSetting,
      value: effectiveTextScale,
      onChange: (value) => {
        this.state.markerTextScale = value;
        updateTextScaleDesc(value, true);
        this.onLayerChange(this.state);
      },
      disabled: !hasTextOverride,
    });

    textScaleSetting.addToggle((toggle) => {
      toggle
        .setValue(hasTextOverride)
        .onChange((enabled) => {
          if (enabled) {
            this.state.markerTextScale = globalTextScale;
            textScaleControls.setDisabled(false);
            textScaleControls.setValue(globalTextScale);
            updateTextScaleDesc(globalTextScale, true);
          } else {
            this.state.markerTextScale = undefined;
            textScaleControls.setDisabled(true);
            textScaleControls.setValue(globalTextScale);
            updateTextScaleDesc(globalTextScale, false);
          }
          this.onLayerChange(this.state);
        });
    });

    textScaleSetting.descEl.appendChild(textScaleDescEl);
    addHelpIcon(textScaleSetting, "Override the global text label size for this map. Toggle enables the override.");

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
    contentEl.createEl("h3", { text: "Layers" });
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

    // Prevent auto-focus on the first input
    activeWindow.setTimeout(() => {
      (activeWindow.document.activeElement as HTMLElement)?.blur();
    }, 0);
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
    container.addClass("ttrpgmap-template-list-container");

    // Header row with "Add Layer" button
    const header = container.createDiv({ cls: "setting-item setting-item-heading" });
    const headerInfo = header.createDiv({ cls: "setting-item-info" });
    headerInfo.createDiv({ cls: "setting-item-name", text: "Marker Layers" });
    headerInfo.createDiv({ cls: "setting-item-description", text: "Control marker visibility based on zoom level" });
    const headerControl = header.createDiv({ cls: "setting-item-control" });
    const addBtn = headerControl.createEl("button", { text: "Add Layer" });
    addBtn.addEventListener("click", () => {
      const existingNames = new Set(this.state.layers.map((l) => l.name.toLowerCase()));
      let n = 1;
      while (existingNames.has(`layer ${n}`.toLowerCase())) n++;
      const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newLayer: MarkerLayer = {
        id,
        name: `Layer ${n}`,
        zoomMin: this.config.zoomMin,
        zoomMax: this.config.zoomMax,
      };
      this.state.layers.push(newLayer);
      this.onLayerChange(this.state);
      this.renderLayers(container);
      new LayerEditModal(this.app, newLayer, (saved) => {
        Object.assign(newLayer, saved);
        this.onLayerChange(this.state);
        this.renderLayers(container);
      }).open();
    });

    const layerList = container.createDiv({ cls: "ttrpgmap-layer-list" });

    for (const layer of this.state.layers) {
      const isDefault = layer.id === DEFAULT_LAYER_ID;

      const row = layerList.createDiv({ cls: "setting-item" });
      const info = row.createDiv({ cls: "setting-item-info" });
      const nameRow = info.createDiv({ cls: "setting-item-name ttrpgmap-layer-name-row" });

      const iconEl = nameRow.createDiv({ cls: "ttrpgmap-layer-icon" });
      setIcon(iconEl, "layers");

      nameRow.createSpan({ text: layer.name });

      info.createDiv({
        cls: "setting-item-description",
        text: this.formatZoomRange(layer),
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
        const resetBtn = control.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Reset to defaults" } });
        setIcon(resetBtn, "rotate-ccw");
        resetBtn.addEventListener("click", () => {
          layer.name = DEFAULT_LAYER.name;
          layer.zoomMin = DEFAULT_LAYER.zoomMin;
          layer.zoomMax = DEFAULT_LAYER.zoomMax;
          this.onLayerChange(this.state);
          this.renderLayers(container);
        });
      } else {
        const deleteBtn = control.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Delete layer" } });
        setIcon(deleteBtn, "trash-2");
        deleteBtn.addEventListener("click", () => {
          const count = this.state.markers.filter((m) => m.layerId === layer.id).length;
          if (count > 0) {
            const msg = `${count} marker${count === 1 ? "" : "s"} will be moved to the Default Layer.`;
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
