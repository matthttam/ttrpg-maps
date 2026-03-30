import { App, PluginSettingTab } from "obsidian";
import type TTRPGMapsPlugin from "../main";
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

    const templatesContainer = containerEl.createDiv();
    const rerender = () => renderTemplateManager(templatesContainer, this.plugin, rerender);
    rerender();
  }
}
