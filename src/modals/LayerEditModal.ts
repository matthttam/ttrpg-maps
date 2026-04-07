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

  private validate(): string | null {
    const { zoomMin, zoomMax } = this.layer;
    if (zoomMin != null && !Number.isInteger(zoomMin)) return "Minimum zoom must be a whole number.";
    if (zoomMax != null && !Number.isInteger(zoomMax)) return "Maximum zoom must be a whole number.";
    if (zoomMin != null && zoomMax != null) {
      if (zoomMin >= zoomMax) return "Minimum zoom must be less than maximum zoom.";
    }
    return null;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    const group = contentEl.createDiv({ cls: "setting-group" });
    new Setting(group).setName(this.isDefault ? "Edit default layer" : "Edit layer").setHeading();
    const items = group.createDiv({ cls: "setting-items" });

    const nameSetting = new Setting(items)
      .setName("Name")
      .addText((text) => {
        text
          .setValue(this.layer.name)
          .onChange((value) => {
            this.layer.name = value || "Unnamed Layer";
            errorEl.addClass("ttrpgmap-hidden");
          });
        if (this.isDefault) {
          text.setDisabled(true);
        }
      });

    if (this.isDefault) {
      nameSetting.setDesc("The default layer name cannot be changed.");
    }

    new Setting(items)
      .setName("Minimum zoom")
      .setDesc("Markers on this layer are hidden below this zoom %. Leave blank for no limit.")
      .addText((text) => {
        text
          .setPlaceholder("50")
          .setValue(this.layer.zoomMin != null ? String(this.layer.zoomMin) : "")
          .onChange((value) => {
            this.layer.zoomMin = value ? parseFloat(value) || 0 : null;
            errorEl.addClass("ttrpgmap-hidden");
          });
        text.inputEl.type = "number";
        text.inputEl.step = "1";
      });

    new Setting(items)
      .setName("Maximum zoom")
      .setDesc("Markers on this layer are hidden above this zoom %. Leave blank for no limit.")
      .addText((text) => {
        text
          .setPlaceholder("200")
          .setValue(this.layer.zoomMax != null ? String(this.layer.zoomMax) : "")
          .onChange((value) => {
            this.layer.zoomMax = value ? parseFloat(value) || 0 : null;
            errorEl.addClass("ttrpgmap-hidden");
          });
        text.inputEl.type = "number";
        text.inputEl.step = "1";
      });

    const errorEl = contentEl.createDiv({ cls: "ttrpgmap-field-error" });
    errorEl.addClass("ttrpgmap-hidden");

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            const err = this.validate();
            if (err) {
              errorEl.setText(err);
              errorEl.removeClass("ttrpgmap-hidden");
              return;
            }
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
