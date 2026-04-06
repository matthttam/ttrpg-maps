import { App, PluginSettingTab, Setting } from "obsidian";
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
          .setValue(this.plugin.settings.openLinksInNewTab ?? true)
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

    // ── Support ──
    new Setting(containerEl).setName("Support").setHeading();
    new Setting(containerEl)
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- TTRPG is an acronym
      .setName("Enjoy TTRPG maps?")
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
