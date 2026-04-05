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

  const dupeBtn = control.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Duplicate template" } });
  setIcon(dupeBtn, "copy");
  dupeBtn.addEventListener("click", () => {
    const existingNames = new Set(
      plugin.settings.markerTemplates.map((t) => t.name.toLowerCase())
    );
    let name = `${template.name} (copy)`;
    if (existingNames.has(name.toLowerCase())) {
      let n = 2;
      while (existingNames.has(`${template.name} (copy ${n})`.toLowerCase())) n++;
      name = `${template.name} (copy ${n})`;
    }
    const duplicate: MarkerTemplate = {
      ...template,
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      folderId: template.folderId ?? null,
    };
    plugin.settings.markerTemplates.push(duplicate);
    plugin.dataManager.saveSettings(plugin.settings);
    rerender();
    new TemplateEditModal(plugin.app, plugin, duplicate, rerender).open();
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
  editing = false,
): void {
  const folderEl = container.createDiv({ cls: "ttrpgmap-folder" });

  // Track collapsed state on the container across rerenders
  const collapsedSet: Set<string> = (container as any)._collapsedFolders ?? new Set();
  (container as any)._collapsedFolders = collapsedSet;
  const isCollapsed = collapsedSet.has(folder.id);

  // Folder header
  const header = folderEl.createDiv({ cls: "setting-item ttrpgmap-folder-header" });
  const headerInfo = header.createDiv({ cls: "setting-item-info" });
  const nameRow = headerInfo.createDiv({ cls: "setting-item-name ttrpgmap-folder-name-row" });

  const chevronEl = nameRow.createDiv({ cls: "ttrpgmap-folder-chevron" });
  setIcon(chevronEl, "chevron-down");
  if (isCollapsed) chevronEl.addClass("is-collapsed");

  const iconEl = nameRow.createDiv({ cls: "ttrpgmap-folder-icon" });
  setIcon(iconEl, "folder");
  const nameSpan = nameRow.createSpan({ text: folder.name });

  const startEditing = () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = folder.name;
    input.addClass("ttrpgmap-folder-name-input");
    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const val = input.value.trim();
      if (val && val !== folder.name) {
        folder.name = val;
        plugin.dataManager.saveSettings(plugin.settings);
      }
      input.replaceWith(nameSpan);
      nameSpan.textContent = folder.name;
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      if (e.key === "Escape") { input.value = folder.name; input.blur(); }
    });
  };

  const headerControl = header.createDiv({ cls: "setting-item-control" });

  // Rename button
  const renameBtn = headerControl.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Rename folder" } });
  setIcon(renameBtn, "pencil");
  renameBtn.addEventListener("click", startEditing);

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
  if (isCollapsed) contents.style.display = "none";
  makeDropTarget(contents, plugin, folder.id, rerender);

  // Toggle collapse on chevron or header info click
  const toggleCollapse = () => {
    const collapsed = collapsedSet.has(folder.id);
    if (collapsed) {
      collapsedSet.delete(folder.id);
      contents.style.display = "";
      chevronEl.removeClass("is-collapsed");
    } else {
      collapsedSet.add(folder.id);
      contents.style.display = "none";
      chevronEl.addClass("is-collapsed");
    }
  };
  nameRow.addEventListener("click", (e) => {
    // Don't toggle if clicking on the inline name editor
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    toggleCollapse();
  });

  if (templates.length === 0) {
    contents.createDiv({ cls: "ttrpgmap-folder-empty", text: "Drag templates here" });
  } else {
    for (const template of templates) {
      renderTemplateRow(contents, plugin, template, rerender);
    }
  }

  if (editing) startEditing();
}

/** Renders the marker templates UI into a container element */
export function renderTemplateManager(
  container: HTMLElement,
  plugin: TTRPGMapsPlugin,
  rerender: () => void
): void {
  container.empty();
  container.addClass("ttrpgmap-template-list-container");

  // Track which folder should start in edit mode after rerender
  let editingFolderId: string | null = (container as any)._editingFolderId ?? null;
  (container as any)._editingFolderId = null;

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
    const id = `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    plugin.settings.templateFolders.push({ id, name: `Folder ${n}` });
    plugin.dataManager.saveSettings(plugin.settings);
    (container as any)._editingFolderId = id;
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

  const sortByName = <T extends { name: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => a.name.localeCompare(b.name));

  // Top-level templates (no folder) -- also a drop target to remove from folders
  const topLevel = container.createDiv({ cls: "ttrpgmap-top-level-templates" });
  makeDropTarget(topLevel, plugin, null, rerender);

  const topLevelTemplates = sortByName(plugin.settings.markerTemplates.filter((t) => !t.folderId));
  for (const template of topLevelTemplates) {
    renderTemplateRow(topLevel, plugin, template, rerender);
  }

  // Folders (sorted alphabetically)
  const sortedFolders = sortByName(plugin.settings.templateFolders);
  for (const folder of sortedFolders) {
    const folderTemplates = sortByName(plugin.settings.markerTemplates.filter((t) => t.folderId === folder.id));
    renderFolder(container, plugin, folder, folderTemplates, rerender, folder.id === editingFolderId);
  }
}
