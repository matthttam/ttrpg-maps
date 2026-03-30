import { Plugin } from "obsidian";
import { TTRPGMapsSettings, DEFAULT_SETTINGS } from "./types";
import { DataManager } from "./DataManager";
import { MapRenderer } from "./map/MapRenderer";
import { EmptyMapRenderer } from "./map/EmptyMapRenderer";
import { TTRPGMapsSettingTab } from "./settings/TTRPGMapsSettingTab";
import { parseMapConfig } from "./utils/configSerializer";
import { generateMapId } from "./utils/mapId";

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
        id: partial.id || generateMapId(partial.image),
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
}
