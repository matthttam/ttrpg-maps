import { App, Modal, Setting, Notice } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MarkerTemplate, MapMarker } from "../types";
import { createPinElement } from "../utils/markerPin";
import { buildTextPlacementField, buildPinSelectorField, buildIconField, buildIconColorField } from "./sharedFields";

/** Fields on a template that can be pushed to markers */
const APPLY_FIELDS: (keyof MarkerTemplate)[] = [
  "direction", "textPlacement", "color", "icon", "iconColor", "useBaseMarker", "shape",
];

/** Human-readable labels for each field */
const FIELD_LABELS: Record<string, string> = {
  direction: "Pin Direction",
  textPlacement: "Text Placement",
  color: "Pin Color",
  icon: "Icon",
  iconColor: "Icon Color",
  useBaseMarker: "Use Pin Shape",
  shape: "Pin Shape",
};

/** Get the fields that changed between snapshot and current template */
function getChangedFields(snapshot: Partial<MarkerTemplate>, current: MarkerTemplate): (keyof MarkerTemplate)[] {
  return APPLY_FIELDS.filter((key) => {
    const oldVal = snapshot[key];
    const newVal = current[key];
    return oldVal !== newVal;
  });
}

export class TemplateEditModal extends Modal {
  private plugin: TTRPGMapsPlugin;
  private template: MarkerTemplate;
  private snapshot: Partial<MarkerTemplate>;
  private onSaved: () => void;
  private changedIndicators: Map<string, HTMLElement> = new Map();

  constructor(app: App, plugin: TTRPGMapsPlugin, template: MarkerTemplate, onSaved: () => void) {
    super(app);
    this.plugin = plugin;
    this.template = template;
    this.onSaved = onSaved;
    // Snapshot current values for dirty tracking
    this.snapshot = {};
    for (const key of APPLY_FIELDS) {
      (this.snapshot as any)[key] = template[key];
    }
  }

  private renderPreview(container: HTMLElement): void {
    container.empty();
    const wrapper = container.createDiv({ cls: "ttrpgmap-edit-preview-wrapper" });
    wrapper.dataset.direction = this.template.direction;
    wrapper.dataset.textPlacement = this.template.textPlacement;

    createPinElement(wrapper, {
      pinClass: "ttrpgmap-edit-preview-pin",
      svgClass: "ttrpgmap-pin-svg",
      color: this.template.color,
      icon: this.template.icon,
      iconColor: this.template.iconColor,
      iconClass: "ttrpgmap-edit-preview-icon",
      useBaseMarker: this.template.useBaseMarker,
      shape: this.template.shape,
    });
  }

  /** Update dirty indicators on all tracked fields */
  private updateDirtyIndicators(): void {
    const changed = getChangedFields(this.snapshot, this.template);
    for (const [key, el] of this.changedIndicators) {
      if (changed.includes(key as keyof MarkerTemplate)) {
        el.style.display = "";
      } else {
        el.style.display = "none";
      }
    }
  }

  /** Add a red dot indicator to a setting and track it */
  private addDirtyIndicator(setting: Setting, ...fields: string[]): void {
    const dot = setting.nameEl.createSpan({ cls: "ttrpgmap-dirty-indicator", text: " *" });
    dot.style.display = "none";
    for (const f of fields) {
      this.changedIndicators.set(f, dot);
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");
    this.changedIndicators.clear();

    contentEl.createEl("h2", { text: "Edit Template" });

    const previewContainer = contentEl.createDiv({ cls: "ttrpgmap-edit-preview" });
    this.renderPreview(previewContainer);

    const onChanged = () => {
      this.renderPreview(previewContainer);
      this.updateDirtyIndicators();
    };

    const ctx = {
      app: this.app,
      contentEl,
      state: this.template,
      onChanged,
    };

    // ── Name ──
    new Setting(contentEl)
      .setName("Name")
      .addText((text) =>
        text.setValue(this.template.name).onChange((value) => {
          this.template.name = value;
        })
      );

    // ── Shared fields ──
    const tpSetting = buildTextPlacementField(ctx);
    this.addDirtyIndicator(tpSetting, "textPlacement");

    const pinSetting = buildPinSelectorField(ctx);
    this.addDirtyIndicator(pinSetting, "direction", "color", "useBaseMarker", "shape");

    const { setting: iconSetting, updatePreview } = buildIconField(ctx);
    this.addDirtyIndicator(iconSetting, "icon");

    const { setting: iconColorSetting } = buildIconColorField(ctx, updatePreview);
    this.addDirtyIndicator(iconColorSetting, "iconColor");

    // ── Actions ──
    const actionSetting = new Setting(contentEl);
    actionSetting.controlEl.addClass("ttrpgmap-action-row");

    actionSetting
      .addButton((btn) =>
        btn
          .setButtonText("Save & Apply Changes to Markers")
          .setWarning()
          .onClick(() => {
            const changed = getChangedFields(this.snapshot, this.template);
            if (changed.length === 0) {
              new Notice("No changes to apply.");
              return;
            }
            new ConfirmApplyModal(
              this.app,
              this.template.name,
              changed.map((f) => FIELD_LABELS[f] || f),
              async () => {
                this.plugin.dataManager.saveSettings(this.plugin.settings);

                const allStates = await this.plugin.dataManager.loadAllMapStates();
                let count = 0;
                for (const state of allStates) {
                  let stateChanged = false;
                  for (const marker of state.markers) {
                    if (marker.templateId !== this.template.id) continue;
                    // Only push changed fields
                    for (const field of changed) {
                      (marker as any)[field] = (this.template as any)[field];
                    }
                    stateChanged = true;
                    count++;
                  }
                  if (stateChanged) {
                    this.plugin.dataManager.saveMapState(state.mapId, state);
                  }
                }

                await this.plugin.dataManager.flushSaves();
                new Notice(`Updated ${count} marker${count !== 1 ? "s" : ""} using "${this.template.name}".`);
                this.plugin.triggerMapRefresh();
                this.onSaved();
                this.close();
              }
            ).open();
          })
      )
      .addButton((btn) =>
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

class ConfirmApplyModal extends Modal {
  private templateName: string;
  private fieldLabels: string[];
  private onConfirm: () => void;

  constructor(app: App, templateName: string, fieldLabels: string[], onConfirm: () => void) {
    super(app);
    this.templateName = templateName;
    this.fieldLabels = fieldLabels;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");

    contentEl.createEl("h2", { text: "Confirm Apply" });
    contentEl.createEl("p", {
      text: `The following changes will be applied to all markers using the "${this.templateName}" template:`,
    });

    const list = contentEl.createEl("ul", { cls: "ttrpgmap-confirm-list" });
    for (const label of this.fieldLabels) {
      list.createEl("li", { text: label });
    }

    contentEl.createEl("p", {
      text: "This will override custom values on those fields. Are you sure?",
      cls: "ttrpgmap-muted",
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
