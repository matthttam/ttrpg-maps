import { App, Modal, Setting, setIcon } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MapConfig, MapState, MarkerLayer, DEFAULT_LAYER, DEFAULT_LAYER_ID, DEFAULT_MARKER_SCALE, DEFAULT_MARKER_TEXT_SCALE } from "../types";
import { ImageSuggest } from "../suggests/ImageSuggest";
import { LayerEditModal } from "./LayerEditModal";
import { buildScaleSlider } from "./sharedFields";
import { exportMap } from "../utils/mapExport";

export type IdAction = "migrate" | "delete" | "orphan" | null;

export class MapSettingsModal extends Modal {
  private plugin: TTRPGMapsPlugin;
  private config: MapConfig;
  private state: MapState;
  private originalConfig: string;
  private originalState: string;
  private originalId: string;
  private pendingIdAction: IdAction = null;
  private _idTextEl: HTMLInputElement | null = null;
  private onSave: (config: MapConfig, state: MapState, oldId: string | null, idAction: IdAction) => void;
  private saved = false;

  constructor(
    app: App,
    plugin: TTRPGMapsPlugin,
    config: MapConfig,
    state: MapState,
    onSave: (config: MapConfig, state: MapState, oldId: string | null, idAction: IdAction) => void,
  ) {
    super(app);
    this.plugin = plugin;
    this.config = JSON.parse(JSON.stringify(config));
    this.state = JSON.parse(JSON.stringify(state));
    this.originalConfig = JSON.stringify(config);
    this.originalState = JSON.stringify(state);
    this.originalId = config.id;
    this.onSave = onSave;
  }

  private isDirty(): boolean {
    return JSON.stringify(this.config) !== this.originalConfig
      || JSON.stringify(this.state) !== this.originalState;
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

  private doSave(): void {
    this.saved = true;
    const oldId = this.config.id !== this.originalId ? this.originalId : null;
    this.state.mapId = this.config.id;
    this.onSave(this.config, this.state, oldId, this.pendingIdAction);
    this.close();
  }

  private doCancel(): void {
    if (!this.isDirty()) {
      this.saved = true;
      this.close();
      return;
    }
    this.promptUnsaved();
  }

  private promptUnsaved(): void {
    const confirmModal = new Modal(this.app);
    confirmModal.titleEl.setText("Unsaved changes");
    confirmModal.contentEl.createEl("p", { text: "You have unsaved changes. What would you like to do?" });
    new Setting(confirmModal.contentEl)
      .addButton((btn) => btn.setButtonText("Cancel").onClick(() => {
        confirmModal.close();
      }))
      .addButton((btn) => btn.setButtonText("Discard").setWarning().onClick(() => {
        confirmModal.close();
        this.saved = true;
        this.close();
      }))
      .addButton((btn) => btn.setButtonText("Save").setCta().onClick(() => {
        confirmModal.close();
        this.doSave();
      }));
    confirmModal.open();
  }

  private openChangeIdModal(): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText("Change map ID");
    const { contentEl } = modal;

    let newId = this.config.id;
    new Setting(contentEl)
      .setName("New ID")
      .addText((text) => {
        text.setValue(this.config.id).onChange((value) => { newId = value; });
        activeWindow.setTimeout(() => { text.inputEl.focus(); text.inputEl.select(); }, 0);
      });

    contentEl.createEl("p", {
      text: "Choose how to handle the existing data:",
      cls: "ttrpgmap-muted",
    });

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText("Migrate data").setCta().setTooltip("Move all markers, layers, and settings to the new ID").onClick(() => {
        if (!newId.trim()) return;
        this.config.id = newId.trim();
        this.pendingIdAction = "migrate";
        if (this._idTextEl) this._idTextEl.value = this.config.id;
        modal.close();
      }))
      .addButton((btn) => btn.setButtonText("Delete data").setWarning().setTooltip("Permanently delete the old data and start fresh").onClick(() => {
        if (!newId.trim()) return;
        this.config.id = newId.trim();
        this.pendingIdAction = "delete";
        if (this._idTextEl) this._idTextEl.value = this.config.id;
        modal.close();
      }))
      .addButton((btn) => btn.setButtonText("Orphan data").setTooltip("Leave old data behind (delete later in manage map data)").onClick(() => {
        if (!newId.trim()) return;
        this.config.id = newId.trim();
        this.pendingIdAction = "orphan";
        if (this._idTextEl) this._idTextEl.value = this.config.id;
        modal.close();
      }))
      .addButton((btn) => btn.setButtonText("Cancel").onClick(() => modal.close()));

    modal.open();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("ttrpgmap-modal--wide");
    this.titleEl.setText("Edit map");

    const mapGroup = contentEl.createDiv({ cls: "setting-group" });
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

    const idSetting = new Setting(mapItems)
      .setName("Map ID")
      .setDesc("Used to store map data. Set to a unique value to use the same image on multiple maps.");
    idSetting.addText((text) => {
      text.setValue(this.config.id).setDisabled(true);
      this._idTextEl = text.inputEl;
    });
    idSetting.addExtraButton((btn) => {
      btn.setIcon("pencil").setTooltip("Change map ID").onClick(() => {
        this.openChangeIdModal();
      });
    });

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
        scaleSetting.setDesc(`Map override: ${Math.round(value * 100)}% (global default: ${Math.round(globalScale * 100)}%)`);
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
          });
      });

    // ── Marker Layers ──
    const layerGroup = contentEl.createDiv({ cls: "setting-group" });
    new Setting(layerGroup).setName("Layers").setHeading();
    const layersContainer = layerGroup.createDiv({ cls: "setting-items" });
    this.renderLayers(layersContainer);

    // ── Footer: Export + Save + Cancel ──
    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText("Export map");
        btn.onClick(() => { void exportMap(this.app, this.plugin, this.config, this.state); });
      })
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.doCancel())
      )
      .addButton((btn) =>
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => this.doSave())
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
          this.renderLayers(container);
          new LayerEditModal(this.app, {
            layer: newLayer,
            mapZoomMin: this.config.zoomMin,
            mapZoomMax: this.config.zoomMax,
            onSave: (saved) => {
              Object.assign(newLayer, saved);
              this.renderLayers(container);
            },
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
          new LayerEditModal(this.app, {
            layer,
            mapZoomMin: this.config.zoomMin,
            mapZoomMax: this.config.zoomMax,
            onSave: (saved) => {
              Object.assign(layer, saved);
              this.renderLayers(container);
            },
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
              this.renderLayers(container);
            })();
          });
        });
      }
    }
  }

  onClose(): void {
    if (!this.saved && this.isDirty()) {
      // Reopen immediately then show prompt on top
      activeWindow.setTimeout(() => {
        this.open();
        this.promptUnsaved();
      }, 0);
      return;
    }
    this.contentEl.empty();
  }
}
