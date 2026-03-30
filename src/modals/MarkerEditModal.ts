import { App, Modal, Setting, setIcon } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MarkerTemplate } from "../types";
import { NoteLinkSuggest } from "../suggests/NoteLinkSuggest";
import { IconSuggest } from "../suggests/IconSuggest";

export class MarkerEditModal extends Modal {
  private plugin: TTRPGMapsPlugin;
  private marker: {
    note: string | null;
    description: string | null;
    templateName: string;
    direction: string | null;
    textPlacement: string | null;
    color: string | null;
    icon: string | null;
    iconColor: string | null;
  };
  private onSave: (marker: typeof this.marker) => void;

  constructor(
    app: App,
    plugin: TTRPGMapsPlugin,
    marker: typeof MarkerEditModal.prototype.marker,
    onSave: (marker: typeof MarkerEditModal.prototype.marker) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.marker = { ...marker };
    this.onSave = onSave;
  }

  private getTemplate(): MarkerTemplate | undefined {
    return this.plugin.settings.markerTemplates.find(
      (t) => t.name === this.marker.templateName
    );
  }

  private addResetButton(setting: Setting, field: keyof MarkerTemplate, onReset: () => void): void {
    setting.addExtraButton((btn) =>
      btn
        .setIcon("history")
        .setTooltip("Reset to template default")
        .onClick(() => {
          const template = this.getTemplate();
          if (template) {
            onReset();
            this.onOpen();
          }
        })
    );
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");

    const template = this.getTemplate();

    contentEl.createEl("h2", { text: "Edit Marker" });

    new Setting(contentEl)
      .setName("Template")
      .addDropdown((dropdown) => {
        for (const t of this.plugin.settings.markerTemplates) {
          dropdown.addOption(t.name, t.name);
        }
        dropdown.setValue(this.marker.templateName);
        dropdown.onChange((value) => {
          this.marker.templateName = value;
          const newTemplate = this.plugin.settings.markerTemplates.find(
            (t) => t.name === value
          );
          if (newTemplate) {
            this.marker.direction = newTemplate.direction;
            this.marker.textPlacement = newTemplate.textPlacement;
            this.marker.color = newTemplate.color;
            this.marker.iconColor = newTemplate.iconColor;
          }
          this.onOpen();
        });
      });

    new Setting(contentEl)
      .setName("Note")
      .setDesc("Link to a note (supports Page#Header and Page#^blockId)")
      .addText((text) => {
        text
          .setPlaceholder("Search for a note...")
          .setValue(this.marker.note ?? "")
          .onChange((value) => (this.marker.note = value || null));
        new NoteLinkSuggest(this.app, text.inputEl, (value) => {
          this.marker.note = value || null;
        });
      });

    new Setting(contentEl)
      .setName("Description")
      .setDesc("Additional text shown below the note name")
      .addText((text) =>
        text
          .setValue(this.marker.description ?? "")
          .onChange((value) => (this.marker.description = value || null))
      );

    const directionSetting = new Setting(contentEl)
      .setName("Direction")
      .setDesc("Which way the marker pin points")
      .addDropdown((dropdown) => {
        dropdown.addOption("up", "Up");
        dropdown.addOption("down", "Down");
        dropdown.addOption("left", "Left");
        dropdown.addOption("right", "Right");
        dropdown.setValue(this.marker.direction ?? "down");
        dropdown.onChange((value) => (this.marker.direction = value as any));
      });
    this.addResetButton(directionSetting, "direction", () => {
      this.marker.direction = template?.direction ?? "down";
    });

    const textPlacementSetting = new Setting(contentEl)
      .setName("Text Placement")
      .setDesc("Where the label appears relative to the icon")
      .addDropdown((dropdown) => {
        dropdown.addOption("above", "Above");
        dropdown.addOption("below", "Below");
        dropdown.addOption("left", "Left");
        dropdown.addOption("right", "Right");
        dropdown.setValue(this.marker.textPlacement ?? "above");
        dropdown.onChange((value) => (this.marker.textPlacement = value as any));
      });
    this.addResetButton(textPlacementSetting, "textPlacement", () => {
      this.marker.textPlacement = template?.textPlacement ?? "above";
    });

    const colorSetting = new Setting(contentEl)
      .setName("Color")
      .setDesc("Marker background color");
    const colorInput = colorSetting.controlEl.createEl("input", { cls: "ttrpgmap-color-picker" });
    colorInput.type = "color";
    colorInput.value = this.marker.color ?? "#ffffff";
    colorInput.addEventListener("input", (e) => {
      this.marker.color = (e.target as HTMLInputElement).value;
    });
    this.addResetButton(colorSetting, "color", () => {
      this.marker.color = template?.color ?? "#ffffff";
    });

    const iconSetting = new Setting(contentEl)
      .setName("Icon")
      .setDesc("Lucide icon name (leave blank for none)")
      .addText((text) => {
        text
          .setPlaceholder("Search for an icon...")
          .setValue(this.marker.icon ?? "")
          .onChange((value) => (this.marker.icon = value || null));
        new IconSuggest(this.app, text.inputEl, (value) => {
          this.marker.icon = value || null;
          iconPreview.empty();
          if (value) setIcon(iconPreview, value);
        });
      });
    const iconPreview = iconSetting.controlEl.createDiv({ cls: "ttrpgmap-icon-preview" });
    if (this.marker.icon) setIcon(iconPreview, this.marker.icon);
    this.addResetButton(iconSetting, "icon", () => {
      this.marker.icon = template?.icon ?? null;
    });

    const iconColorSetting = new Setting(contentEl)
      .setName("Icon Color");
    const iconColorInput = iconColorSetting.controlEl.createEl("input", { cls: "ttrpgmap-color-picker" });
    iconColorInput.type = "color";
    iconColorInput.value = this.marker.iconColor ?? "#000000";
    iconColorInput.addEventListener("input", (e) => {
      this.marker.iconColor = (e.target as HTMLInputElement).value;
    });
    this.addResetButton(iconColorSetting, "iconColor", () => {
      this.marker.iconColor = template?.iconColor ?? "#000000";
    });

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Save")
        .setCta()
        .onClick(() => {
          this.onSave(this.marker);
          this.close();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
