import { App, Modal, Setting, Notice } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MarkerTemplate, PREDEFINED_TEMPLATE_IDS } from "../types";
import { createPinElement } from "../utils/markerPin";
import { buildMarkerLabel } from "../utils/markerLabel";
import { buildTextPlacementField, buildPinSelectorField, buildIconField } from "./sharedFields";

/** Fields on a template that can be pushed to markers */
const APPLY_FIELDS: (keyof MarkerTemplate)[] = [
  "direction", "textPlacement", "color", "icon", "iconColor", "iconRotation", "useBaseMarker", "shape",
];

/** Human-readable labels for each field */
const FIELD_LABELS: Record<string, string> = {
  direction: "Pin direction",
  textPlacement: "Text placement",
  color: "Pin color",
  icon: "Icon",
  iconColor: "Icon color",
  iconRotation: "Icon rotation",
  useBaseMarker: "Use pin shape",
  shape: "Pin shape",
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
  private original: MarkerTemplate;
  private draft: MarkerTemplate;
  private snapshot: Partial<MarkerTemplate>;
  private onSaved: () => void;
  private changedIndicators: Map<string, HTMLElement> = new Map();

  constructor(app: App, plugin: TTRPGMapsPlugin, template: MarkerTemplate, onSaved: () => void) {
    super(app);
    this.plugin = plugin;
    this.original = template;
    this.draft = { ...template };
    this.onSaved = onSaved;
    // Snapshot original values for dirty tracking
    this.snapshot = {};
    for (const key of APPLY_FIELDS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.snapshot as any)[key] = template[key];
    }
  }

  /** Return an error message if the name is invalid, or null if valid */
  private validateName(name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return "Name cannot be empty.";
    const duplicate = this.plugin.settings.markerTemplates.find(
      (t) => t.id !== this.draft.id && t.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) return "A template with this name already exists.";
    return null;
  }

  private renderPreview(container: HTMLElement): void {
    container.empty();
    const wrapper = container.createDiv({ cls: "ttrpgmap-edit-preview-wrapper" });
    wrapper.dataset.direction = this.draft.direction;
    wrapper.dataset.textPlacement = this.draft.textPlacement;

    createPinElement(wrapper, {
      pinClass: "ttrpgmap-edit-preview-pin",
      svgClass: "ttrpgmap-pin-svg",
      color: this.draft.color,
      icon: this.draft.icon,
      iconColor: this.draft.iconColor,
      iconRotation: this.draft.iconRotation,
      iconClass: "ttrpgmap-edit-preview-icon",
      useBaseMarker: this.draft.useBaseMarker,
      shape: this.draft.shape,
    });

    buildMarkerLabel(wrapper, "Example Note", null, "Example Description", "ttrpgmap-edit-preview-label");
  }

  /** Update dirty indicators on all tracked fields */
  private updateDirtyIndicators(): void {
    const changed = getChangedFields(this.snapshot, this.draft);
    // Group fields by their shared indicator element
    const elements = new Map<HTMLElement, string[]>();
    for (const [key, el] of this.changedIndicators) {
      let keys = elements.get(el);
      if (!keys) { keys = []; elements.set(el, keys); }
      keys.push(key);
    }
    // Show indicator if any of its fields changed
    for (const [el, keys] of elements) {
      const dirty = keys.some((k) => changed.includes(k as keyof MarkerTemplate));
      if (dirty) { el.removeClass("ttrpgmap-hidden"); } else { el.addClass("ttrpgmap-hidden"); }
    }
  }

  /** Add a red dot indicator to a setting and track it */
  private addDirtyIndicator(setting: Setting, ...fields: string[]): void {
    const dot = setting.nameEl.createSpan({ cls: "ttrpgmap-dirty-indicator", text: " *" });
    dot.addClass("ttrpgmap-hidden");
    for (const f of fields) {
      this.changedIndicators.set(f, dot);
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("ttrpgmap-modal-container", "ttrpgmap-modal-container--wide", "mod-settings");
    contentEl.addClass("ttrpgmap-modal");
    this.changedIndicators.clear();

    new Setting(contentEl).setName("Edit template").setHeading();

    const layout = contentEl.createDiv({ cls: "ttrpgmap-modal-layout" });
    const mainCol = layout.createDiv({ cls: "ttrpgmap-modal-main" });
    const previewContainer = layout.createDiv({ cls: "ttrpgmap-edit-preview" });
    this.renderPreview(previewContainer);

    const onChanged = () => {
      this.renderPreview(previewContainer);
      this.updateDirtyIndicators();
    };

    const ctx = {
      app: this.app,
      contentEl: mainCol,
      state: this.draft,
      onChanged,
    };

    // ── Name ──
    const isPredefined = PREDEFINED_TEMPLATE_IDS.has(this.draft.id);
    let nameError: HTMLElement;
    new Setting(mainCol)
      .setName("Name")
      .addText((text) => {
        text.setValue(this.draft.name);
        if (isPredefined) {
          text.setDisabled(true);
        } else {
          text.onChange((value) => {
            this.draft.name = value;
            const err = this.validateName(value);
            nameError.setText(err ?? "");
            if (err) { nameError.removeClass("ttrpgmap-hidden"); } else { nameError.addClass("ttrpgmap-hidden"); }
          });
        }
      })
      .then((s) => {
        nameError = s.controlEl.createDiv({ cls: "ttrpgmap-field-error" });
        nameError.addClass("ttrpgmap-hidden");
      });

    // ── Shared fields ──
    const tpSetting = buildTextPlacementField(ctx);
    this.addDirtyIndicator(tpSetting, "textPlacement");

    const pinSetting = buildPinSelectorField(ctx);
    this.addDirtyIndicator(pinSetting, "direction", "color", "useBaseMarker", "shape");

    const { setting: iconSetting } = buildIconField(ctx);
    this.addDirtyIndicator(iconSetting, "icon", "iconColor", "iconRotation");

    // ── Actions ──
    const actionSetting = new Setting(mainCol);
    actionSetting.controlEl.addClass("ttrpgmap-action-row");

    /** Apply draft to the original template in settings */
    const commitDraft = () => {
      Object.assign(this.original, this.draft);
    };

    actionSetting
      .addButton((btn) =>
        btn
          .setButtonText("Save & update markers")
          .setWarning()
          .onClick(() => {
            const nameErr = this.validateName(this.draft.name);
            if (nameErr) { new Notice(nameErr); return; }
            const changed = getChangedFields(this.snapshot, this.draft);
            if (changed.length === 0) {
              new Notice("No changes to apply.");
              return;
            }
            new ConfirmApplyModal(
              this.app,
              this.draft.name,
              changed.map((f) => FIELD_LABELS[f] || f),
              async () => {
                commitDraft();
                void this.plugin.dataManager.saveSettings(this.plugin.settings);

                const allStates = await this.plugin.dataManager.loadAllMapStates();
                let count = 0;
                for (const state of allStates) {
                  let stateChanged = false;
                  for (const marker of state.markers) {
                    if (marker.templateId !== this.draft.id) continue;
                    for (const field of changed) {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (marker as any)[field] = (this.draft as any)[field];
                    }
                    stateChanged = true;
                    count++;
                  }
                  if (stateChanged) {
                    this.plugin.dataManager.saveMapState(state.mapId, state);
                  }
                }

                await this.plugin.dataManager.flushSaves();
                new Notice(`Updated ${count} marker${count !== 1 ? "s" : ""} using "${this.draft.name}".`);
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
            const nameErr = this.validateName(this.draft.name);
            if (nameErr) { new Notice(nameErr); return; }
            commitDraft();
            void this.plugin.dataManager.saveSettings(this.plugin.settings);
            this.onSaved();
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
    this.modalEl.addClass("ttrpgmap-modal-container", "mod-settings");
    contentEl.addClass("ttrpgmap-modal");

    new Setting(contentEl).setName("Confirm apply").setHeading();
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
        btn.setButtonText("Yes, apply").setWarning().onClick(() => {
          void this.onConfirm();
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
