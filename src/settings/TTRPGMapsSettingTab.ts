import { App, PluginSettingTab, Setting } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { DEFAULT_MARKER_SCALE, DEFAULT_MARKER_TEXT_SCALE } from "../types";
import { renderTemplateManager } from "./renderTemplateManager";

/** Build a scale setting with a linked slider + text input (both update each other). */
function addScaleSliderAndText(
  setting: Setting,
  initialValue: number,
  onChange: (value: number) => void,
): void {
  let sliderRef: { setValue: (v: number) => any } | null = null;
  let textRef: { setValue: (v: string) => any } | null = null;

  setting.addSlider((slider) => {
    sliderRef = slider;
    slider
      .setLimits(25, 300, 5)
      .setValue(Math.round(initialValue * 100))
      .onChange((value) => {
        if (textRef) textRef.setValue(String(value));
        onChange(value / 100);
      });
  });

  setting.addText((text) => {
    textRef = text;
    text.inputEl.type = "number";
    text.inputEl.min = "25";
    text.inputEl.max = "300";
    text.inputEl.step = "5";
    text.inputEl.addClass("ttrpgmap-scale-input");
    text
      .setValue(String(Math.round(initialValue * 100)))
      .onChange((value) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num >= 25 && num <= 300) {
          if (sliderRef) sliderRef.setValue(num);
          onChange(num / 100);
        }
      });
  });
}

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

    addScaleSliderAndText(
      markerScaleSetting,
      this.plugin.settings.defaultMarkerScale ?? DEFAULT_MARKER_SCALE,
      async (value) => {
        this.plugin.settings.defaultMarkerScale = value;
        await this.plugin.dataManager.saveSettings(this.plugin.settings);
        this.plugin.triggerMapRefresh();
      },
    );

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

    addScaleSliderAndText(
      textScaleSetting,
      this.plugin.settings.defaultMarkerTextScale ?? DEFAULT_MARKER_TEXT_SCALE,
      async (value) => {
        this.plugin.settings.defaultMarkerTextScale = value;
        await this.plugin.dataManager.saveSettings(this.plugin.settings);
        this.plugin.triggerMapRefresh();
      },
    );

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
