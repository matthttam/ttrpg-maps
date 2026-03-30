import { Plugin } from "obsidian";
import { TTRPGMapsSettings, DEFAULT_SETTINGS } from "./types";
import { DataManager } from "./DataManager";
import { MapRenderer, EmptyMapRenderer, parseMapConfig } from "./MapRenderer";
import { TTRPGMapsSettingTab } from "./SettingsModal";

export default class TTRPGMapsPlugin extends Plugin {
  settings: TTRPGMapsSettings = DEFAULT_SETTINGS;
  dataManager: DataManager = null!;

  async onload(): Promise<void> {
    this.dataManager = new DataManager(this.app, this);
    this.settings = await this.dataManager.loadSettings();
    this.addSettingTab(new TTRPGMapsSettingTab(this.app, this));

    this.registerMarkdownCodeBlockProcessor("ttrpgmap", (source, el, ctx) => {
      const partial = parseMapConfig(source);

      if (!partial.image) {
        const sectionInfo = ctx.getSectionInfo(el);
        const renderer = new EmptyMapRenderer(
          el,
          this,
          ctx.sourcePath,
          sectionInfo ? { lineStart: sectionInfo.lineStart, lineEnd: sectionInfo.lineEnd } : null
        );
        ctx.addChild(renderer);
        return;
      }

      const config = {
        id: partial.id || this.generateMapId(partial.image),
        image: partial.image,
        height: partial.height ?? null,
        width: partial.width ?? null,
        zoomMin: partial.zoomMin ?? 50,
        zoomMax: partial.zoomMax ?? 200,
        zoomStep: partial.zoomStep ?? 10,
      };

      const sectionInfo = ctx.getSectionInfo(el);
      const renderer = new MapRenderer(
        el,
        this,
        config,
        ctx.sourcePath,
        sectionInfo ? { lineStart: sectionInfo.lineStart, lineEnd: sectionInfo.lineEnd } : null
      );
      ctx.addChild(renderer);
    });
  }

  onunload(): void {}

  private generateMapId(imagePath: string): string {
    let hash = 0;
    for (let i = 0; i < imagePath.length; i++) {
      const char = imagePath.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return "map_" + Math.abs(hash).toString(36);
  }
}
