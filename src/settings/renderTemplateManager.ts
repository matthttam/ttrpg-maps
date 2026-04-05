import { setIcon } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MarkerTemplate, TemplateFolder, PREDEFINED_TEMPLATE_IDS, DEFAULT_SETTINGS } from "../types";
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

/** Renders a single template row */
function renderTemplateRow(
  container: HTMLElement,
  plugin: TTRPGMapsPlugin,
  template: MarkerTemplate,
  rerender: () => void,
): HTMLElement {
  const isDefault = PREDEFINED_TEMPLATE_IDS.has(template.id);

  const row = container.createDiv({ cls: "setting-item ttrpgmap-template-row" });
  row.setAttribute("draggable", "true");
  row.dataset.templateId = template.id;

  // Drag handlers
  row.addEventListener("dragstart", (e) => {
    e.dataTransfer!.setData("text/ttrpgmap-template", template.id);
    e.dataTransfer!.effectAllowed = "move";
    row.addClass("ttrpgmap-dragging");
  });
  row.addEventListener("dragend", () => {
    row.removeClass("ttrpgmap-dragging");
  });

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

  return row;
}

/** Sets up drop target handlers on an element */
function makeDropTarget(
  el: HTMLElement,
  plugin: TTRPGMapsPlugin,
  folderId: string | null,
  rerender: () => void,
): void {
  el.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types.includes("text/ttrpgmap-template")) {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
      el.addClass("ttrpgmap-drag-over");
    }
  });
  el.addEventListener("dragleave", (e) => {
    // Only remove highlight when leaving the element itself, not children
    if (e.relatedTarget && el.contains(e.relatedTarget as Node)) return;
    el.removeClass("ttrpgmap-drag-over");
  });
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.removeClass("ttrpgmap-drag-over");
    const templateId = e.dataTransfer?.getData("text/ttrpgmap-template");
    if (!templateId) return;
    const template = plugin.settings.markerTemplates.find((t) => t.id === templateId);
    if (!template) return;
    template.folderId = folderId;
    plugin.dataManager.saveSettings(plugin.settings);
    rerender();
  });
}

/** Renders a folder section with its contained templates */
function renderFolder(
  container: HTMLElement,
  plugin: TTRPGMapsPlugin,
  folder: TemplateFolder,
  templates: MarkerTemplate[],
  rerender: () => void,
): void {
  const folderEl = container.createDiv({ cls: "ttrpgmap-folder" });

  // Folder header
  const header = folderEl.createDiv({ cls: "setting-item ttrpgmap-folder-header" });
  const headerInfo = header.createDiv({ cls: "setting-item-info" });
  const nameRow = headerInfo.createDiv({ cls: "setting-item-name ttrpgmap-folder-name-row" });
  const iconEl = nameRow.createDiv({ cls: "ttrpgmap-folder-icon" });
  setIcon(iconEl, "folder");
  nameRow.createSpan({ text: folder.name });

  const headerControl = header.createDiv({ cls: "setting-item-control" });

  // Rename button
  const renameBtn = headerControl.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Rename folder" } });
  setIcon(renameBtn, "pencil");
  renameBtn.addEventListener("click", () => {
    const newName = prompt("Folder name:", folder.name);
    if (newName && newName.trim()) {
      folder.name = newName.trim();
      plugin.dataManager.saveSettings(plugin.settings);
      rerender();
    }
  });

  // Delete button
  const deleteBtn = headerControl.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Delete folder" } });
  setIcon(deleteBtn, "trash-2");
  deleteBtn.addEventListener("click", () => {
    // Move contained templates to top level
    for (const t of plugin.settings.markerTemplates) {
      if (t.folderId === folder.id) t.folderId = null;
    }
    plugin.settings.templateFolders = plugin.settings.templateFolders.filter((f) => f.id !== folder.id);
    plugin.dataManager.saveSettings(plugin.settings);
    rerender();
  });

  // Folder contents (drop target)
  const contents = folderEl.createDiv({ cls: "ttrpgmap-folder-contents" });
  makeDropTarget(contents, plugin, folder.id, rerender);

  if (templates.length === 0) {
    contents.createDiv({ cls: "ttrpgmap-folder-empty", text: "Drag templates here" });
  } else {
    for (const template of templates) {
      renderTemplateRow(contents, plugin, template, rerender);
    }
  }
}

/** Renders the marker templates UI into a container element */
export function renderTemplateManager(
  container: HTMLElement,
  plugin: TTRPGMapsPlugin,
  rerender: () => void
): void {
  container.empty();
  container.addClass("ttrpgmap-template-list-container");

  // Header row with "Add Template" and "Add Folder" buttons
  const header = container.createDiv({ cls: "setting-item setting-item-heading" });
  const headerInfo = header.createDiv({ cls: "setting-item-info" });
  headerInfo.createDiv({ cls: "setting-item-name", text: "Marker Templates" });
  headerInfo.createDiv({ cls: "setting-item-description", text: "Create and manage reusable marker presets" });
  const headerControl = header.createDiv({ cls: "setting-item-control" });

  const addFolderBtn = headerControl.createEl("button", { text: "Add Folder" });
  addFolderBtn.addEventListener("click", () => {
    const existingNames = new Set(plugin.settings.templateFolders.map((f) => f.name.toLowerCase()));
    let n = 1;
    while (existingNames.has(`folder ${n}`.toLowerCase())) n++;
    plugin.settings.templateFolders.push({
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: `Folder ${n}`,
    });
    plugin.dataManager.saveSettings(plugin.settings);
    rerender();
  });

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

  // Top-level templates (no folder) -- also a drop target to remove from folders
  const topLevel = container.createDiv({ cls: "ttrpgmap-top-level-templates" });
  makeDropTarget(topLevel, plugin, null, rerender);

  const topLevelTemplates = plugin.settings.markerTemplates.filter((t) => !t.folderId);
  for (const template of topLevelTemplates) {
    renderTemplateRow(topLevel, plugin, template, rerender);
  }

  // Folders
  for (const folder of plugin.settings.templateFolders) {
    const folderTemplates = plugin.settings.markerTemplates.filter((t) => t.folderId === folder.id);
    renderFolder(container, plugin, folder, folderTemplates, rerender);
  }
}
