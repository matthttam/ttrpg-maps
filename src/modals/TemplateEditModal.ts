import { App, Modal, Setting, setIcon } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MarkerTemplate } from "../types";
import { IconSuggest } from "../suggests/IconSuggest";

export class TemplateEditModal extends Modal {
  private plugin: TTRPGMapsPlugin;
  private template: MarkerTemplate;
  private onSaved: () => void;

  constructor(app: App, plugin: TTRPGMapsPlugin, template: MarkerTemplate, onSaved: () => void) {
    super(app);
    this.plugin = plugin;
    this.template = template;
    this.onSaved = onSaved;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");

    contentEl.createEl("h2", { text: "Edit Template" });

    new Setting(contentEl)
      .setName("Name")
      .addText((text) =>
        text.setValue(this.template.name).onChange((value) => {
          this.template.name = value;
        })
      );

    new Setting(contentEl)
      .setName("Direction")
      .addDropdown((dropdown) => {
        dropdown.addOption("up", "Up");
        dropdown.addOption("down", "Down");
        dropdown.addOption("left", "Left");
        dropdown.addOption("right", "Right");
        dropdown.setValue(this.template.direction);
        dropdown.onChange((value) => {
          this.template.direction = value as MarkerTemplate["direction"];
        });
      });

    new Setting(contentEl)
      .setName("Text Placement")
      .addDropdown((dropdown) => {
        dropdown.addOption("above", "Above");
        dropdown.addOption("below", "Below");
        dropdown.addOption("left", "Left");
        dropdown.addOption("right", "Right");
        dropdown.setValue(this.template.textPlacement);
        dropdown.onChange((value) => {
          this.template.textPlacement = value as MarkerTemplate["textPlacement"];
        });
      });

    const colorSetting = new Setting(contentEl).setName("Color");
    const colorInput = colorSetting.controlEl.createEl("input", { cls: "ttrpgmap-color-picker" });
    colorInput.type = "color";
    colorInput.value = this.template.color;
    colorInput.addEventListener("input", (e) => {
      this.template.color = (e.target as HTMLInputElement).value;
    });

    const iconSetting = new Setting(contentEl)
      .setName("Icon")
      .setDesc("Lucide icon name (leave blank for none)")
      .addText((text) => {
        text
          .setPlaceholder("Search for an icon...")
          .setValue(this.template.icon ?? "")
          .onChange((value) => (this.template.icon = value || null));
        new IconSuggest(this.app, text.inputEl, (value) => {
          this.template.icon = value || null;
          tplIconPreview.empty();
          if (value) setIcon(tplIconPreview, value);
        });
      });
    const tplIconPreview = iconSetting.controlEl.createDiv({ cls: "ttrpgmap-icon-preview" });
    if (this.template.icon) setIcon(tplIconPreview, this.template.icon);

    const iconColorSetting = new Setting(contentEl).setName("Icon Color");
    const iconColorInput = iconColorSetting.controlEl.createEl("input", { cls: "ttrpgmap-color-picker" });
    iconColorInput.type = "color";
    iconColorInput.value = this.template.iconColor;
    iconColorInput.addEventListener("input", (e) => {
      this.template.iconColor = (e.target as HTMLInputElement).value;
    });

    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText("Apply to All Markers").setWarning().onClick(() => {
        // TODO: Prompt confirmation, then update all markers using this template
      })
    );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Save")
        .setCta()
        .onClick(() => {
          this.plugin.dataManager.saveSettings(this.plugin.settings);
          this.onSaved();
          this.close();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
