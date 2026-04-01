import { App, Modal, Setting } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MarkerTemplate, MarkerDirection, TextPlacement } from "../types";
import { NoteLinkSuggest } from "../suggests/NoteLinkSuggest";
import { createPinElement } from "../utils/markerPin";
import { buildMarkerLabel } from "../utils/markerLabel";
import { buildTextPlacementField, buildPinSelectorField, buildIconField, MarkerFieldState } from "./sharedFields";

export class MarkerEditModal extends Modal {
  private plugin: TTRPGMapsPlugin;
  private marker: {
    note: string | null;
    description: string | null;
    templateId: string;
    direction: string | null;
    textPlacement: string | null;
    color: string | null;
    icon: string | null;
    iconColor: string | null;
    useBaseMarker: boolean | null;
    shape: "pin" | "circle" | null;
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
      (t) => t.id === this.marker.templateId
    );
  }

  private addResetButton(setting: Setting, onReset: () => void): void {
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

  /** Bridge marker's nullable fields into the non-null MarkerFieldState the shared builders expect */
  private getFieldState(): MarkerFieldState {
    return {
      icon: this.marker.icon,
      iconColor: this.marker.iconColor ?? "#000000",
      direction: (this.marker.direction ?? "down") as MarkerDirection,
      textPlacement: (this.marker.textPlacement ?? "above") as TextPlacement,
      color: this.marker.color ?? "#ffffff",
      useBaseMarker: this.marker.useBaseMarker ?? true,
      shape: (this.marker.shape ?? "pin") as "pin" | "circle",
    };
  }

  /** Write shared field state back to marker's nullable fields */
  private syncFromFieldState(fs: MarkerFieldState): void {
    this.marker.icon = fs.icon;
    this.marker.iconColor = fs.iconColor;
    this.marker.direction = fs.direction;
    this.marker.textPlacement = fs.textPlacement;
    this.marker.color = fs.color;
    this.marker.useBaseMarker = fs.useBaseMarker;
    this.marker.shape = fs.shape;
  }

  private renderPreview(container: HTMLElement): void {
    container.empty();
    const usePin = this.marker.useBaseMarker ?? true;
    const direction = (this.marker.direction ?? "down") as MarkerDirection;
    const textPlacement = (this.marker.textPlacement ?? "above") as TextPlacement;

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
      shape: (this.marker.shape ?? "pin") as "pin" | "circle",
    });

    buildMarkerLabel(wrapper, this.marker.note, this.marker.description, "ttrpgmap-edit-preview-label");
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("ttrpgmap-modal-container");
    contentEl.addClass("ttrpgmap-modal");

    const template = this.getTemplate();

    contentEl.createEl("h2", { text: "Edit Marker" });

    const layout = contentEl.createDiv({ cls: "ttrpgmap-modal-layout" });
    const mainCol = layout.createDiv({ cls: "ttrpgmap-modal-main" });
    const previewContainer = layout.createDiv({ cls: "ttrpgmap-edit-preview" });
    this.renderPreview(previewContainer);

    // ── Template ──
    new Setting(mainCol)
      .setName("Template")
      .addDropdown((dropdown) => {
        for (const t of this.plugin.settings.markerTemplates) {
          dropdown.addOption(t.id, t.name);
        }
        dropdown.setValue(this.marker.templateId);
        dropdown.onChange((value) => {
          this.marker.templateId = value;
          const newTemplate = this.plugin.settings.markerTemplates.find((t) => t.id === value);
          if (newTemplate) {
            this.marker.direction = newTemplate.direction;
            this.marker.textPlacement = newTemplate.textPlacement;
            this.marker.color = newTemplate.color;
            this.marker.icon = newTemplate.icon;
            this.marker.iconColor = newTemplate.iconColor;
            this.marker.useBaseMarker = newTemplate.useBaseMarker;
            this.marker.shape = newTemplate.shape;
          }
          activeWindow.requestAnimationFrame(() => this.onOpen());
        });
      });

    // ── Note ──
    new Setting(mainCol)
      .setName("Note")
      .setDesc("Link to a note. Type # for headings, #^ for blocks, | for alias.")
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

    // ── Description ──
    new Setting(mainCol)
      .setName("Description")
      .setDesc("Additional text shown below the note name")
      .addTextArea((textArea) => {
        textArea
          .setValue(this.marker.description ?? "")
          .onChange((value) => {
            this.marker.description = value || null;
            this.renderPreview(previewContainer);
          });
        textArea.inputEl.addClass("ttrpgmap-description-input");
        textArea.inputEl.rows = 3;
      });

    // ── Shared fields (text placement, pin, icon) ──
    const fieldState = this.getFieldState();
    const ctx = {
      app: this.app,
      contentEl: mainCol,
      state: fieldState,
      onChanged: () => {
        this.syncFromFieldState(fieldState);
        this.renderPreview(previewContainer);
      },
    };

    const tpSetting = buildTextPlacementField(ctx);
    this.addResetButton(tpSetting, () => {
      this.marker.textPlacement = template?.textPlacement ?? "above";
    });

    const pinSetting = buildPinSelectorField(ctx);
    this.addResetButton(pinSetting, () => {
      this.marker.useBaseMarker = template?.useBaseMarker ?? true;
      this.marker.direction = template?.direction ?? "down";
      this.marker.color = template?.color ?? "#ffffff";
    });

    const { setting: iconSetting, colorPicker: iconColorPicker } = buildIconField(ctx);
    this.addResetButton(iconSetting, () => {
      this.marker.icon = template?.icon ?? null;
      this.marker.iconColor = template?.iconColor ?? "#000000";
      iconColorPicker.setValue(this.marker.iconColor);
    });

    // ── Save / Cancel ──
    new Setting(mainCol)
      .addButton((btn) =>
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            this.onSave(this.marker);
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
