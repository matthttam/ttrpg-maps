import { App, Modal, PluginSettingTab, Setting } from 'obsidian';
import { confirmAction } from '../utils/confirmModal';
import type TTRPGMapsPlugin from '../main';
import {
	DEFAULT_MARKER_SCALE,
	DEFAULT_MARKER_TEXT_SCALE,
	MarkerFont,
	TextVisibility,
	TTRPGMapsSettings,
} from '../types';
import { buildScaleSlider, buildPercentSlider, buildFontDropdown } from '../modals/sharedFields';
import { renderTemplateManager } from './renderTemplateManager';

export class TTRPGMapsSettingTab extends PluginSettingTab {
	private plugin: TTRPGMapsPlugin;

	constructor(app: App, plugin: TTRPGMapsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.buildMarkersSection(containerEl);
		this.buildTextSection(containerEl);
		this.buildNavigationSection(containerEl);
		this.buildControlsSection(containerEl);
		this.buildTemplatesSection(containerEl);
		this.buildDataManagementSection(containerEl);
		this.buildSupportSection(containerEl);
	}

	/** Save settings and optionally refresh all maps */
	private save(refresh = false): void {
		void this.plugin.dataManager.saveSettings(this.plugin.settings);
		if (refresh) this.plugin.triggerMapRefresh();
	}

	/** Add a toggle setting that writes to a boolean field on plugin settings */
	private addToggle(
		container: HTMLElement,
		name: string,
		desc: string,
		field: keyof TTRPGMapsSettings,
		defaultValue: boolean,
		refresh = false,
	): void {
		new Setting(container)
			.setName(name)
			.setDesc(desc)
			.addToggle((toggle) => {
				toggle.setValue((this.plugin.settings[field] as boolean | undefined) ?? defaultValue).onChange((value) => {
					(this.plugin.settings as unknown as Record<string, unknown>)[field] = value;
					this.save(refresh);
				});
			});
	}

	private buildMarkersSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Markers').setHeading();

		const scaleSetting = new Setting(containerEl)
			.setName('Default marker scale')
			.setDesc('Visual size of markers on all maps (%)');
		buildScaleSlider({
			setting: scaleSetting,
			value: this.plugin.settings.defaultMarkerScale ?? DEFAULT_MARKER_SCALE,
			onChange: (value) => {
				this.plugin.settings.defaultMarkerScale = value;
				this.save(true);
			},
		});

		new Setting(containerEl)
			.setName('Scale markers to zoom')
			.setDesc(
				'Screen-constant keeps markers the same size on screen. Fixed to map makes markers shrink when zoomed out and grow when zoomed in.',
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption('screen', 'Screen-constant')
					.addOption('map', 'Fixed to map')
					.setValue((this.plugin.settings.defaultScaleMarkersToZoom ?? true) ? 'screen' : 'map')
					.onChange((value) => {
						this.plugin.settings.defaultScaleMarkersToZoom = value === 'screen';
						this.save(true);
					});
			});

		new Setting(containerEl)
			.setName('Max rendered markers')
			.setDesc('Maximum number of markers rendered at once. Reduces lag on maps with many markers.')
			.addText((text) => {
				text
					.setValue(String(this.plugin.settings.maxRenderedMarkers ?? 200))
					.setPlaceholder('200')
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxRenderedMarkers = num;
							this.save(true);
						}
					});
				text.inputEl.type = 'number';
				text.inputEl.min = '1';
				text.inputEl.step = '1';
			});
	}

	private buildTextSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Text').setHeading();

		const scaleSetting = new Setting(containerEl)
			.setName('Default text scale')
			.setDesc('Visual size of marker text labels on all maps (%)');
		buildScaleSlider({
			setting: scaleSetting,
			value: this.plugin.settings.defaultMarkerTextScale ?? DEFAULT_MARKER_TEXT_SCALE,
			onChange: (value) => {
				this.plugin.settings.defaultMarkerTextScale = value;
				this.save(true);
			},
		});

		new Setting(containerEl)
			.setName('Scale text to zoom')
			.setDesc(
				'Screen-constant keeps text the same size on screen. Fixed to map makes text shrink when zoomed out and grow when zoomed in.',
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption('screen', 'Screen-constant')
					.addOption('map', 'Fixed to map')
					.setValue((this.plugin.settings.defaultScaleMarkerTextToZoom ?? true) ? 'screen' : 'map')
					.onChange((value) => {
						this.plugin.settings.defaultScaleMarkerTextToZoom = value === 'screen';
						this.save(true);
					});
			});

		const fontSetting = new Setting(containerEl)
			.setName('Default label font')
			.setDesc('Font family used for marker labels on all maps');
		buildFontDropdown({
			setting: fontSetting,
			value: this.plugin.settings.defaultMarkerFont ?? 'default',
			onChange: (value) => {
				this.plugin.settings.defaultMarkerFont = value === 'default' ? undefined : (value as MarkerFont);
				this.save(true);
			},
		});

		new Setting(containerEl)
			.setName('Default text visibility')
			.setDesc('Control whether marker labels are shown on all maps')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('visible', 'Always visible')
					.addOption('hover', 'Mouseover only')
					.addOption('hidden', 'Hidden')
					.setValue(this.plugin.settings.defaultTextVisibility ?? 'visible')
					.onChange((value) => {
						this.plugin.settings.defaultTextVisibility = value === 'visible' ? undefined : (value as TextVisibility);
						this.save(true);
					});
			});
	}

	private buildNavigationSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Navigation').setHeading();

		this.addToggle(
			containerEl,
			'Open links in new tab',
			'When clicking a marker with a linked note, open it in a new tab instead of replacing the current one.',
			'openLinksInNewTab',
			false,
		);

		this.addToggle(
			containerEl,
			'Show hover preview',
			'Show a page preview when hovering over markers with linked notes.',
			'showHoverPreview',
			false,
		);
	}

	private buildControlsSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Controls').setHeading();

		this.addToggle(
			containerEl,
			'Show measurement tools',
			'Show the distance measurement panel on maps',
			'showMeasurementTools',
			true,
			true,
		);
		this.addToggle(
			containerEl,
			'Show zoom controls',
			'Show zoom buttons, center, fit, and lock toggles on maps',
			'showZoomControls',
			true,
			true,
		);
		this.addToggle(
			containerEl,
			'Show marker list',
			'Show the marker list tab in the bottom-left panel',
			'showMarkerList',
			true,
			true,
		);
		this.addToggle(
			containerEl,
			'Show layer list',
			'Show the layer list tab in the bottom-left panel',
			'showLayerList',
			true,
			true,
		);
		this.addToggle(
			containerEl,
			'Show map settings button',
			'Show the gear button on maps. When hidden, map settings are accessible from the right-click menu.',
			'showMapSettings',
			true,
			true,
		);

		const opacitySetting = new Setting(containerEl)
			.setName('Control opacity')
			.setDesc('Resting opacity of map controls (%)');
		buildPercentSlider({
			setting: opacitySetting,
			value: this.plugin.settings.defaultControlOpacity ?? 50,
			onChange: (value) => {
				this.plugin.settings.defaultControlOpacity = value;
				this.save(true);
			},
		});
	}

	private buildTemplatesSection(containerEl: HTMLElement): void {
		const templatesContainer = containerEl.createDiv();
		const rerender = () => renderTemplateManager(templatesContainer, this.plugin, rerender);
		rerender();
	}

	private buildDataManagementSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Data management').setHeading();
		new Setting(containerEl)
			.setName('Manage map data')
			.setDesc('View and delete stored map data (markers, layers, scale, settings)')
			.addButton((btn) => {
				btn
					.setButtonText('Manage map data')
					.setWarning()
					.onClick(() => {
						new MapDataModal(this.app, this.plugin).open();
					});
			});
	}

	private buildSupportSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Support').setHeading();
		new Setting(containerEl)
			.setName('Enjoying this plugin?')
			.setDesc('If this plugin is useful to you, consider buying me a coffee!')
			.addButton((button) => {
				button
					.setButtonText('Buy me a coffee')
					.setCta()
					.onClick(() => {
						window.open('https://buymeacoffee.com/matthttam');
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
		this.modalEl.addClass('ttrpgmap-modal--wide');
		void this.renderList();
	}

	private async renderList(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		const group = contentEl.createDiv({ cls: 'setting-group' });
		new Setting(group).setName('Map data').setHeading();
		const items = group.createDiv({ cls: 'setting-items' });

		const states = await this.plugin.dataManager.loadAllMapStates();

		if (states.length === 0) {
			items.createEl('p', { text: 'No map data found.' });
			return;
		}

		for (const state of states) {
			const markerCount = state.markers.length;
			const layerCount = state.layers.length;

			const parts: string[] = [];
			parts.push(
				`${markerCount} marker${markerCount !== 1 ? 's' : ''}, ${layerCount} layer${layerCount !== 1 ? 's' : ''}`,
			);
			if (state.lastImagePath) parts.push(`Last image used: ${state.lastImagePath}`);
			if (state.lastSourcePath) parts.push(`Last known path: ${state.lastSourcePath}`);

			const setting = new Setting(items).setName(state.mapId);

			// Build description with line breaks
			const descEl = setting.descEl;
			parts.forEach((part, i) => {
				if (i > 0) descEl.createEl('br');
				descEl.appendText(part);
			});

			setting.addButton((btn) => {
				btn
					.setButtonText('Delete')
					.setWarning()
					.onClick(() => {
						const msg = `This will permanently delete all data for map "${state.mapId}" including ${markerCount} marker${markerCount !== 1 ? 's' : ''} and ${layerCount} layer${layerCount !== 1 ? 's' : ''}. This cannot be undone.`;
						void confirmAction(this.app, 'Delete map data', msg, 'Delete').then((confirmed) => {
							if (!confirmed) return;
							void (async () => {
								await this.plugin.dataManager.deleteMapState(state.mapId);
								this.plugin.triggerMapRefresh();
								await this.renderList();
							})();
						});
					});
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
