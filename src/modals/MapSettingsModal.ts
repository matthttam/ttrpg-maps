import { App, Modal, Setting } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MapConfig } from "../types";
import { ImageSuggest } from "../suggests/ImageSuggest";

export class MapSettingsModal extends Modal {
  private plugin: TTRPGMapsPlugin;
  private config: MapConfig;
  private onSave: (config: MapConfig) => void;

  constructor(app: App, plugin: TTRPGMapsPlugin, config: MapConfig, onSave: (config: MapConfig) => void) {
    super(app);
    this.plugin = plugin;
    this.config = { ...config };
    this.onSave = onSave;
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

  onClose(): void {
    this.contentEl.empty();
  }
}
