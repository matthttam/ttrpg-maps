import { setIcon } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MarkerTemplate, PREDEFINED_TEMPLATE_IDS, DEFAULT_SETTINGS } from "../types";
import { createPinElement } from "../utils/markerPin";
import { TemplateEditModal } from "../modals/TemplateEditModal";

/** Creates a marker pin preview for the template list */
function createMarkerPreview(container: HTMLElement, template: MarkerTemplate): HTMLElement {
  const preview = container.createDiv({ cls: "ttrpgmap-template-preview" });
  createPinElement(preview, {
    pinClass: "ttrpgmap-preview-pin",
    svgClass: "ttrpgmap-pin-svg",
    color: template.color,
    icon: template.icon,
    iconColor: template.iconColor,
    iconClass: "ttrpgmap-preview-icon",
    useBaseMarker: template.useBaseMarker,
    shape: template.shape,
  });
  return preview;
}

/** Renders the marker templates UI into a container element */
export function renderTemplateManager(
  container: HTMLElement,
  plugin: TTRPGMapsPlugin,
  rerender: () => void
): void {
  container.empty();
  container.addClass("ttrpgmap-template-list-container");

  // Header row with "Add" button on the right
  const header = container.createDiv({ cls: "setting-item setting-item-heading" });
  const headerInfo = header.createDiv({ cls: "setting-item-info" });
  headerInfo.createDiv({ cls: "setting-item-name", text: "Marker Templates" });
  headerInfo.createDiv({ cls: "setting-item-description", text: "Create and manage reusable marker presets" });
  const headerControl = header.createDiv({ cls: "setting-item-control" });
  const addBtn = headerControl.createEl("button", { cls: "mod-cta", text: "Add Template" });
  addBtn.addEventListener("click", () => {
    const existingNames = new Set(
      plugin.settings.markerTemplates.map((t) => t.name.toLowerCase())
    );
    let n = plugin.settings.markerTemplates.length;
    while (existingNames.has(`template ${n}`.toLowerCase())) n++;

    const base = DEFAULT_SETTINGS.markerTemplates[0];
    const newTemplate: MarkerTemplate = {
      ...base,
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: `Template ${n}`,
    };
    plugin.settings.markerTemplates.push(newTemplate);
    plugin.dataManager.saveSettings(plugin.settings);
    rerender();
  });

  for (const template of plugin.settings.markerTemplates) {
    const isDefault = PREDEFINED_TEMPLATE_IDS.has(template.id);

    const row = container.createDiv({ cls: "setting-item" });
    const info = row.createDiv({ cls: "setting-item-info" });
    const nameRow = info.createDiv({ cls: "setting-item-name ttrpgmap-template-name-row" });

    createMarkerPreview(nameRow, template);
    nameRow.createSpan({ text: template.name });

    const control = row.createDiv({ cls: "setting-item-control" });

    const editBtn = control.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Edit template" } });
    setIcon(editBtn, "pencil");
    editBtn.addEventListener("click", () => {
      new TemplateEditModal(plugin.app, plugin, template, rerender).open();
    });

    if (isDefault) {
      const resetBtn = control.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Reset to defaults" } });
      setIcon(resetBtn, "rotate-ccw");
      resetBtn.addEventListener("click", () => {
        const defaults = DEFAULT_SETTINGS.markerTemplates.find((t) => t.id === template.id);
        if (defaults) {
          Object.assign(template, { ...defaults });
          plugin.dataManager.saveSettings(plugin.settings);
          rerender();
        }
      });
    } else {
      const deleteBtn = control.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Delete template" } });
      setIcon(deleteBtn, "trash-2");
      deleteBtn.addEventListener("click", () => {
        const idx = plugin.settings.markerTemplates.indexOf(template);
        if (idx > -1) {
          plugin.settings.markerTemplates.splice(idx, 1);
          plugin.dataManager.saveSettings(plugin.settings);
          rerender();
        }
      });
    }
  }
}
