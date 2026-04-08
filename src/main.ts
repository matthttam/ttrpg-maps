import { Plugin, normalizePath } from 'obsidian';
import { TTRPGMapsSettings, DEFAULT_SETTINGS } from './types';
import { DataManager } from './DataManager';
import { MapRenderer } from './map/MapRenderer';
import { EmptyMapRenderer } from './map/EmptyMapRenderer';
import { TTRPGMapsSettingTab } from './settings/TTRPGMapsSettingTab';
import { parseMapConfig } from './utils/configSerializer';
import { generateMapId } from './utils/mapId';
import { loadGameIcons, isGameIconsLoaded, extractAndLoadGameIcons } from './utils/mapIcon';

export default class TTRPGMapsPlugin extends Plugin {
	settings: TTRPGMapsSettings = DEFAULT_SETTINGS;
	dataManager: DataManager = null!;

	/** Callbacks registered by active MapRenderers to refresh when marker data changes */
	private mapRefreshCallbacks: Set<() => void> = new Set();

	onMapRefresh(cb: () => void): void {
		this.mapRefreshCallbacks.add(cb);
	}
	offMapRefresh(cb: () => void): void {
		this.mapRefreshCallbacks.delete(cb);
	}
	triggerMapRefresh(): void {
		this.mapRefreshCallbacks.forEach((cb) => cb());
	}

	async onload(): Promise<void> {
		this.dataManager = new DataManager(this.app, this);
		this.settings = await this.dataManager.loadSettings();
		this.addSettingTab(new TTRPGMapsSettingTab(this.app, this));

		// Load Game Icons JSON from plugin directory, or extract from embedded data
		const adapter = this.app.vault.adapter;
		const giFile = 'gi-icons.json';
		const read = (p: string) => adapter.read(p);
		const write = (p: string, data: string) => adapter.write(p, data);
		const manifestPath = normalizePath(`${this.manifest.dir}/${giFile}`);
		const fallbackPath = normalizePath(`.obsidian/plugins/${this.manifest.id}/${giFile}`);
		await loadGameIcons(manifestPath, read);
		if (!isGameIconsLoaded()) {
			await loadGameIcons(fallbackPath, read);
		}
		if (!isGameIconsLoaded()) {
			await extractAndLoadGameIcons(manifestPath, write);
		}

		this.registerHoverLinkSource('ttrpg-maps', {
			display: 'TTRPG Maps',
			defaultMod: false,
		});

		this.registerMarkdownCodeBlockProcessor('ttrpgmap', (source, el, ctx) => {
			const partial = parseMapConfig(source);

			if (!partial.image) {
				const sectionInfo = ctx.getSectionInfo(el);
				const renderer = new EmptyMapRenderer(
					el,
					this,
					ctx.sourcePath,
					sectionInfo ? { lineStart: sectionInfo.lineStart, lineEnd: sectionInfo.lineEnd } : null,
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
				sectionInfo ? { lineStart: sectionInfo.lineStart, lineEnd: sectionInfo.lineEnd } : null,
			);
			ctx.addChild(renderer);
		});
	}

	onunload(): void {}
}
