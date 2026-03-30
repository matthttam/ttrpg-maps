import { App, Modal, Setting, TFile, Notice, AbstractInputSuggest, PluginSettingTab, setIcon, getIconIds } from "obsidian";
import type TTRPGMapsPlugin from "./main";
import { MapConfig, MapMarker, MarkerTemplate, DistanceScale, DEFAULT_MAP_CONFIG } from "./types";

/**
 * Inline suggest for image files. Filters to common image extensions.
 */
class ImageSuggest extends AbstractInputSuggest<string> {
  private textInputEl: HTMLInputElement;
  private onChange: (value: string) => void;
  private static IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"];

  constructor(app: App, inputEl: HTMLInputElement, onChange: (value: string) => void) {
    super(app, inputEl);
    this.textInputEl = inputEl;
    this.onChange = onChange;
  }

  getSuggestions(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    return this.app.vault.getFiles()
      .filter((f) =>
        ImageSuggest.IMAGE_EXTENSIONS.includes(f.extension.toLowerCase()) &&
        (f.basename.toLowerCase().includes(lowerQuery) || f.path.toLowerCase().includes(lowerQuery))
      )
      .sort((a, b) => {
        const aStart = a.basename.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        const bStart = b.basename.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        return aStart - bStart || a.basename.localeCompare(b.basename);
      })
      .map((f) => f.path)
      .slice(0, 20);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  selectSuggestion(value: string): void {
    this.textInputEl.value = value;
    this.textInputEl.trigger("input");
    this.onChange(value);
    this.close();
  }
}

/**
 * Inline suggest for note links. Supports Page, Page#Header, Page#^blockId.
 * Attaches to a text input and shows suggestions as you type.
 */
class NoteLinkSuggest extends AbstractInputSuggest<string> {
  private textInputEl: HTMLInputElement;
  private onChange: (value: string) => void;

  constructor(app: App, inputEl: HTMLInputElement, onChange: (value: string) => void) {
    super(app, inputEl);
    this.textInputEl = inputEl;
    this.onChange = onChange;
  }

  getSuggestions(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    const hashIdx = lowerQuery.indexOf("#");

    if (hashIdx >= 0) {
      // User typed "page#..." — suggest headings or block IDs within that file
      const filePart = query.slice(0, hashIdx);
      const subQuery = query.slice(hashIdx + 1).toLowerCase();
      const file = this.app.metadataCache.getFirstLinkpathDest(filePart, "");
      if (!file) return [];

      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) return [];

      const results: string[] = [];

      // Heading suggestions
      if (cache.headings) {
        for (const h of cache.headings) {
          const link = `${filePart}#${h.heading}`;
          if (h.heading.toLowerCase().includes(subQuery)) {
            results.push(link);
          }
        }
      }

      // Block ID suggestions (^blockId)
      if (cache.blocks && subQuery.startsWith("^")) {
        const blockQuery = subQuery.slice(1);
        for (const id of Object.keys(cache.blocks)) {
          const link = `${filePart}#^${id}`;
          if (id.toLowerCase().includes(blockQuery)) {
            results.push(link);
          }
        }
      }

      return results.slice(0, 20);
    }

    // No # yet — suggest matching file names
    const files = this.app.vault.getMarkdownFiles();
    return files
      .filter((f) => {
        const name = f.basename.toLowerCase();
        const path = f.path.toLowerCase();
        return name.includes(lowerQuery) || path.includes(lowerQuery);
      })
      .sort((a, b) => {
        // Prioritize basename matches
        const aName = a.basename.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        const bName = b.basename.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        return aName - bName || a.basename.localeCompare(b.basename);
      })
      .map((f) => f.path.replace(/\.md$/, ""))
      .slice(0, 20);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  selectSuggestion(value: string): void {
    this.textInputEl.value = value;
    this.textInputEl.trigger("input");
    this.onChange(value);
    this.close();
  }
}

/**
 * Inline suggest for Lucide icon names.
 */
class IconSuggest extends AbstractInputSuggest<string> {
  private textInputEl: HTMLInputElement;
  private onChange: (value: string) => void;

  constructor(app: App, inputEl: HTMLInputElement, onChange: (value: string) => void) {
    super(app, inputEl);
    this.textInputEl = inputEl;
    this.onChange = onChange;
  }

  getSuggestions(query: string): string[] {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    return getIconIds()
      .filter((id) => id.toLowerCase().includes(lowerQuery))
      .sort((a, b) => {
        const aStart = a.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        const bStart = b.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        return aStart - bStart || a.localeCompare(b);
      })
      .slice(0, 30);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    const row = el.createDiv({ cls: "ttrpgmap-icon-suggest-row" });
    const iconEl = row.createDiv({ cls: "ttrpgmap-icon-suggest-icon" });
    setIcon(iconEl, value);
    row.createDiv({ cls: "ttrpgmap-icon-suggest-name", text: value });
  }

  selectSuggestion(value: string): void {
    this.textInputEl.value = value;
    this.textInputEl.trigger("input");
    this.onChange(value);
    this.close();
  }
}

/**
 * Modal for initial map configuration from an empty code block.
 * Writes YAML config back into the code block.
 */
export class ConfigureMapModal extends Modal {
  private plugin: TTRPGMapsPlugin;
  private onSave: (config: { image: string; height: string; width: string; zoomMin: number; zoomMax: number; zoomStep: number }) => void;
  private imagePath = "";
  private height = "";
  private width = "";
  private zoomMin = DEFAULT_MAP_CONFIG.zoomMin;
  private zoomMax = DEFAULT_MAP_CONFIG.zoomMax;
  private zoomStep = DEFAULT_MAP_CONFIG.zoomStep;

  constructor(
    app: App,
    plugin: TTRPGMapsPlugin,
    onSave: (config: { image: string; height: string; width: string; zoomMin: number; zoomMax: number; zoomStep: number }) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");

    contentEl.createEl("h2", { text: "Configure Map" });

    // Image picker with inline suggest
    new Setting(contentEl)
      .setName("Image")
      .setDesc("Search for a map image in your vault (required)")
      .addText((text) => {
        text
          .setPlaceholder("Search for an image...")
          .setValue(this.imagePath)
          .onChange((value) => (this.imagePath = value));
        new ImageSuggest(this.app, text.inputEl, (value) => {
          this.imagePath = value;
        });
      });

    new Setting(contentEl)
      .setName("Height")
      .setDesc("Display height (blank = auto from width/image)")
      .addText((text) =>
        text.setPlaceholder("e.g. 500 or 80%").onChange((value) => (this.height = value))
      );

    new Setting(contentEl)
      .setName("Width")
      .setDesc("Display width (blank = auto from height/image)")
      .addText((text) =>
        text.setPlaceholder("e.g. 800 or 100%").onChange((value) => (this.width = value))
      );

    contentEl.createEl("h3", { text: "Zoom" });

    new Setting(contentEl)
      .setName("Minimum Zoom %")
      .addText((text) =>
        text.setValue(String(this.zoomMin)).onChange((v) => (this.zoomMin = parseInt(v, 10) || 50))
      );

    new Setting(contentEl)
      .setName("Maximum Zoom %")
      .addText((text) =>
        text.setValue(String(this.zoomMax)).onChange((v) => (this.zoomMax = parseInt(v, 10) || 200))
      );

    new Setting(contentEl)
      .setName("Zoom Step %")
      .addText((text) =>
        text.setValue(String(this.zoomStep)).onChange((v) => (this.zoomStep = parseInt(v, 10) || 10))
      );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Create Map")
        .setCta()
        .onClick(() => {
          if (!this.imagePath) {
            new Notice("Please select an image first.");
            return;
          }
          this.onSave({
            image: this.imagePath,
            height: this.height,
            width: this.width,
            zoomMin: this.zoomMin,
            zoomMax: this.zoomMax,
            zoomStep: this.zoomStep,
          });
          this.close();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Modal for editing map-level settings (image, dimensions, zoom).
 * Opened via the gear button on the map or the "Configure Map" button.
 */
export class MapSettingsModal extends Modal {
  private plugin: TTRPGMapsPlugin;
  private config: MapConfig;
  private onSave: (config: MapConfig) => void;

  constructor(app: App, plugin: TTRPGMapsPlugin, config: MapConfig, onSave: (config: MapConfig) => void) {
    super(app);
    this.plugin = plugin;
    this.config = { ...config };
    this.onSave = onSave;
  }

  private loadImageDimensions(container: HTMLElement): void {
    container.empty();
    const file = this.app.vault.getFileByPath(this.config.image);
    if (!file) {
      container.setText("Image not found");
      return;
    }
    const resourcePath = this.app.vault.getResourcePath(file);
    const img = new Image();
    img.onload = () => {
      container.setText(`Native size: ${img.naturalWidth} × ${img.naturalHeight} px`);
    };
    img.onerror = () => {
      container.setText("Could not load image");
    };
    img.src = resourcePath;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");

    contentEl.createEl("h2", { text: "Map Settings" });

    // Pre-create the dimensions display so callbacks can reference it
    const imageDimsEl = contentEl.createDiv({ cls: "ttrpgmap-image-dims" });

    new Setting(contentEl)
      .setName("Image")
      .setDesc("Search for a map image in your vault")
      .addText((text) => {
        text
          .setPlaceholder("Search for an image...")
          .setValue(this.config.image)
          .onChange((value) => {
            this.config.image = value;
            this.loadImageDimensions(imageDimsEl);
          });
        new ImageSuggest(this.app, text.inputEl, (value) => {
          this.config.image = value;
          this.loadImageDimensions(imageDimsEl);
        });
      });

    // Move dims display below the image setting
    contentEl.appendChild(imageDimsEl);
    this.loadImageDimensions(imageDimsEl);

    new Setting(contentEl)
      .setName("Height")
      .setDesc("Display height (blank = auto from width/image)")
      .addText((text) =>
        text
          .setPlaceholder("e.g. 500 or 80%")
          .setValue(this.config.height ?? "")
          .onChange((value) => (this.config.height = value || null))
      );

    new Setting(contentEl)
      .setName("Width")
      .setDesc("Display width (blank = auto from height/image)")
      .addText((text) =>
        text
          .setPlaceholder("e.g. 800 or 100%")
          .setValue(this.config.width ?? "")
          .onChange((value) => (this.config.width = value || null))
      );

    contentEl.createEl("h3", { text: "Zoom" });

    new Setting(contentEl)
      .setName("Minimum Zoom")
      .setDesc("Minimum zoom level (%)")
      .addText((text) =>
        text
          .setValue(String(this.config.zoomMin))
          .onChange((value) => (this.config.zoomMin = parseInt(value, 10) || 50))
      );

    new Setting(contentEl)
      .setName("Maximum Zoom")
      .setDesc("Maximum zoom level (%)")
      .addText((text) =>
        text
          .setValue(String(this.config.zoomMax))
          .onChange((value) => (this.config.zoomMax = parseInt(value, 10) || 200))
      );

    new Setting(contentEl)
      .setName("Zoom Step")
      .setDesc("Amount to change per zoom increment (%)")
      .addText((text) =>
        text
          .setValue(String(this.config.zoomStep))
          .onChange((value) => (this.config.zoomStep = parseInt(value, 10) || 10))
      );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Save")
        .setCta()
        .onClick(() => {
          this.onSave(this.config);
          this.close();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Modal for editing a single marker's properties.
 * Opened via right-click > Edit on a marker.
 */
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
            this.onOpen(); // Re-render modal
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
          // Re-apply new template defaults to all template-controlled fields
          const newTemplate = this.plugin.settings.markerTemplates.find(
            (t) => t.name === value
          );
          if (newTemplate) {
            this.marker.direction = newTemplate.direction;
            this.marker.textPlacement = newTemplate.textPlacement;
            this.marker.color = newTemplate.color;
            this.marker.iconColor = newTemplate.iconColor;
          }
          this.onOpen(); // Re-render to show new defaults
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
          // Update preview
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

/**
 * Creates a marker pin preview element matching the template's color and direction.
 */
function createMarkerPreview(container: HTMLElement, template: MarkerTemplate): HTMLElement {
  const preview = container.createDiv({ cls: "ttrpgmap-template-preview" });
  const pin = preview.createDiv({ cls: "ttrpgmap-preview-pin" });

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 640 640");
  svg.setAttribute("class", "ttrpgmap-preview-svg");
  const path = document.createElementNS(svgNs, "path");
  path.setAttribute("d", "M320 64C214 64 128 148.4 128 252.6C128 371.9 248.2 514.9 298.4 569.4C310.2 582.2 329.8 582.2 341.6 569.4C391.8 514.9 512 371.9 512 252.6C512 148.4 426 64 320 64z");
  path.setAttribute("fill", template.color);
  path.setAttribute("stroke", "#000000");
  path.setAttribute("stroke-width", "16");
  svg.appendChild(path);
  pin.appendChild(svg);

  if (template.icon) {
    const iconEl = pin.createDiv({ cls: "ttrpgmap-preview-icon" });
    iconEl.style.color = template.iconColor;
    setIcon(iconEl, template.icon);
  }
  return preview;
}

/**
 * Modal for editing a single template's properties.
 */
class TemplateEditModal extends Modal {
  private plugin: TTRPGMapsPlugin;
  private template: MarkerTemplate;
  private onSaved: () => void;

  constructor(app: App, plugin: TTRPGMapsPlugin, template: MarkerTemplate, onSaved: () => void) {
    super(app);
    this.plugin = plugin;
    this.template = template;
    this.onSaved = onSaved;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");

    contentEl.createEl("h2", { text: "Edit Template" });

    new Setting(contentEl)
      .setName("Name")
      .addText((text) =>
        text.setValue(this.template.name).onChange((value) => {
          this.template.name = value;
        })
      );

    new Setting(contentEl)
      .setName("Direction")
      .addDropdown((dropdown) => {
        dropdown.addOption("up", "Up");
        dropdown.addOption("down", "Down");
        dropdown.addOption("left", "Left");
        dropdown.addOption("right", "Right");
        dropdown.setValue(this.template.direction);
        dropdown.onChange((value) => {
          this.template.direction = value as MarkerTemplate["direction"];
        });
      });

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

    const colorSetting = new Setting(contentEl).setName("Color");
    const colorInput = colorSetting.controlEl.createEl("input", { cls: "ttrpgmap-color-picker" });
    colorInput.type = "color";
    colorInput.value = this.template.color;
    colorInput.addEventListener("input", (e) => {
      this.template.color = (e.target as HTMLInputElement).value;
    });

    const iconSetting = new Setting(contentEl)
      .setName("Icon")
      .setDesc("Lucide icon name (leave blank for none)")
      .addText((text) => {
        text
          .setPlaceholder("Search for an icon...")
          .setValue(this.template.icon ?? "")
          .onChange((value) => (this.template.icon = value || null));
        new IconSuggest(this.app, text.inputEl, (value) => {
          this.template.icon = value || null;
          tplIconPreview.empty();
          if (value) setIcon(tplIconPreview, value);
        });
      });
    const tplIconPreview = iconSetting.controlEl.createDiv({ cls: "ttrpgmap-icon-preview" });
    if (this.template.icon) setIcon(tplIconPreview, this.template.icon);

    const iconColorSetting = new Setting(contentEl).setName("Icon Color");
    const iconColorInput = iconColorSetting.controlEl.createEl("input", { cls: "ttrpgmap-color-picker" });
    iconColorInput.type = "color";
    iconColorInput.value = this.template.iconColor;
    iconColorInput.addEventListener("input", (e) => {
      this.template.iconColor = (e.target as HTMLInputElement).value;
    });

    // Apply to all markers button
    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText("Apply to All Markers").setWarning().onClick(() => {
        // TODO: Prompt confirmation, then update all markers using this template
      })
    );

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
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Renders the marker templates UI into a container element.
 * Shared between the plugin settings tab and the standalone modal.
 */
function renderTemplateManager(
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
      name: `Template ${plugin.settings.markerTemplates.length}`,
      note: null,
      description: null,
      direction: "down",
      textPlacement: "above",
      color: "#ffffff",
      icon: null,
      iconColor: "#000000",
    };
    plugin.settings.markerTemplates.push(newTemplate);
    plugin.dataManager.saveSettings(plugin.settings);
    rerender();
  });

  for (const template of plugin.settings.markerTemplates) {
    const isDefault = template.name === "Default";

    const row = container.createDiv({ cls: "setting-item" });

    const info = row.createDiv({ cls: "setting-item-info" });
    const nameRow = info.createDiv({ cls: "setting-item-name ttrpgmap-template-name-row" });

    // Pin preview
    createMarkerPreview(nameRow, template);
    nameRow.createSpan({ text: template.name });

    if (!isDefault) {
      const control = row.createDiv({ cls: "setting-item-control" });

      // Edit button
      const editBtn = control.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Edit template" } });
      setIcon(editBtn, "pencil");
      editBtn.addEventListener("click", () => {
        new TemplateEditModal(plugin.app, plugin, template, rerender).open();
      });

      // Delete button
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

/**
 * Plugin settings tab shown in Obsidian Settings.
 */
export class TTRPGMapsSettingTab extends PluginSettingTab {
  private plugin: TTRPGMapsPlugin;

  constructor(app: App, plugin: TTRPGMapsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "TTRPG Maps" });

    const templatesContainer = containerEl.createDiv();
    const rerender = () => renderTemplateManager(templatesContainer, this.plugin, rerender);
    rerender();
  }
}

/**
 * Modal for managing marker templates (plugin-wide settings).
 */
export class TemplateManagerModal extends Modal {
  private plugin: TTRPGMapsPlugin;

  constructor(app: App, plugin: TTRPGMapsPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");

    const rerender = () => {
      contentEl.empty();
      contentEl.addClass("ttrpgmap-modal");
      renderTemplateManager(contentEl, this.plugin, rerender);
    };
    rerender();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Modal for entering distance units after drawing a calibration line.
 */
export class ScaleCalibrationModal extends Modal {
  private units = 0;
  private unitLabel = "units";
  private onSave: (units: number, unitLabel: string) => void;

  constructor(app: App, pixelDist: number, onSave: (units: number, unitLabel: string) => void) {
    super(app);
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ttrpgmap-modal");

    contentEl.createEl("h2", { text: "Set Distance Scale" });
    contentEl.createEl("p", { text: "You drew a reference line on the map. How many units does it represent?" });

    new Setting(contentEl)
      .setName("Distance")
      .setDesc("How many units does this line represent?")
      .addText((text) =>
        text
          .setPlaceholder("e.g. 100")
          .onChange((value) => (this.units = parseFloat(value) || 0))
      );

    new Setting(contentEl)
      .setName("Unit Label")
      .setDesc("e.g. feet, miles, km, meters")
      .addText((text) =>
        text
          .setPlaceholder("units")
          .setValue(this.unitLabel)
          .onChange((value) => (this.unitLabel = value || "units"))
      );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Save Scale")
        .setCta()
        .onClick(() => {
          if (this.units <= 0) {
            new Notice("Please enter a positive distance.");
            return;
          }
          this.onSave(this.units, this.unitLabel);
          this.close();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
