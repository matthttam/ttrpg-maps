import { App, Modal, Setting, Notice } from "obsidian";

export class ScaleCalibrationModal extends Modal {
  private units = 0;
  private unitLabel = "units";
  private onSave: (units: number, unitLabel: string) => void;
  private onCancel: () => void;
  private saved = false;

  constructor(app: App, onSave: (units: number, unitLabel: string) => void, onCancel: () => void) {
    super(app);
    this.onSave = onSave;
    this.onCancel = onCancel;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText("Set distance scale");

    const group = contentEl.createDiv({ cls: "setting-group" });
    const items = group.createDiv({ cls: "setting-items" });

    items.createEl("p", { text: "You drew a reference line on the map. How many units does it represent?" });

    new Setting(items)
      .setName("Distance")
      .setDesc("How many units does this line represent?")
      .addText((text) =>
        text
          .setPlaceholder("100")
          .onChange((value) => (this.units = parseFloat(value) || 0))
      );

    new Setting(items)
      .setName("Unit label")
      .setDesc("Feet, miles, km, meters")
      .addText((text) =>
        text
          .setPlaceholder("Units")
          .setValue(this.unitLabel)
          .onChange((value) => (this.unitLabel = value || "units"))
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.saved = false;
          this.close();
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText("Save scale")
          .setCta()
          .onClick(() => {
            if (this.units <= 0) {
              new Notice("Please enter a positive distance.");
              return;
            }
            this.saved = true;
            this.onSave(this.units, this.unitLabel);
            this.close();
          })
      );
  }

  onClose(): void {
    if (!this.saved) {
      this.onCancel();
    }
    this.contentEl.empty();
  }
}
