import { App, Modal, Setting } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MarkerTemplate } from "../types";
import { NoteLinkSuggest } from "../suggests/NoteLinkSuggest";
import { IconSuggest } from "../suggests/IconSuggest";
import { setFAIcon } from "../utils/faIcon";
import { createPinElement } from "../utils/markerPin";

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
    useBaseMarker: boolean | null;
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
          if (this.getTemplate()) {
            onReset();
            this.onOpen();
          }
        })
    );
  }

  private renderPreview(container: HTMLElement): void {
    container.empty();
    const usePin = this.marker.useBaseMarker ?? true;
    const direction = this.marker.direction ?? "down";
    const textPlacement = this.marker.textPlacement ?? "above";

    const wrapper = container.createDiv({ cls: "ttrpgmap-edit-preview-wrapper" });
    wrapper.dataset.direction = direction;
    wrapper.dataset.textPlacement = textPlacement;

    createPinElement(wrapper, {
      pinClass: "ttrpgmap-edit-preview-pin",
      svgClass: "ttrpgmap-pin-svg",
      color: this.marker.color ?? "#ffffff",
      icon: this.marker.icon,
      iconColor: this.marker.iconColor ?? "#000000",
      iconClass: "ttrpgmap-edit-preview-icon",
      useBaseMarker: usePin,
    });

    // Label preview
    const noteName = this.marker.note;
    const desc = this.marker.description;
    if (noteName || desc) {
      const label = wrapper.createDiv({ cls: "ttrpgmap-edit-preview-label" });
      if (noteName) label.createSpan({ cls: "ttrpgmap-marker-title", text: noteName.split("/").pop() ?? noteName });
      if (desc) label.createSpan({ cls: "ttrpgmap-marker-desc", text: desc });
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");

    const template = this.getTemplate();
    const usePin = this.marker.useBaseMarker ?? true;

    contentEl.createEl("h2", { text: "Edit Marker" });

    // ── Preview ──
    const previewContainer = contentEl.createDiv({ cls: "ttrpgmap-edit-preview" });
    this.renderPreview(previewContainer);

    // ── Template ──
    new Setting(contentEl)
      .setName("Template")
      .addDropdown((dropdown) => {
        for (const t of this.plugin.settings.markerTemplates) {
          dropdown.addOption(t.name, t.name);
        }
        dropdown.setValue(this.marker.templateName);
        dropdown.onChange((value) => {
          this.marker.templateName = value;
          const newTemplate = this.plugin.settings.markerTemplates.find((t) => t.name === value);
          if (newTemplate) {
            this.marker.direction = newTemplate.direction;
            this.marker.textPlacement = newTemplate.textPlacement;
            this.marker.color = newTemplate.color;
            this.marker.iconColor = newTemplate.iconColor;
            this.marker.useBaseMarker = newTemplate.useBaseMarker;
          }
          this.onOpen();
        });
      });

    // ── Note & Description ──
    new Setting(contentEl)
      .setName("Note")
      .setDesc("Link to a note (supports Page#Header and Page#^blockId)")
      .addText((text) => {
        text
          .setPlaceholder("Search for a note...")
          .setValue(this.marker.note ?? "")
          .onChange((value) => {
            this.marker.note = value || null;
            this.renderPreview(previewContainer);
          });
        new NoteLinkSuggest(this.app, text.inputEl, (value) => {
          this.marker.note = value || null;
          this.renderPreview(previewContainer);
        });
      });

    new Setting(contentEl)
      .setName("Description")
      .setDesc("Additional text shown below the note name")
      .addText((text) =>
        text
          .setValue(this.marker.description ?? "")
          .onChange((value) => {
            this.marker.description = value || null;
            this.renderPreview(previewContainer);
          })
      );

    // ── Icon ──
    const iconSetting = new Setting(contentEl)
      .setName("Icon")
      .setDesc("Font Awesome icon (leave blank for none)")
      .addText((text) => {
        text
          .setPlaceholder("Search for an icon...")
          .setValue(this.marker.icon ?? "")
          .onChange((value) => {
            this.marker.icon = value || null;
            this.renderPreview(previewContainer);
          });
        new IconSuggest(this.app, text.inputEl, (value) => {
          this.marker.icon = value || null;
          iconPreview.empty();
          if (value) setFAIcon(iconPreview, value);
          this.renderPreview(previewContainer);
        });
      });
    const iconPreview = iconSetting.controlEl.createDiv({ cls: "ttrpgmap-icon-preview" });
    if (this.marker.icon) setFAIcon(iconPreview, this.marker.icon);
    this.addResetButton(iconSetting, "icon", () => {
      this.marker.icon = template?.icon ?? null;
    });

    // ── Icon Color ──
    const iconColorSetting = new Setting(contentEl)
      .setName("Icon Color");
    const iconColorInput = iconColorSetting.controlEl.createEl("input", { cls: "ttrpgmap-color-picker" });
    iconColorInput.type = "color";
    iconColorInput.value = this.marker.iconColor ?? "#000000";
    iconColorInput.addEventListener("input", (e) => {
      this.marker.iconColor = (e.target as HTMLInputElement).value;
      this.renderPreview(previewContainer);
    });
    this.addResetButton(iconColorSetting, "iconColor", () => {
      this.marker.iconColor = template?.iconColor ?? "#000000";
    });

    // ── Text Placement ──
    const textPlacementSetting = new Setting(contentEl)
      .setName("Text Placement")
      .setDesc("Where the label appears relative to the marker")
      .addDropdown((dropdown) => {
        dropdown.addOption("above", "Above");
        dropdown.addOption("below", "Below");
        dropdown.addOption("left", "Left");
        dropdown.addOption("right", "Right");
        dropdown.setValue(this.marker.textPlacement ?? "above");
        dropdown.onChange((value) => {
          this.marker.textPlacement = value as any;
          this.renderPreview(previewContainer);
        });
      });
    this.addResetButton(textPlacementSetting, "textPlacement", () => {
      this.marker.textPlacement = template?.textPlacement ?? "above";
    });

    // ── Use Pin Shape + Pin-specific settings ──
    const usePinSetting = new Setting(contentEl)
      .setName("Use Pin Shape")
      .setDesc("Display the icon inside a map pin. When off, the icon itself is the marker.")
      .addToggle((toggle) => {
        toggle
          .setValue(usePin)
          .onChange((value) => {
            this.marker.useBaseMarker = value;
            this.onOpen(); // Re-render to toggle pin settings
          });
      });
    this.addResetButton(usePinSetting, "useBaseMarker" as any, () => {
      this.marker.useBaseMarker = template?.useBaseMarker ?? true;
    });

    // Pin Direction (only when pin is active)
    const dirSetting = new Setting(contentEl)
      .setName("Pin Direction")
      .setDesc("Which way the pin points")
      .addDropdown((dropdown) => {
        dropdown.addOption("up", "Up");
        dropdown.addOption("down", "Down");
        dropdown.addOption("left", "Left");
        dropdown.addOption("right", "Right");
        dropdown.setValue(this.marker.direction ?? "down");
        dropdown.onChange((value) => {
          this.marker.direction = value as any;
          this.renderPreview(previewContainer);
        });
        if (!usePin) dropdown.setDisabled(true);
      });
    if (!usePin) dirSetting.setClass("ttrpgmap-setting-disabled");
    this.addResetButton(dirSetting, "direction", () => {
      this.marker.direction = template?.direction ?? "down";
    });

    // Pin Color (only when pin is active)
    const pinColorSetting = new Setting(contentEl)
      .setName("Pin Color")
      .setDesc("Background color of the pin shape");
    const pinColorInput = pinColorSetting.controlEl.createEl("input", { cls: "ttrpgmap-color-picker" });
    pinColorInput.type = "color";
    pinColorInput.value = this.marker.color ?? "#ffffff";
    pinColorInput.addEventListener("input", (e) => {
      this.marker.color = (e.target as HTMLInputElement).value;
      this.renderPreview(previewContainer);
    });
    if (!usePin) {
      pinColorInput.disabled = true;
      pinColorSetting.setClass("ttrpgmap-setting-disabled");
    }
    this.addResetButton(pinColorSetting, "color", () => {
      this.marker.color = template?.color ?? "#ffffff";
    });

    // ── Save ──
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
