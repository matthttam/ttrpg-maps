import { App, Modal, Setting, setIcon } from 'obsidian';
import { confirmAction } from '../utils/confirmModal';
import type TTRPGMapsPlugin from '../main';
import {
	MapConfig,
	MapState,
	MarkerLayer,
	DEFAULT_LAYER,
	DEFAULT_LAYER_ID,
	DEFAULT_MARKER_SCALE,
	DEFAULT_MARKER_TEXT_SCALE,
	MARKER_FONT_LABELS,
	MarkerFont,
} from '../types';
import { ImageSuggest } from '../suggests/ImageSuggest';
import { LayerEditModal } from './LayerEditModal';
import { buildScaleSlider, buildPercentSlider } from './sharedFields';
import { exportMap } from '../utils/mapExport';

/** Persists collapsed/expanded state for each section across modal opens */
const sectionExpanded = new WeakMap<App, Record<string, boolean>>();

export class MapSettingsModal extends Modal {
	private plugin: TTRPGMapsPlugin;
	private config: MapConfig;
	private state: MapState;
	private originalConfig: string;
	private originalState: string;
	private _idTextEl: HTMLInputElement | null = null;
	private onSave: (config: MapConfig, state: MapState) => void;
	private onIdChanged: (oldId: string, newId: string, action: 'migrate' | 'copy' | 'delete' | 'orphan') => void;
	private saved = false;

	constructor(
		app: App,
		plugin: TTRPGMapsPlugin,
		config: MapConfig,
		state: MapState,
		onSave: (config: MapConfig, state: MapState) => void,
		onIdChanged: (oldId: string, newId: string, action: 'migrate' | 'copy' | 'delete' | 'orphan') => void,
	) {
		super(app);
		this.plugin = plugin;
		this.config = JSON.parse(JSON.stringify(config));
		this.state = JSON.parse(JSON.stringify(state));
		this.originalConfig = JSON.stringify(config);
		this.originalState = JSON.stringify(state);
		this.onSave = onSave;
		this.onIdChanged = onIdChanged;
	}

	/** Create a collapsible setting group with an animated accordion heading */
	private buildCollapsibleGroup(parent: HTMLElement, name: string, startCollapsed = true): HTMLElement {
		const states = sectionExpanded.get(this.app) ?? {};
		const isExpanded = states[name] ?? !startCollapsed;

		const group = parent.createDiv({ cls: 'setting-group' });
		const heading = new Setting(group).setName('').setHeading();
		const nameRow = heading.nameEl.createDiv({ cls: 'ttrpgmap-collapsible-heading' });
		const chevron = nameRow.createSpan({ cls: 'ttrpgmap-folder-chevron' });
		setIcon(chevron, 'chevron-down');
		nameRow.createSpan({ text: name });
		heading.settingEl.setCssStyles({ cursor: 'pointer' });

		const items = group.createDiv({ cls: 'setting-items ttrpgmap-collapsible-content' });
		if (!isExpanded) {
			items.addClass('is-collapsed');
			chevron.addClass('is-collapsed');
		}
		heading.settingEl.addEventListener('click', () => {
			const expanding = items.hasClass('is-collapsed');
			items.toggleClass('is-collapsed', !expanding);
			chevron.toggleClass('is-collapsed', !expanding);
			const s = sectionExpanded.get(this.app) ?? {};
			s[name] = expanding;
			sectionExpanded.set(this.app, s);
		});
		return items;
	}

	private isDirty(): boolean {
		return JSON.stringify(this.config) !== this.originalConfig || JSON.stringify(this.state) !== this.originalState;
	}

	private loadImageDimensions(descEl: HTMLElement): void {
		const file = this.app.vault.getFileByPath(this.config.image);
		if (!file) {
			descEl.setText('Image not found');
			return;
		}
		const resourcePath = this.app.vault.getResourcePath(file);
		const img = new Image();
		img.onload = () => {
			descEl.setText(`Native size: ${img.naturalWidth} \u00d7 ${img.naturalHeight} px`);
		};
		img.onerror = () => {
			descEl.setText('Could not load image');
		};
		img.src = resourcePath;
	}

	private doSave(): void {
		this.saved = true;
		this.onSave(this.config, this.state);
		this.close();
	}

	private doCancel(): void {
		if (!this.isDirty()) {
			this.saved = true;
			this.close();
			return;
		}
		this.promptUnsaved();
	}

	private promptUnsaved(): void {
		const confirmModal = new Modal(this.app);
		confirmModal.titleEl.setText('Unsaved changes');
		confirmModal.contentEl.createEl('p', { text: 'You have unsaved changes. What would you like to do?' });
		new Setting(confirmModal.contentEl)
			.addButton((btn) =>
				btn.setButtonText('Cancel').onClick(() => {
					confirmModal.close();
				}),
			)
			.addButton((btn) =>
				btn
					.setButtonText('Discard')
					.setWarning()
					.onClick(() => {
						confirmModal.close();
						this.saved = true;
						this.close();
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText('Save')
					.setCta()
					.onClick(() => {
						confirmModal.close();
						this.doSave();
					}),
			);
		confirmModal.open();
	}

	private openChangeIdModal(): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText('Change map ID');
		const { contentEl } = modal;

		let newId = this.config.id;
		new Setting(contentEl).setName('New ID').addText((text) => {
			text.setValue(this.config.id).onChange((value) => {
				newId = value;
			});
			activeWindow.setTimeout(() => {
				text.inputEl.focus();
				text.inputEl.select();
			}, 0);
		});

		contentEl.createEl('p', {
			text: 'Choose how to handle the existing data:',
			cls: 'ttrpgmap-muted',
		});

		const list = contentEl.createEl('ul');
		list.createEl('li').setText('Migrate - move all data to the new ID, delete the old');
		list.createEl('li').setText('Copy - copy all data to the new ID, keep the old');
		list.createEl('li').setText('Orphan - start fresh with the new ID, keep old data behind');
		list.createEl('li').setText('Delete - start fresh with the new ID, permanently delete old data');

		const oldId = this.config.id;
		const executeIdChange = (action: 'migrate' | 'copy' | 'delete' | 'orphan') => {
			const id = newId.trim();
			if (!id || id === oldId) return;
			this.onIdChanged(oldId, id, action);
			// Update local state to reflect the change
			this.config.id = id;
			this.state.mapId = id;
			if (action === 'delete' || action === 'orphan') {
				this.state = {
					mapId: id,
					markers: [],
					layers: [{ id: 'default', name: 'Default Layer', zoomMin: null, zoomMax: null }],
					distanceScale: null,
				};
			}
			// Update snapshots so this isn't "dirty"
			this.originalConfig = JSON.stringify(this.config);
			this.originalState = JSON.stringify(this.state);
			if (this._idTextEl) this._idTextEl.value = id;
			modal.close();
		};

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Migrate')
					.setCta()
					.onClick(() => executeIdChange('migrate')),
			)
			.addButton((btn) =>
				btn
					.setButtonText('Copy')
					.onClick(() => executeIdChange('copy')),
			)
			.addButton((btn) =>
				btn
					.setButtonText('Orphan')
					.onClick(() => executeIdChange('orphan')),
			)
			.addButton((btn) =>
				btn
					.setButtonText('Delete')
					.setWarning()
					.onClick(() => executeIdChange('delete')),
			)
			.addButton((btn) => btn.setButtonText('Cancel').onClick(() => modal.close()));

		modal.open();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('ttrpgmap-modal--wide');
		this.titleEl.setText('Edit map');

		const mapGroup = contentEl.createDiv({ cls: 'setting-group' });
		const mapItems = mapGroup.createDiv({ cls: 'setting-items' });

		// ── Image ──
		const imageSetting = new Setting(mapItems)
			.setName('Image')
			.setDesc('Search for a map image in your vault')
			.addText((text) => {
				text
					.setPlaceholder('Search for an image...')
					.setValue(this.config.image)
					.onChange((value) => {
						this.config.image = value;
						this.loadImageDimensions(imageSetting.descEl);
					});
				new ImageSuggest(this.app, text.inputEl, (value) => {
					this.config.image = value;
					this.loadImageDimensions(imageSetting.descEl);
				});
			});
		this.loadImageDimensions(imageSetting.descEl);

		const idSetting = new Setting(mapItems)
			.setName('Map ID')
			.setDesc('Used to store map data. Set to a unique value to use the same image on multiple maps.');
		idSetting.addText((text) => {
			text.setValue(this.config.id).setDisabled(true);
			this._idTextEl = text.inputEl;
		});
		idSetting.addExtraButton((btn) => {
			btn
				.setIcon('pencil')
				.setTooltip('Change map ID')
				.onClick(() => {
					this.openChangeIdModal();
				});
		});

		// ── Map Size ──
		const sizeSetting = new Setting(mapItems)
			.setName('Map size')
			.setDesc('Display dimensions (blank = auto from image aspect ratio)');
		const sizeControl = sizeSetting.controlEl;
		sizeControl.addClass('ttrpgmap-size-control');
		sizeControl.createSpan({ text: 'Height:', cls: 'ttrpgmap-size-label' });
		const heightInput = sizeControl.createEl('input', {
			type: 'text',
			cls: 'ttrpgmap-size-input',
			value: this.config.height ?? '',
			attr: { placeholder: '500' },
		});
		heightInput.addEventListener('input', () => {
			this.config.height = heightInput.value || null;
		});
		sizeControl.createSpan({ text: '\u00d7', cls: 'ttrpgmap-size-separator' });
		sizeControl.createSpan({ text: 'Width:', cls: 'ttrpgmap-size-label' });
		const widthInput = sizeControl.createEl('input', {
			type: 'text',
			cls: 'ttrpgmap-size-input',
			value: this.config.width ?? '',
			attr: { placeholder: '800' },
		});
		widthInput.addEventListener('input', () => {
			this.config.width = widthInput.value || null;
		});

		// ── Zoom ──
		const zoomSetting = new Setting(mapItems)
			.setName('Zoom range')
			.setDesc('Zoom range (%) and step size per scroll increment');
		const zoomControl = zoomSetting.controlEl;
		zoomControl.addClass('ttrpgmap-size-control');
		zoomControl.createSpan({ text: 'Min:', cls: 'ttrpgmap-size-label' });
		const zoomMinInput = zoomControl.createEl('input', {
			type: 'text',
			cls: 'ttrpgmap-size-input',
			value: String(this.config.zoomMin),
		});
		zoomMinInput.addEventListener('input', () => {
			this.config.zoomMin = parseInt(zoomMinInput.value, 10) || 50;
		});
		zoomControl.createSpan({ text: 'Max:', cls: 'ttrpgmap-size-label' });
		const zoomMaxInput = zoomControl.createEl('input', {
			type: 'text',
			cls: 'ttrpgmap-size-input',
			value: String(this.config.zoomMax),
		});
		zoomMaxInput.addEventListener('input', () => {
			this.config.zoomMax = parseInt(zoomMaxInput.value, 10) || 200;
		});
		zoomControl.createSpan({ text: 'Step:', cls: 'ttrpgmap-size-label' });
		const zoomStepInput = zoomControl.createEl('input', {
			type: 'text',
			cls: 'ttrpgmap-size-input',
			value: String(this.config.zoomStep),
		});
		zoomStepInput.addEventListener('input', () => {
			this.config.zoomStep = parseInt(zoomStepInput.value, 10) || 10;
		});

		// ── Navigation ──
		const globalNewTab = this.plugin.settings.openLinksInNewTab ?? false;
		const globalNewTabLabel = globalNewTab ? 'New tab' : 'Current tab';
		new Setting(mapItems)
			.setName('Open links in')
			.setDesc(`Inherit uses the global default (currently ${globalNewTabLabel})`)
			.addDropdown((dropdown) => {
				dropdown
					.addOption('inherit', 'Inherit')
					.addOption('new', 'New tab')
					.addOption('current', 'Current tab')
					.setValue(this.state.openLinksInNewTab == null ? 'inherit' : this.state.openLinksInNewTab ? 'new' : 'current')
					.onChange((value) => {
						if (value === 'inherit') this.state.openLinksInNewTab = undefined;
						else this.state.openLinksInNewTab = value === 'new';
					});
			});

		const globalHover = this.plugin.settings.showHoverPreview ?? false;
		const globalHoverLabel = globalHover ? 'On' : 'Off';
		new Setting(mapItems)
			.setName('Hover preview')
			.setDesc(`Inherit uses the global default (currently ${globalHoverLabel})`)
			.addDropdown((dropdown) => {
				dropdown
					.addOption('inherit', 'Inherit')
					.addOption('on', 'On')
					.addOption('off', 'Off')
					.setValue(this.state.showHoverPreview == null ? 'inherit' : this.state.showHoverPreview ? 'on' : 'off')
					.onChange((value) => {
						if (value === 'inherit') this.state.showHoverPreview = undefined;
						else this.state.showHoverPreview = value === 'on';
					});
			});

		// ── Locks ──
		new Setting(mapItems)
			.setName('Lock zoom')
			.setDesc('Prevent zooming. Scroll wheel passes through to page scroll')
			.addToggle((toggle) => {
				toggle.setValue(this.state.zoomLocked ?? false).onChange((value) => {
					this.state.zoomLocked = value || undefined;
				});
			});

		new Setting(mapItems)
			.setName('Lock pan')
			.setDesc('Prevent panning by click-and-drag')
			.addToggle((toggle) => {
				toggle.setValue(this.state.panLocked ?? false).onChange((value) => {
					this.state.panLocked = value || undefined;
				});
			});

		// ── Marker Scale ──
		const markerItems = this.buildCollapsibleGroup(contentEl, 'Markers');

		const globalScale = this.plugin.settings.defaultMarkerScale ?? DEFAULT_MARKER_SCALE;
		const hasOverride = this.state.markerScale != null;
		const effectiveScale = this.state.markerScale ?? globalScale;

		const scaleSetting = new Setting(markerItems).setName('Marker size');

		const scaleControls = buildScaleSlider({
			setting: scaleSetting,
			value: effectiveScale,
			onChange: (value) => {
				this.state.markerScale = value;
				scaleSetting.setDesc(
					`Map override: ${Math.round(value * 100)}% (global default: ${Math.round(globalScale * 100)}%)`,
				);
			},
			disabled: !hasOverride,
		});

		scaleSetting.addToggle((toggle) => {
			toggle.setValue(hasOverride).onChange((enabled) => {
				if (enabled) {
					scaleControls.setDisabled(false);
					scaleControls.setValue(globalScale);
					this.state.markerScale = globalScale;
					scaleSetting.setDesc(
						`Map override: ${Math.round(globalScale * 100)}% (global default: ${Math.round(globalScale * 100)}%)`,
					);
				} else {
					scaleControls.setDisabled(true);
					scaleControls.setValue(globalScale);
					this.state.markerScale = undefined;
					scaleSetting.setDesc(`Using global default: ${Math.round(globalScale * 100)}%`);
				}
			});
		});

		scaleSetting.setDesc(
			hasOverride
				? `Map override: ${Math.round(effectiveScale * 100)}% (global default: ${Math.round(globalScale * 100)}%)`
				: `Using global default: ${Math.round(globalScale * 100)}%`,
		);

		// Scale to Zoom
		const globalScaleToZoom = this.plugin.settings.defaultScaleMarkersToZoom ?? true;
		const globalZoomLabel = globalScaleToZoom ? 'Screen-constant' : 'Fixed to map';

		new Setting(markerItems)
			.setName('Scale markers to zoom')
			.setDesc(`Inherit uses the global default (currently ${globalZoomLabel})`)
			.addDropdown((dropdown) => {
				dropdown
					.addOption('inherit', 'Inherit')
					.addOption('screen', 'Screen-constant')
					.addOption('map', 'Fixed to map')
					.setValue(
						this.state.scaleMarkersToZoom == null ? 'inherit' : this.state.scaleMarkersToZoom ? 'screen' : 'map',
					)
					.onChange((value) => {
						if (value === 'inherit') this.state.scaleMarkersToZoom = undefined;
						else this.state.scaleMarkersToZoom = value === 'screen';
					});
			});

		new Setting(markerItems)
			.setName('Lock markers')
			.setDesc('Prevent moving markers by click-and-drag')
			.addToggle((toggle) => {
				toggle.setValue(this.state.markersLocked ?? false).onChange((value) => {
					this.state.markersLocked = value || undefined;
				});
			});

		// ── Text Scale ──
		const textItems = this.buildCollapsibleGroup(contentEl, 'Text');

		const globalTextScale = this.plugin.settings.defaultMarkerTextScale ?? DEFAULT_MARKER_TEXT_SCALE;
		const hasTextOverride = this.state.markerTextScale != null;
		const effectiveTextScale = this.state.markerTextScale ?? globalTextScale;

		const textScaleSetting = new Setting(textItems).setName('Text size');

		const textScaleControls = buildScaleSlider({
			setting: textScaleSetting,
			value: effectiveTextScale,
			onChange: (value) => {
				this.state.markerTextScale = value;
				textScaleSetting.setDesc(
					`Map override: ${Math.round(value * 100)}% (global default: ${Math.round(globalTextScale * 100)}%)`,
				);
			},
			disabled: !hasTextOverride,
		});

		textScaleSetting.addToggle((toggle) => {
			toggle.setValue(hasTextOverride).onChange((enabled) => {
				if (enabled) {
					textScaleControls.setDisabled(false);
					textScaleControls.setValue(globalTextScale);
					this.state.markerTextScale = globalTextScale;
					textScaleSetting.setDesc(
						`Map override: ${Math.round(globalTextScale * 100)}% (global default: ${Math.round(globalTextScale * 100)}%)`,
					);
				} else {
					textScaleControls.setDisabled(true);
					textScaleControls.setValue(globalTextScale);
					this.state.markerTextScale = undefined;
					textScaleSetting.setDesc(`Using global default: ${Math.round(globalTextScale * 100)}%`);
				}
			});
		});

		textScaleSetting.setDesc(
			hasTextOverride
				? `Map override: ${Math.round(effectiveTextScale * 100)}% (global default: ${Math.round(globalTextScale * 100)}%)`
				: `Using global default: ${Math.round(globalTextScale * 100)}%`,
		);

		// Scale Text to Zoom
		const globalTextScaleToZoom = this.plugin.settings.defaultScaleMarkerTextToZoom ?? true;
		const globalTextZoomLabel = globalTextScaleToZoom ? 'Screen-constant' : 'Fixed to map';

		new Setting(textItems)
			.setName('Scale text to zoom')
			.setDesc(`Inherit uses the global default (currently ${globalTextZoomLabel})`)
			.addDropdown((dropdown) => {
				dropdown
					.addOption('inherit', 'Inherit')
					.addOption('screen', 'Screen-constant')
					.addOption('map', 'Fixed to map')
					.setValue(
						this.state.scaleMarkerTextToZoom == null ? 'inherit' : this.state.scaleMarkerTextToZoom ? 'screen' : 'map',
					)
					.onChange((value) => {
						if (value === 'inherit') this.state.scaleMarkerTextToZoom = undefined;
						else this.state.scaleMarkerTextToZoom = value === 'screen';
					});
			});

		const globalFont = this.plugin.settings.defaultMarkerFont ?? 'default';
		const globalFontLabel = MARKER_FONT_LABELS[globalFont];
		new Setting(textItems)
			.setName('Label font')
			.setDesc(`Inherit uses the global default (currently ${globalFontLabel})`)
			.addDropdown((dropdown) => {
				dropdown.addOption('inherit', 'Inherit');
				for (const [key, label] of Object.entries(MARKER_FONT_LABELS)) {
					dropdown.addOption(key, label);
				}
				dropdown
					.setValue(this.state.markerFont ?? 'inherit')
					.onChange((value) => {
						if (value === 'inherit') this.state.markerFont = undefined;
						else this.state.markerFont = value as MarkerFont;
					});
			});

		// ── Controls visibility ──
		const controlsItems = this.buildCollapsibleGroup(contentEl, 'Controls');

		const controlSettings: { name: string; desc: string; field: 'showMeasurementTools' | 'showZoomControls' | 'showMarkerList' | 'showLayerList' | 'showMapSettings' }[] = [
			{ name: 'Measurement tools', desc: 'Distance measurement panel', field: 'showMeasurementTools' },
			{ name: 'Zoom controls', desc: 'Zoom buttons, center, fit, and locks', field: 'showZoomControls' },
			{ name: 'Marker list', desc: 'Marker list tab', field: 'showMarkerList' },
			{ name: 'Layer list', desc: 'Layer list tab', field: 'showLayerList' },
			{ name: 'Map settings button', desc: 'Gear button (accessible via right-click when hidden)', field: 'showMapSettings' },
		];

		for (const ctrl of controlSettings) {
			const globalVal = this.plugin.settings[ctrl.field] ?? true;
			const globalLabel = globalVal ? 'Shown' : 'Hidden';
			new Setting(controlsItems)
				.setName(ctrl.name)
				.setDesc(`${ctrl.desc}. Inherit uses the global default (currently ${globalLabel})`)
				.addDropdown((dropdown) => {
					dropdown
						.addOption('inherit', 'Inherit')
						.addOption('show', 'Show')
						.addOption('hide', 'Hide')
						.setValue(this.state[ctrl.field] == null ? 'inherit' : this.state[ctrl.field] ? 'show' : 'hide')
						.onChange((value) => {
							if (value === 'inherit') (this.state as unknown as Record<string, unknown>)[ctrl.field] = undefined;
							else (this.state as unknown as Record<string, unknown>)[ctrl.field] = value === 'show';
						});
				});
		}

		const globalOpacity = this.plugin.settings.defaultControlOpacity ?? 50;
		const hasOpacityOverride = this.state.controlOpacity != null;
		const effectiveOpacity = this.state.controlOpacity ?? globalOpacity;

		const opacitySetting = new Setting(controlsItems)
			.setName('Control opacity');

		const opacityControls = buildPercentSlider({
			setting: opacitySetting,
			value: effectiveOpacity,
			onChange: (value) => {
				this.state.controlOpacity = value;
				opacitySetting.setDesc(
					`Map override: ${value}% (global default: ${globalOpacity}%)`,
				);
			},
			disabled: !hasOpacityOverride,
		});

		opacitySetting.addToggle((toggle) => {
			toggle.setValue(hasOpacityOverride).onChange((enabled) => {
				if (enabled) {
					opacityControls.setDisabled(false);
					opacityControls.setValue(globalOpacity);
					this.state.controlOpacity = globalOpacity;
					opacitySetting.setDesc(
						`Map override: ${globalOpacity}% (global default: ${globalOpacity}%)`,
					);
				} else {
					opacityControls.setDisabled(true);
					opacityControls.setValue(globalOpacity);
					this.state.controlOpacity = undefined;
					opacitySetting.setDesc(`Using global default: ${globalOpacity}%`);
				}
			});
		});

		opacitySetting.setDesc(
			hasOpacityOverride
				? `Map override: ${effectiveOpacity}% (global default: ${globalOpacity}%)`
				: `Using global default: ${globalOpacity}%`,
		);

		// ── Marker Layers ──
		const layersContainer = this.buildCollapsibleGroup(contentEl, 'Layers');
		this.renderLayers(layersContainer);

		// ── Footer: Export + Save + Cancel ──
		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText('Export map');
				btn.onClick(() => {
					void exportMap(this.app, this.plugin, this.config, this.state);
				});
			})
			.addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.doCancel()))
			.addButton((btn) =>
				btn
					.setButtonText('Save')
					.setCta()
					.onClick(() => this.doSave()),
			);

		// Prevent auto-focus on the first input
		activeWindow.setTimeout(() => {
			(activeWindow.document.activeElement as HTMLElement)?.blur();
		}, 0);
	}

	private formatZoomRange(layer: MarkerLayer): string {
		const min = layer.zoomMin;
		const max = layer.zoomMax;
		if (min == null && max == null) return 'Always visible';
		if (min != null && max != null) return `${min}% \u2013 ${max}%`;
		if (min != null) return `${min}%+`;
		return `Up to ${max}%`;
	}

	private renderLayers(container: HTMLElement): void {
		container.empty();

		// Header row with "Add Layer" button
		new Setting(container)
			.setName('Marker layers')
			.setDesc('Control marker visibility based on zoom level')
			.addButton((btn) => {
				btn.setButtonText('Add layer');
				btn.onClick(() => {
					const existingNames = new Set(this.state.layers.map((l) => l.name.toLowerCase()));
					let n = 1;
					while (existingNames.has(`layer ${n}`.toLowerCase())) n++;
					const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
					const newLayer: MarkerLayer = {
						id,
						name: `Layer ${n}`,
						zoomMin: this.config.zoomMin,
						zoomMax: this.config.zoomMax,
					};
					this.state.layers.push(newLayer);
					this.renderLayers(container);
					new LayerEditModal(this.app, {
						layer: newLayer,
						mapZoomMin: this.config.zoomMin,
						mapZoomMax: this.config.zoomMax,
						isNew: true,
						onSave: (saved) => {
							Object.assign(newLayer, saved);
							this.renderLayers(container);
						},
					}).open();
				});
			});

		const layerList = container.createDiv({ cls: 'ttrpgmap-layer-list' });

		for (const layer of this.state.layers) {
			const isDefault = layer.id === DEFAULT_LAYER_ID;

			const row = new Setting(layerList).setName(layer.name).setDesc(this.formatZoomRange(layer));

			// Edit button
			row.addExtraButton((btn) => {
				btn.setIcon('pencil');
				btn.setTooltip('Edit layer');
				btn.onClick(() => {
					new LayerEditModal(this.app, {
						layer,
						mapZoomMin: this.config.zoomMin,
						mapZoomMax: this.config.zoomMax,
						onSave: (saved) => {
							Object.assign(layer, saved);
							this.renderLayers(container);
						},
					}).open();
				});
			});

			if (isDefault) {
				row.addExtraButton((btn) => {
					btn.setIcon('rotate-ccw');
					btn.setTooltip('Reset to defaults');
					btn.onClick(() => {
						layer.name = DEFAULT_LAYER.name;
						layer.zoomMin = DEFAULT_LAYER.zoomMin;
						layer.zoomMax = DEFAULT_LAYER.zoomMax;
						this.renderLayers(container);
					});
				});
			} else {
				row.addExtraButton((btn) => {
					btn.setIcon('trash-2');
					btn.setTooltip('Delete layer');
					btn.onClick(() => {
						void (async () => {
							const count = this.state.markers.filter((m) => m.layerId === layer.id).length;
							const msg = count > 0
								? `Delete "${layer.name}"? ${count} marker${count !== 1 ? 's' : ''} will be moved to the Default Layer.`
								: `Delete "${layer.name}"?`;
							const confirmed = await confirmAction(this.app, 'Delete layer', msg, 'Delete');
							if (!confirmed) return;
							for (const m of this.state.markers) {
								if (m.layerId === layer.id) m.layerId = null;
							}
							this.state.layers = this.state.layers.filter((l) => l.id !== layer.id);
							this.renderLayers(container);
						})();
					});
				});
			}
		}
	}

	onClose(): void {
		if (!this.saved && this.isDirty()) {
			// Reopen immediately then show prompt on top
			activeWindow.setTimeout(() => {
				this.open();
				this.promptUnsaved();
			}, 0);
			return;
		}
		this.contentEl.empty();
	}
}
