import { App, Modal, Setting, Notice } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { DEFAULT_MAP_CONFIG } from "../types";
import { ImageSuggest } from "../suggests/ImageSuggest";

export class ConfigureMapModal extends Modal {
  private plugin: TTRPGMapsPlugin;
  private onSave: (config: { image: string; height: string; width: string; zoomMin: number; zoomMax: number; zoomStep: number }) => void;
  private imagePath = "";
  private height = "";
  private width = "";
  private zoomMin = DEFAULT_MAP_CONFIG.zoomMin;
  private zoomMax = DEFAULT_MAP_CONFIG.zoomMax;
  private zoomStep = DEFAULT_MAP_CONFIG.zoomStep;

  constructor(
    app: App,
    plugin: TTRPGMapsPlugin,
    onSave: (config: { image: string; height: string; width: string; zoomMin: number; zoomMax: number; zoomStep: number }) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("ttrpgmap-modal-container", "mod-settings");
    contentEl.addClass("ttrpgmap-modal");

    new Setting(contentEl).setName("Configure map").setHeading();

    new Setting(contentEl)
      .setName("Image")
      .setDesc("Search for a map image in your vault (required)")
      .addText((text) => {
        text
          .setPlaceholder("Search for an image...")
          .setValue(this.imagePath)
          .onChange((value) => (this.imagePath = value));
        new ImageSuggest(this.app, text.inputEl, (value) => {
          this.imagePath = value;
        });
      });

    new Setting(contentEl)
      .setName("Height")
      .setDesc("Display height (blank = auto from width/image)")
      .addText((text) =>
        text.setPlaceholder("500 or 80%").onChange((value) => (this.height = value))
      );

    new Setting(contentEl)
      .setName("Width")
      .setDesc("Display width (blank = auto from height/image)")
      .addText((text) =>
        text.setPlaceholder("800 or 100%").onChange((value) => (this.width = value))
      );

    new Setting(contentEl).setName("Zoom").setHeading();

    new Setting(contentEl)
      .setName("Minimum zoom %")
      .addText((text) =>
        text.setValue(String(this.zoomMin)).onChange((v) => (this.zoomMin = parseInt(v, 10) || 50))
      );

    new Setting(contentEl)
      .setName("Maximum zoom %")
      .addText((text) =>
        text.setValue(String(this.zoomMax)).onChange((v) => (this.zoomMax = parseInt(v, 10) || 200))
      );

    new Setting(contentEl)
      .setName("Zoom step %")
      .addText((text) =>
        text.setValue(String(this.zoomStep)).onChange((v) => (this.zoomStep = parseInt(v, 10) || 10))
      );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Create map")
        .setCta()
        .onClick(() => {
          if (!this.imagePath) {
            new Notice("Please select an image first.");
            return;
          }
          this.onSave({
            image: this.imagePath,
            height: this.height,
            width: this.width,
            zoomMin: this.zoomMin,
            zoomMax: this.zoomMax,
            zoomStep: this.zoomStep,
          });
          this.close();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
