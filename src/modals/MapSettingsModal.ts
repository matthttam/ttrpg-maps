import { App, Modal, Setting, setIcon } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MapConfig, MapState, MarkerLayer, DEFAULT_LAYER, DEFAULT_LAYER_ID, DEFAULT_MARKER_SCALE, DEFAULT_MARKER_TEXT_SCALE } from "../types";
import { ImageSuggest } from "../suggests/ImageSuggest";
import { LayerEditModal } from "./LayerEditModal";
import { buildScaleSlider } from "./sharedFields";
import { exportMap } from "../utils/mapExport";

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

  private loadImageDimensions(descEl: HTMLElement): void {
    const file = this.app.vault.getFileByPath(this.config.image);
    if (!file) {
      descEl.setText("Image not found");
      return;
    }
    const resourcePath = this.app.vault.getResourcePath(file);
    const img = new Image();
    img.onload = () => {
      descEl.setText(`Native size: ${img.naturalWidth} \u00d7 ${img.naturalHeight} px`);
    };
    img.onerror = () => {
      descEl.setText("Could not load image");
    };
    img.src = resourcePath;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("ttrpgmap-modal-container");

    const mapGroup = contentEl.createDiv({ cls: "setting-group" });
    new Setting(mapGroup).setName("Map settings").setHeading();
    const mapItems = mapGroup.createDiv({ cls: "setting-items" });

    // ── Image ──
    const imageSetting = new Setting(mapItems)
      .setName("Image")
      .setDesc("Search for a map image in your vault")
      .addText((text) => {
        text
          .setPlaceholder("Search for an image...")
          .setValue(this.config.image)
          .onChange((value) => {
            this.config.image = value;
            this.loadImageDimensions(imageSetting.descEl);
          });
        new ImageSuggest(this.app, text.inputEl, (value) => {
          this.config.image = value;
          this.loadImageDimensions(imageSetting.descEl);
        });
      });
    this.loadImageDimensions(imageSetting.descEl);

    new Setting(mapItems)
      .setName("Map ID")
      .setDesc("Unique identifier. Use different IDs to have separate markers on the same image.")
      .addText((text) =>
        text
          .setValue(this.config.id)
          .onChange((value) => (this.config.id = value))
      );

    // ── Map Size ──
    const sizeSetting = new Setting(mapItems)
      .setName("Map size")
      .setDesc("Display dimensions (blank = auto from image aspect ratio)");
    const sizeControl = sizeSetting.controlEl;
    sizeControl.addClass("ttrpgmap-size-control");
    sizeControl.createSpan({ text: "Height:", cls: "ttrpgmap-size-label" });
    const heightInput = sizeControl.createEl("input", {
      type: "text",
      cls: "ttrpgmap-size-input",
      value: this.config.height ?? "",
      attr: { placeholder: "500" },
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
      attr: { placeholder: "800" },
    });
    widthInput.addEventListener("input", () => {
      this.config.width = widthInput.value || null;
    });

    // ── Zoom ──
    const zoomSetting = new Setting(mapItems)
      .setName("Zoom range")
      .setDesc("Zoom range (%) and step size per scroll increment");
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

    // ── Navigation ──
    const globalNewTab = this.plugin.settings.openLinksInNewTab ?? true;
    const globalNewTabLabel = globalNewTab ? "New tab" : "Current tab";
    new Setting(mapItems)
      .setName("Open links in")
      .setDesc(`Inherit uses the global default (currently ${globalNewTabLabel})`)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("inherit", "Inherit")
          .addOption("new", "New tab")
          .addOption("current", "Current tab")
          .setValue(this.state.openLinksInNewTab == null ? "inherit" : this.state.openLinksInNewTab ? "new" : "current")
          .onChange((value) => {
            if (value === "inherit") this.state.openLinksInNewTab = undefined;
            else this.state.openLinksInNewTab = value === "new";
            this.onLayerChange(this.state);
          });
      });

    const globalHover = this.plugin.settings.showHoverPreview ?? false;
    const globalHoverLabel = globalHover ? "On" : "Off";
    new Setting(mapItems)
      .setName("Hover preview")
      .setDesc(`Inherit uses the global default (currently ${globalHoverLabel})`)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("inherit", "Inherit")
          .addOption("on", "On")
          .addOption("off", "Off")
          .setValue(this.state.showHoverPreview == null ? "inherit" : this.state.showHoverPreview ? "on" : "off")
          .onChange((value) => {
            if (value === "inherit") this.state.showHoverPreview = undefined;
            else this.state.showHoverPreview = value === "on";
            this.onLayerChange(this.state);
          });
      });

    // ── Marker Scale ──
    const markerGroup = contentEl.createDiv({ cls: "setting-group" });
    new Setting(markerGroup).setName("Markers").setHeading();
    const markerItems = markerGroup.createDiv({ cls: "setting-items" });

    const globalScale = this.plugin.settings.defaultMarkerScale ?? DEFAULT_MARKER_SCALE;
    const hasOverride = this.state.markerScale != null;
    const effectiveScale = this.state.markerScale ?? globalScale;

    const scaleSetting = new Setting(markerItems)
      .setName("Marker size");

    const scaleControls = buildScaleSlider({
      setting: scaleSetting,
      value: effectiveScale,
      onChange: (value) => {
        this.state.markerScale = value;
        const desc = `Map override: ${Math.round(value * 100)}% (global default: ${Math.round(globalScale * 100)}%)`;
        scaleSetting.setDesc(desc);
        this.onLayerChange(this.state);
      },
      disabled: !hasOverride,
    });

    scaleSetting.addToggle((toggle) => {
      toggle
        .setValue(hasOverride)
        .onChange((enabled) => {
          if (enabled) {
            scaleControls.setDisabled(false);
            scaleControls.setValue(globalScale);
            this.state.markerScale = globalScale;
            scaleSetting.setDesc(`Map override: ${Math.round(globalScale * 100)}% (global default: ${Math.round(globalScale * 100)}%)`);
          } else {
            scaleControls.setDisabled(true);
            scaleControls.setValue(globalScale);
            this.state.markerScale = undefined;
            scaleSetting.setDesc(`Using global default: ${Math.round(globalScale * 100)}%`);
          }
          this.onLayerChange(this.state);
        });
    });

    scaleSetting.setDesc(hasOverride
      ? `Map override: ${Math.round(effectiveScale * 100)}% (global default: ${Math.round(globalScale * 100)}%)`
      : `Using global default: ${Math.round(globalScale * 100)}%`);

    // Scale to Zoom
    const globalScaleToZoom = this.plugin.settings.defaultScaleMarkersToZoom ?? true;
    const globalZoomLabel = globalScaleToZoom ? "Screen-constant" : "Fixed to map";

    new Setting(markerItems)
      .setName("Scale markers to zoom")
      .setDesc(`Inherit uses the global default (currently ${globalZoomLabel})`)
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

    // ── Text Scale ──
    const textGroup = contentEl.createDiv({ cls: "setting-group" });
    new Setting(textGroup).setName("Text").setHeading();
    const textItems = textGroup.createDiv({ cls: "setting-items" });

    const globalTextScale = this.plugin.settings.defaultMarkerTextScale ?? DEFAULT_MARKER_TEXT_SCALE;
    const hasTextOverride = this.state.markerTextScale != null;
    const effectiveTextScale = this.state.markerTextScale ?? globalTextScale;

    const textScaleSetting = new Setting(textItems)
      .setName("Text size");

    const textScaleControls = buildScaleSlider({
      setting: textScaleSetting,
      value: effectiveTextScale,
      onChange: (value) => {
        this.state.markerTextScale = value;
        textScaleSetting.setDesc(`Map override: ${Math.round(value * 100)}% (global default: ${Math.round(globalTextScale * 100)}%)`);
        this.onLayerChange(this.state);
      },
      disabled: !hasTextOverride,
    });

    textScaleSetting.addToggle((toggle) => {
      toggle
        .setValue(hasTextOverride)
        .onChange((enabled) => {
          if (enabled) {
            textScaleControls.setDisabled(false);
            textScaleControls.setValue(globalTextScale);
            this.state.markerTextScale = globalTextScale;
            textScaleSetting.setDesc(`Map override: ${Math.round(globalTextScale * 100)}% (global default: ${Math.round(globalTextScale * 100)}%)`);
          } else {
            textScaleControls.setDisabled(true);
            textScaleControls.setValue(globalTextScale);
            this.state.markerTextScale = undefined;
            textScaleSetting.setDesc(`Using global default: ${Math.round(globalTextScale * 100)}%`);
          }
          this.onLayerChange(this.state);
        });
    });

    textScaleSetting.setDesc(hasTextOverride
      ? `Map override: ${Math.round(effectiveTextScale * 100)}% (global default: ${Math.round(globalTextScale * 100)}%)`
      : `Using global default: ${Math.round(globalTextScale * 100)}%`);

    // Scale Text to Zoom
    const globalTextScaleToZoom = this.plugin.settings.defaultScaleMarkerTextToZoom ?? true;
    const globalTextZoomLabel = globalTextScaleToZoom ? "Screen-constant" : "Fixed to map";

    new Setting(textItems)
      .setName("Scale text to zoom")
      .setDesc(`Inherit uses the global default (currently ${globalTextZoomLabel})`)
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

    // ── Marker Layers ──
    const layerGroup = contentEl.createDiv({ cls: "setting-group" });
    new Setting(layerGroup).setName("Layers").setHeading();
    const layersContainer = layerGroup.createDiv({ cls: "setting-items" });
    this.renderLayers(layersContainer);

    // ── Footer: Export + Save ──
    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText("Export map");
        btn.onClick(() => { void exportMap(this.app, this.plugin, this.config, this.state); });
      })
      .addButton((btn) =>
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

    // Header row with "Add Layer" button
    new Setting(container)
      .setName("Marker layers")
      .setDesc("Control marker visibility based on zoom level")
      .setHeading()
      .addButton((btn) => {
        btn.setButtonText("Add layer");
        btn.onClick(() => {
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
      });

    const layerList = container.createDiv({ cls: "ttrpgmap-layer-list" });

    for (const layer of this.state.layers) {
      const isDefault = layer.id === DEFAULT_LAYER_ID;

      const row = new Setting(layerList)
        .setName(layer.name)
        .setDesc(this.formatZoomRange(layer));

      // Edit button
      row.addExtraButton((btn) => {
        btn.setIcon("pencil");
        btn.setTooltip("Edit layer");
        btn.onClick(() => {
          new LayerEditModal(this.app, layer, (saved) => {
            Object.assign(layer, saved);
            this.onLayerChange(this.state);
            this.renderLayers(container);
          }).open();
        });
      });

      if (isDefault) {
        row.addExtraButton((btn) => {
          btn.setIcon("rotate-ccw");
          btn.setTooltip("Reset to defaults");
          btn.onClick(() => {
            layer.name = DEFAULT_LAYER.name;
            layer.zoomMin = DEFAULT_LAYER.zoomMin;
            layer.zoomMax = DEFAULT_LAYER.zoomMax;
            this.onLayerChange(this.state);
            this.renderLayers(container);
          });
        });
      } else {
        row.addExtraButton((btn) => {
          btn.setIcon("trash-2");
          btn.setTooltip("Delete layer");
          btn.onClick(() => {
            void (async () => {
              const count = this.state.markers.filter((m) => m.layerId === layer.id).length;
              if (count > 0) {
                const msg = `${count} marker${count === 1 ? "" : "s"} will be moved to the Default Layer.`;
                const confirmed = await new Promise<boolean>((resolve) => {
                  const confirmModal = new Modal(this.app);
                  confirmModal.titleEl.setText("Confirm");
                  confirmModal.contentEl.createEl("p", { text: msg });
                  new Setting(confirmModal.contentEl)
                    .addButton((b) => b.setButtonText("Cancel").onClick(() => { resolve(false); confirmModal.close(); }))
                    .addButton((b) => b.setButtonText("Confirm").setWarning().onClick(() => { resolve(true); confirmModal.close(); }));
                  confirmModal.open();
                });
                if (!confirmed) return;
              }
              for (const m of this.state.markers) {
                if (m.layerId === layer.id) m.layerId = null;
              }
              this.state.layers = this.state.layers.filter((l) => l.id !== layer.id);
              this.onLayerChange(this.state);
              this.renderLayers(container);
            })();
          });
        });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
