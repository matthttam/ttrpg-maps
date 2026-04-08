import { App, Modal, PluginSettingTab, Setting } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { DEFAULT_MARKER_SCALE, DEFAULT_MARKER_TEXT_SCALE } from "../types";
import { buildScaleSlider } from "../modals/sharedFields";
import { renderTemplateManager } from "./renderTemplateManager";

export class TTRPGMapsSettingTab extends PluginSettingTab {
  private plugin: TTRPGMapsPlugin;

  constructor(app: App, plugin: TTRPGMapsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Marker Settings ──
    new Setting(containerEl).setName("Markers").setHeading();

    const markerScaleSetting = new Setting(containerEl)
      .setName("Default marker scale")
      .setDesc("Visual size of markers on all maps (%)");

    buildScaleSlider({
      setting: markerScaleSetting,
      value: this.plugin.settings.defaultMarkerScale ?? DEFAULT_MARKER_SCALE,
      onChange: (value) => {
        this.plugin.settings.defaultMarkerScale = value;
        void this.plugin.dataManager.saveSettings(this.plugin.settings);
        this.plugin.triggerMapRefresh();
      },
    });

    new Setting(containerEl)
      .setName("Scale markers to zoom")
      .setDesc("Screen-constant keeps markers the same size on screen. Fixed to map makes markers shrink when zoomed out and grow when zoomed in.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("screen", "Screen-constant")
          .addOption("map", "Fixed to map")
          .setValue((this.plugin.settings.defaultScaleMarkersToZoom ?? true) ? "screen" : "map")
          .onChange((value) => {
            this.plugin.settings.defaultScaleMarkersToZoom = value === "screen";
            void this.plugin.dataManager.saveSettings(this.plugin.settings);
            this.plugin.triggerMapRefresh();
          });
      });

    // ── Text Settings ──
    new Setting(containerEl).setName("Text").setHeading();

    const textScaleSetting = new Setting(containerEl)
      .setName("Default text scale")
      .setDesc("Visual size of marker text labels on all maps (%)");

    buildScaleSlider({
      setting: textScaleSetting,
      value: this.plugin.settings.defaultMarkerTextScale ?? DEFAULT_MARKER_TEXT_SCALE,
      onChange: (value) => {
        this.plugin.settings.defaultMarkerTextScale = value;
        void this.plugin.dataManager.saveSettings(this.plugin.settings);
        this.plugin.triggerMapRefresh();
      },
    });

    new Setting(containerEl)
      .setName("Scale text to zoom")
      .setDesc("Screen-constant keeps text the same size on screen. Fixed to map makes text shrink when zoomed out and grow when zoomed in.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("screen", "Screen-constant")
          .addOption("map", "Fixed to map")
          .setValue((this.plugin.settings.defaultScaleMarkerTextToZoom ?? true) ? "screen" : "map")
          .onChange((value) => {
            this.plugin.settings.defaultScaleMarkerTextToZoom = value === "screen";
            void this.plugin.dataManager.saveSettings(this.plugin.settings);
            this.plugin.triggerMapRefresh();
          });
      });

    // ── Navigation ──
    new Setting(containerEl).setName("Navigation").setHeading();

    new Setting(containerEl)
      .setName("Open links in new tab")
      .setDesc("When clicking a marker with a linked note, open it in a new tab instead of replacing the current one.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.openLinksInNewTab ?? false)
          .onChange((value) => {
            this.plugin.settings.openLinksInNewTab = value;
            void this.plugin.dataManager.saveSettings(this.plugin.settings);
          });
      });

    new Setting(containerEl)
      .setName("Show hover preview")
      .setDesc("Show a page preview when hovering over markers with linked notes.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showHoverPreview ?? false)
          .onChange((value) => {
            this.plugin.settings.showHoverPreview = value;
            void this.plugin.dataManager.saveSettings(this.plugin.settings);
          });
      });

    // ── Marker Templates ──
    const templatesContainer = containerEl.createDiv();
    const rerender = () => renderTemplateManager(templatesContainer, this.plugin, rerender);
    rerender();

    // ── Data management ──
    new Setting(containerEl).setName("Data management").setHeading();
    new Setting(containerEl)
      .setName("Manage map data")
      .setDesc("View and delete stored map data (markers, layers, scale, settings)")
      .addButton((btn) => {
        btn
          .setButtonText("Manage map data")
          .setWarning()
          .onClick(() => {
            new MapDataModal(this.app, this.plugin).open();
          });
      });

    // ── Support ──
    new Setting(containerEl).setName("Support").setHeading();
    new Setting(containerEl)
      .setName("Enjoying this plugin?")
      .setDesc("If this plugin is useful to you, consider buying me a coffee!")
      .addButton((button) => {
        button
          .setButtonText("Buy me a coffee")
          .setCta()
          .onClick(() => {
            window.open("https://buymeacoffee.com/matthttam");
          });
      });
  }
}

class MapDataModal extends Modal {
  private plugin: TTRPGMapsPlugin;

  constructor(app: App, plugin: TTRPGMapsPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.modalEl.addClass("ttrpgmap-modal--wide");
    void this.renderList();
  }

  private async renderList(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    const group = contentEl.createDiv({ cls: "setting-group" });
    new Setting(group).setName("Map data").setHeading();
    const items = group.createDiv({ cls: "setting-items" });

    const states = await this.plugin.dataManager.loadAllMapStates();

    if (states.length === 0) {
      items.createEl("p", { text: "No map data found." });
      return;
    }

    for (const state of states) {
      const markerCount = state.markers.length;
      const layerCount = state.layers.length;

      const parts: string[] = [];
      parts.push(`${markerCount} marker${markerCount !== 1 ? "s" : ""}, ${layerCount} layer${layerCount !== 1 ? "s" : ""}`);
      if (state.lastImagePath) parts.push(`Last image used: ${state.lastImagePath}`);
      if (state.lastSourcePath) parts.push(`Last known path: ${state.lastSourcePath}`);

      const setting = new Setting(items)
        .setName(state.mapId);

      // Build description with line breaks
      const descEl = setting.descEl;
      parts.forEach((part, i) => {
        if (i > 0) descEl.createEl("br");
        descEl.appendText(part);
      });

      setting.addButton((btn) => {
          btn
            .setButtonText("Delete")
            .setWarning()
            .onClick(() => {
              const confirmModal = new Modal(this.app);
              confirmModal.titleEl.setText("Delete map data");
              confirmModal.contentEl.createEl("p", {
                text: `This will permanently delete all data for map "${state.mapId}" including ${markerCount} marker${markerCount !== 1 ? "s" : ""} and ${layerCount} layer${layerCount !== 1 ? "s" : ""}. This cannot be undone.`,
              });
              new Setting(confirmModal.contentEl)
                .addButton((b) => b.setButtonText("Cancel").onClick(() => confirmModal.close()))
                .addButton((b) => b.setButtonText("Delete").setWarning().onClick(() => {
                  void (async () => {
                    await this.plugin.dataManager.deleteMapState(state.mapId);
                    this.plugin.triggerMapRefresh();
                    confirmModal.close();
                    await this.renderList();
                  })();
                }));
              confirmModal.open();
            });
        });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
