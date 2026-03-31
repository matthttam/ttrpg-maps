import { setIcon } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MarkerTemplate } from "../types";
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
    const newTemplate: MarkerTemplate = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: `Template ${plugin.settings.markerTemplates.length}`,
      note: null,
      description: null,
      direction: "down",
      textPlacement: "above",
      color: "#ffffff",
      icon: null,
      iconColor: "#000000",
      useBaseMarker: true,
      shape: "pin",
    };
    plugin.settings.markerTemplates.push(newTemplate);
    plugin.dataManager.saveSettings(plugin.settings);
    rerender();
  });

  for (const template of plugin.settings.markerTemplates) {
    const isDefault = template.id === "default";

    const row = container.createDiv({ cls: "setting-item" });
    const info = row.createDiv({ cls: "setting-item-info" });
    const nameRow = info.createDiv({ cls: "setting-item-name ttrpgmap-template-name-row" });

    createMarkerPreview(nameRow, template);
    nameRow.createSpan({ text: template.name });

    if (!isDefault) {
      const control = row.createDiv({ cls: "setting-item-control" });

      const editBtn = control.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Edit template" } });
      setIcon(editBtn, "pencil");
      editBtn.addEventListener("click", () => {
        new TemplateEditModal(plugin.app, plugin, template, rerender).open();
      });

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
