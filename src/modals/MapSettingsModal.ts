import { App, Modal, Setting, setIcon } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MapConfig, MapState, MarkerLayer, DEFAULT_LAYER, DEFAULT_LAYER_ID } from "../types";
import { ImageSuggest } from "../suggests/ImageSuggest";
import { LayerEditModal } from "./LayerEditModal";

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
      container.setText(`Native size: ${img.naturalWidth} × ${img.naturalHeight} px`);
    };
    img.onerror = () => {
      container.setText("Could not load image");
    };
    img.src = resourcePath;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");

    contentEl.createEl("h2", { text: "Map Settings" });

    const imageDimsEl = contentEl.createDiv({ cls: "ttrpgmap-image-dims" });

    new Setting(contentEl)
      .setName("Image")
      .setDesc("Search for a map image in your vault")
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

    contentEl.appendChild(imageDimsEl);
    this.loadImageDimensions(imageDimsEl);

    new Setting(contentEl)
      .setName("Map ID")
      .setDesc("Unique identifier. Use different IDs to have separate markers on the same image.")
      .addText((text) =>
        text
          .setValue(this.config.id)
          .onChange((value) => (this.config.id = value))
      );

    new Setting(contentEl)
      .setName("Height")
      .setDesc("Display height (blank = auto from width/image)")
      .addText((text) =>
        text
          .setPlaceholder("e.g. 500 or 80%")
          .setValue(this.config.height ?? "")
          .onChange((value) => (this.config.height = value || null))
      );

    new Setting(contentEl)
      .setName("Width")
      .setDesc("Display width (blank = auto from height/image)")
      .addText((text) =>
        text
          .setPlaceholder("e.g. 800 or 100%")
          .setValue(this.config.width ?? "")
          .onChange((value) => (this.config.width = value || null))
      );

    contentEl.createEl("h3", { text: "Zoom" });

    new Setting(contentEl)
      .setName("Minimum Zoom")
      .setDesc("Minimum zoom level (%)")
      .addText((text) =>
        text
          .setValue(String(this.config.zoomMin))
          .onChange((value) => (this.config.zoomMin = parseInt(value, 10) || 50))
      );

    new Setting(contentEl)
      .setName("Maximum Zoom")
      .setDesc("Maximum zoom level (%)")
      .addText((text) =>
        text
          .setValue(String(this.config.zoomMax))
          .onChange((value) => (this.config.zoomMax = parseInt(value, 10) || 200))
      );

    new Setting(contentEl)
      .setName("Zoom Step")
      .setDesc("Amount to change per zoom increment (%)")
      .addText((text) =>
        text
          .setValue(String(this.config.zoomStep))
          .onChange((value) => (this.config.zoomStep = parseInt(value, 10) || 10))
      );

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
