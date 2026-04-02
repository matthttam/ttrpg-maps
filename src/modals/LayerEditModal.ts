import { App, Modal, Setting } from "obsidian";
import { MarkerLayer, DEFAULT_LAYER_ID } from "../types";

export class LayerEditModal extends Modal {
  private layer: MarkerLayer;
  private isDefault: boolean;
  private onSave: (layer: MarkerLayer) => void;

  constructor(app: App, layer: MarkerLayer, onSave: (layer: MarkerLayer) => void) {
    super(app);
    this.layer = { ...layer };
    this.isDefault = layer.id === DEFAULT_LAYER_ID;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");

    contentEl.createEl("h2", { text: this.isDefault ? "Edit Default Layer" : "Edit Layer" });

    const nameSetting = new Setting(contentEl)
      .setName("Name")
      .addText((text) => {
        text
          .setValue(this.layer.name)
          .onChange((value) => {
            this.layer.name = value || "Unnamed Layer";
          });
        if (this.isDefault) {
          text.setDisabled(true);
        }
      });

    if (this.isDefault) {
      nameSetting.setDesc("The default layer name cannot be changed.");
    }

    new Setting(contentEl)
      .setName("Minimum Zoom")
      .setDesc("Markers on this layer are hidden below this zoom %. Leave blank for no limit.")
      .addText((text) => {
        text
          .setPlaceholder("Any")
          .setValue(this.layer.zoomMin != null ? String(this.layer.zoomMin) : "")
          .onChange((value) => {
            this.layer.zoomMin = value ? parseInt(value, 10) || 0 : null;
          });
        text.inputEl.type = "number";
      });

    new Setting(contentEl)
      .setName("Maximum Zoom")
      .setDesc("Markers on this layer are hidden above this zoom %. Leave blank for no limit.")
      .addText((text) => {
        text
          .setPlaceholder("Any")
          .setValue(this.layer.zoomMax != null ? String(this.layer.zoomMax) : "")
          .onChange((value) => {
            this.layer.zoomMax = value ? parseInt(value, 10) || 0 : null;
          });
        text.inputEl.type = "number";
      });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            this.onSave(this.layer);
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
