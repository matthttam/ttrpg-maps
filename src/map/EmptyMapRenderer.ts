import { MarkdownRenderChild } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { ConfigureMapModal } from "../modals/ConfigureMapModal";
import { serializeMapConfig, writeConfigToCodeBlock } from "../utils/configSerializer";

export class EmptyMapRenderer extends MarkdownRenderChild {
  private plugin: TTRPGMapsPlugin;
  private sectionInfo: { lineStart: number; lineEnd: number } | null;
  private sourcePath: string;

  constructor(containerEl: HTMLElement, plugin: TTRPGMapsPlugin, sourcePath: string, sectionInfo: { lineStart: number; lineEnd: number } | null) {
    super(containerEl);
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.sectionInfo = sectionInfo;
  }

  onload(): void {
    const el = this.containerEl;
    el.empty();
    el.addClass("ttrpgmap-root");

    const placeholder = el.createDiv({ cls: "ttrpgmap-placeholder" });
    placeholder.createDiv({ cls: "ttrpgmap-placeholder-text", text: "TTRPG Map" });

    const btn = placeholder.createEl("button", {
      cls: "ttrpgmap-configure-btn",
      text: "Configure Map",
    });
    btn.addEventListener("click", () => {
      new ConfigureMapModal(this.plugin.app, this.plugin, (config) => {
        if (!this.sectionInfo) return;
        const lines = serializeMapConfig(config);
        writeConfigToCodeBlock(this.plugin.app, this.sourcePath, this.sectionInfo, lines);
      }).open();
    });
  }
}
