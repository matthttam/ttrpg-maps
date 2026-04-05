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

    containerEl.createEl("h2", { text: "TTRPG Maps" });

    // ── Marker Settings ──
    containerEl.createEl("h3", { text: "Markers" });

    const markerScaleSetting = new Setting(containerEl)
      .setName("Default Marker Scale")
      .setDesc("Visual size of markers on all maps (%)");

    buildScaleSlider({
      setting: markerScaleSetting,
      value: this.plugin.settings.defaultMarkerScale ?? DEFAULT_MARKER_SCALE,
      onChange: async (value) => {
        this.plugin.settings.defaultMarkerScale = value;
        await this.plugin.dataManager.saveSettings(this.plugin.settings);
        this.plugin.triggerMapRefresh();
      },
    });

    new Setting(containerEl)
      .setName("Scale Markers to Zoom")
      .setDesc("Screen-constant keeps markers the same size on screen. Fixed to map makes markers shrink when zoomed out and grow when zoomed in.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("screen", "Screen-constant")
          .addOption("map", "Fixed to map")
          .setValue((this.plugin.settings.defaultScaleMarkersToZoom ?? true) ? "screen" : "map")
          .onChange(async (value) => {
            this.plugin.settings.defaultScaleMarkersToZoom = value === "screen";
            await this.plugin.dataManager.saveSettings(this.plugin.settings);
            this.plugin.triggerMapRefresh();
          });
      });

    // ── Text Settings ──
    containerEl.createEl("h3", { text: "Text" });

    const textScaleSetting = new Setting(containerEl)
      .setName("Default Text Scale")
      .setDesc("Visual size of marker text labels on all maps (%)");

    buildScaleSlider({
      setting: textScaleSetting,
      value: this.plugin.settings.defaultMarkerTextScale ?? DEFAULT_MARKER_TEXT_SCALE,
      onChange: async (value) => {
        this.plugin.settings.defaultMarkerTextScale = value;
        await this.plugin.dataManager.saveSettings(this.plugin.settings);
        this.plugin.triggerMapRefresh();
      },
    });

    new Setting(containerEl)
      .setName("Scale Text to Zoom")
      .setDesc("Screen-constant keeps text the same size on screen. Fixed to map makes text shrink when zoomed out and grow when zoomed in.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("screen", "Screen-constant")
          .addOption("map", "Fixed to map")
          .setValue((this.plugin.settings.defaultScaleMarkerTextToZoom ?? true) ? "screen" : "map")
          .onChange(async (value) => {
            this.plugin.settings.defaultScaleMarkerTextToZoom = value === "screen";
            await this.plugin.dataManager.saveSettings(this.plugin.settings);
            this.plugin.triggerMapRefresh();
          });
      });

    // ── Marker Templates ──
    const templatesContainer = containerEl.createDiv();
    const rerender = () => renderTemplateManager(templatesContainer, this.plugin, rerender);
    rerender();
  }
}
