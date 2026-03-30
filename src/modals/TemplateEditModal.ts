import { App, Modal, Setting, Notice } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MarkerTemplate } from "../types";
import { IconSuggest } from "../suggests/IconSuggest";
import { setFAIcon } from "../utils/faIcon";
import { createPinElement } from "../utils/markerPin";

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

  private renderPreview(container: HTMLElement): void {
    container.empty();
    createPinElement(container, {
      pinClass: "ttrpgmap-edit-preview-pin",
      svgClass: "ttrpgmap-pin-svg",
      color: this.template.color,
      icon: this.template.icon,
      iconColor: this.template.iconColor,
      iconClass: "ttrpgmap-edit-preview-icon",
      useBaseMarker: this.template.useBaseMarker,
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");

    const usePin = this.template.useBaseMarker;

    contentEl.createEl("h2", { text: "Edit Template" });

    // ── Preview ──
    const previewContainer = contentEl.createDiv({ cls: "ttrpgmap-edit-preview" });
    this.renderPreview(previewContainer);

    // ── Name ──
    new Setting(contentEl)
      .setName("Name")
      .addText((text) =>
        text.setValue(this.template.name).onChange((value) => {
          this.template.name = value;
        })
      );

    // ── Icon ──
    const iconSetting = new Setting(contentEl)
      .setName("Icon")
      .setDesc("Font Awesome icon (leave blank for none)")
      .addText((text) => {
        text
          .setPlaceholder("Search for an icon...")
          .setValue(this.template.icon ?? "")
          .onChange((value) => {
            this.template.icon = value || null;
            this.renderPreview(previewContainer);
          });
        new IconSuggest(this.app, text.inputEl, (value) => {
          this.template.icon = value || null;
          tplIconPreview.empty();
          if (value) setFAIcon(tplIconPreview, value);
          this.renderPreview(previewContainer);
        });
      });
    const tplIconPreview = iconSetting.controlEl.createDiv({ cls: "ttrpgmap-icon-preview" });
    if (this.template.icon) setFAIcon(tplIconPreview, this.template.icon);

    // ── Icon Color ──
    const iconColorSetting = new Setting(contentEl).setName("Icon Color");
    const iconColorInput = iconColorSetting.controlEl.createEl("input", { cls: "ttrpgmap-color-picker" });
    iconColorInput.type = "color";
    iconColorInput.value = this.template.iconColor;
    iconColorInput.addEventListener("input", (e) => {
      this.template.iconColor = (e.target as HTMLInputElement).value;
      this.renderPreview(previewContainer);
    });

    // ── Text Placement ──
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

    // ── Use Pin Shape + Pin-specific settings ──
    new Setting(contentEl)
      .setName("Use Pin Shape")
      .setDesc("Display the icon inside a map pin. When off, the icon itself is the marker.")
      .addToggle((toggle) => {
        toggle
          .setValue(usePin)
          .onChange((value) => {
            this.template.useBaseMarker = value;
            this.onOpen(); // Re-render to toggle pin settings
          });
      });

    // Pin Direction
    const dirSetting = new Setting(contentEl)
      .setName("Pin Direction")
      .addDropdown((dropdown) => {
        dropdown.addOption("up", "Up");
        dropdown.addOption("down", "Down");
        dropdown.addOption("left", "Left");
        dropdown.addOption("right", "Right");
        dropdown.setValue(this.template.direction);
        dropdown.onChange((value) => {
          this.template.direction = value as MarkerTemplate["direction"];
        });
        if (!usePin) dropdown.setDisabled(true);
      });
    if (!usePin) dirSetting.setClass("ttrpgmap-setting-disabled");

    // Pin Color
    const pinColorSetting = new Setting(contentEl).setName("Pin Color");
    const pinColorInput = pinColorSetting.controlEl.createEl("input", { cls: "ttrpgmap-color-picker" });
    pinColorInput.type = "color";
    pinColorInput.value = this.template.color;
    pinColorInput.addEventListener("input", (e) => {
      this.template.color = (e.target as HTMLInputElement).value;
      this.renderPreview(previewContainer);
    });
    if (!usePin) {
      pinColorInput.disabled = true;
      pinColorSetting.setClass("ttrpgmap-setting-disabled");
    }

    // ── Actions ──
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

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Save & Apply to Markers")
        .setWarning()
        .onClick(() => {
          new ConfirmApplyModal(this.app, this.template.name, async () => {
            // Save template first
            this.plugin.dataManager.saveSettings(this.plugin.settings);

            // Update all markers using this template across all maps
            const allStates = await this.plugin.dataManager.loadAllMapStates();
            let count = 0;
            for (const state of allStates) {
              let changed = false;
              for (const marker of state.markers) {
                if (marker.templateName !== this.template.name) continue;
                marker.direction = this.template.direction;
                marker.textPlacement = this.template.textPlacement;
                marker.color = this.template.color;
                marker.icon = this.template.icon;
                marker.iconColor = this.template.iconColor;
                marker.useBaseMarker = this.template.useBaseMarker;
                changed = true;
                count++;
              }
              if (changed) {
                this.plugin.dataManager.saveMapState(state.mapId, state);
              }
            }

            new Notice(`Updated ${count} marker${count !== 1 ? "s" : ""} using "${this.template.name}".`);
            this.plugin.triggerMapRefresh();
            this.onSaved();
            this.close();
          }).open();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Confirmation modal before applying template to all markers */
class ConfirmApplyModal extends Modal {
  private templateName: string;
  private onConfirm: () => void;

  constructor(app: App, templateName: string, onConfirm: () => void) {
    super(app);
    this.templateName = templateName;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");

    contentEl.createEl("h2", { text: "Confirm Apply" });
    contentEl.createEl("p", {
      text: `This will override any custom settings on all markers using the "${this.templateName}" template. Are you sure?`,
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Yes, Apply").setWarning().onClick(() => {
          this.onConfirm();
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
