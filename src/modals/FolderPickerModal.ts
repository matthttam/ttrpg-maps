import { App, Modal, Setting } from "obsidian";
import { FolderSuggest } from "../suggests/FolderSuggest";

export class FolderPickerModal extends Modal {
  private onChoose: (folderPath: string) => void;
  private selectedFolder = "/";

  constructor(app: App, onChoose: (folderPath: string) => void) {
    super(app);
    this.onChoose = onChoose;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Choose image destination" });

    new Setting(contentEl)
      .setName("Folder")
      .setDesc("Select a vault folder for the imported image")
      .addText((text) => {
        text.setPlaceholder("/ (vault root)");
        text.setValue(this.selectedFolder);
        new FolderSuggest(this.app, text.inputEl, (value) => {
          this.selectedFolder = value;
        });
        text.onChange((value) => {
          this.selectedFolder = value;
        });
      });

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Import")
        .setCta()
        .onClick(() => {
          this.onChoose(this.selectedFolder);
          this.close();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
