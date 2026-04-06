import { App, Modal, Setting, Notice } from "obsidian";

export class ScaleCalibrationModal extends Modal {
  private units = 0;
  private unitLabel = "units";
  private onSave: (units: number, unitLabel: string) => void;

  constructor(app: App, onSave: (units: number, unitLabel: string) => void) {
    super(app);
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("ttrpgmap-modal-container", "mod-settings");
    contentEl.addClass("ttrpgmap-modal");

    contentEl.createEl("h2", { text: "Set Distance Scale" });
    contentEl.createEl("p", { text: "You drew a reference line on the map. How many units does it represent?" });

    new Setting(contentEl)
      .setName("Distance")
      .setDesc("How many units does this line represent?")
      .addText((text) =>
        text
          .setPlaceholder("e.g. 100")
          .onChange((value) => (this.units = parseFloat(value) || 0))
      );

    new Setting(contentEl)
      .setName("Unit Label")
      .setDesc("e.g. feet, miles, km, meters")
      .addText((text) =>
        text
          .setPlaceholder("units")
          .setValue(this.unitLabel)
          .onChange((value) => (this.unitLabel = value || "units"))
      );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Save Scale")
        .setCta()
        .onClick(() => {
          if (this.units <= 0) {
            new Notice("Please enter a positive distance.");
            return;
          }
          this.onSave(this.units, this.unitLabel);
          this.close();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
