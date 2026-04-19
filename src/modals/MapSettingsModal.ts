import { App, Modal, Setting, setIcon } from 'obsidian';
import { confirmAction } from '../utils/confirmModal';
import type TTRPGMapsPlugin from '../main';
import {
	MapConfig,
	MapState,
	MarkerLayer,
	RoundingMode,
	DEFAULT_LAYER,
	DEFAULT_LAYER_ID,
	DEFAULT_MARKER_SCALE,
	DEFAULT_MARKER_TEXT_SCALE,
	getMarkerFontDef,
} from '../types';
import { ImageSuggest } from '../suggests/ImageSuggest';
import { LayerEditModal } from './LayerEditModal';
import { buildScaleSlider, buildPercentSlider, buildFontDropdown } from './sharedFields';
import { exportMap } from '../utils/mapExport';
import type { MeasurementUnit, ConversionMode } from '../units';
import { getUnitsForSystem } from '../units';

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
	private highlightSetting: string | undefined;
	private saved = false;

	constructor(
		app: App,
		plugin: TTRPGMapsPlugin,
		config: MapConfig,
		state: MapState,
		highlightSetting: string | undefined,
		onSave: (config: MapConfig, state: MapState) => void,
		onIdChanged: (oldId: string, newId: string, action: 'migrate' | 'copy' | 'delete' | 'orphan') => void,
	) {
		super(app);
		this.plugin = plugin;
		this.config = JSON.parse(JSON.stringify(config)) as MapConfig;
		this.state = JSON.parse(JSON.stringify(state)) as MapState;
		this.originalConfig = JSON.stringify(config);
		this.originalState = JSON.stringify(state);
		this.highlightSetting = highlightSetting;
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
		const footer = confirmModal.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancelBtn = footer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => confirmModal.close());
		const discardBtn = footer.createEl('button', { cls: 'mod-warning', text: 'Discard' });
		discardBtn.addEventListener('click', () => {
			confirmModal.close();
			this.saved = true;
			this.close();
		});
		const saveBtn = footer.createEl('button', { cls: 'mod-cta', text: 'Save' });
		saveBtn.addEventListener('click', () => {
			confirmModal.close();
			this.doSave();
		});
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

		const idFooter = contentEl.createDiv({ cls: 'modal-button-container' });
		const migrateBtn = idFooter.createEl('button', { cls: 'mod-cta', text: 'Migrate' });
		migrateBtn.addEventListener('click', () => executeIdChange('migrate'));
		const copyBtn = idFooter.createEl('button', { text: 'Copy' });
		copyBtn.addEventListener('click', () => executeIdChange('copy'));
		const orphanBtn = idFooter.createEl('button', { text: 'Orphan' });
		orphanBtn.addEventListener('click', () => executeIdChange('orphan'));
		const deleteBtn = idFooter.createEl('button', { cls: 'mod-warning', text: 'Delete' });
		deleteBtn.addEventListener('click', () => executeIdChange('delete'));
		const idCancelBtn = idFooter.createEl('button', { text: 'Cancel' });
		idCancelBtn.addEventListener('click', () => modal.close());

		modal.open();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('ttrpgmap-modal--wide');
		this.titleEl.setText('Edit map');

		this.buildGeneralSection(contentEl);
		this.buildMarkersSection(contentEl);
		this.buildTextSection(contentEl);
		this.buildMeasurementSection(contentEl);
		this.buildControlsSection(contentEl);
		this.buildLayersSection(contentEl);
		this.buildFooter(contentEl);

		// Prevent auto-focus on the first input, then highlight the target setting if requested
		activeWindow.setTimeout(() => {
			(activeWindow.document.activeElement as HTMLElement)?.blur();
			if (this.highlightSetting) {
				this.scrollToSetting(contentEl, this.highlightSetting);
				this.highlightSetting = undefined;
			}
		}, 0);
	}

	/** Find a setting by name, expand its section if collapsed, scroll to it, and pulse-highlight it */
	private scrollToSetting(contentEl: HTMLElement, name: string): void {
		const settingEls = contentEl.querySelectorAll<HTMLElement>('.setting-item');
		let target: HTMLElement | null = null;
		for (const el of Array.from(settingEls)) {
			const nameEl = el.querySelector('.setting-item-name');
			if (nameEl && nameEl.textContent === name) {
				target = el;
				break;
			}
		}
		if (!target) return;

		// Expand the collapsible section: target may be inside it (regular setting)
		// or a sibling heading (section name match)
		const collapsible =
			target.closest<HTMLElement>('.ttrpgmap-collapsible-content') ??
			target.parentElement?.querySelector<HTMLElement>('.ttrpgmap-collapsible-content') ??
			null;
		// If the target is a section heading, flash the collapsible content instead
		const highlightEl = collapsible ?? target;

		const scrollAndHighlight = () => {
			highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
			highlightEl.addClass('ttrpgmap-setting-highlight');
			highlightEl.addEventListener(
				'animationend',
				() => {
					highlightEl.removeClass('ttrpgmap-setting-highlight');
				},
				{ once: true },
			);
		};

		if (collapsible && collapsible.hasClass('is-collapsed')) {
			collapsible.addEventListener('transitionend', scrollAndHighlight, { once: true });
			collapsible.removeClass('is-collapsed');
			const chevron = collapsible.parentElement?.querySelector<HTMLElement>('.ttrpgmap-folder-chevron');
			if (chevron) chevron.removeClass('is-collapsed');
			// Persist expanded state
			const heading = collapsible.parentElement?.querySelector<HTMLElement>(
				'.ttrpgmap-collapsible-heading span:last-child',
			);
			if (heading?.textContent) {
				const s = sectionExpanded.get(this.app) ?? {};
				s[heading.textContent] = true;
				sectionExpanded.set(this.app, s);
			}
		} else {
			scrollAndHighlight();
		}
	}

	private buildGeneralSection(contentEl: HTMLElement): void {
		const group = contentEl.createDiv({ cls: 'setting-group' });
		const items = group.createDiv({ cls: 'setting-items' });

		// Image
		const imageSetting = new Setting(items)
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

		// Map ID
		const idSetting = new Setting(items)
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
				.onClick(() => this.openChangeIdModal());
		});

		// Map size
		const sizeSetting = new Setting(items)
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

		// Zoom range
		const zoomSetting = new Setting(items)
			.setName('Zoom range')
			.setDesc('Zoom range (%) and step size per scroll increment');
		const zoomControl = zoomSetting.controlEl;
		zoomControl.addClass('ttrpgmap-size-control');
		const zoomFields: { label: string; value: string; fallback: number; setter: (v: number) => void }[] = [
			{
				label: 'Min:',
				value: String(this.config.zoomMin),
				fallback: 50,
				setter: (v) => {
					this.config.zoomMin = v;
				},
			},
			{
				label: 'Max:',
				value: String(this.config.zoomMax),
				fallback: 200,
				setter: (v) => {
					this.config.zoomMax = v;
				},
			},
			{
				label: 'Step:',
				value: String(this.config.zoomStep),
				fallback: 10,
				setter: (v) => {
					this.config.zoomStep = v;
				},
			},
		];
		for (const field of zoomFields) {
			zoomControl.createSpan({ text: field.label, cls: 'ttrpgmap-size-label' });
			const input = zoomControl.createEl('input', { type: 'text', cls: 'ttrpgmap-size-input', value: field.value });
			input.addEventListener('input', () => {
				field.setter(parseInt(input.value, 10) || field.fallback);
			});
		}

		// Navigation
		const globalNewTab = this.plugin.settings.openLinksInNewTab ?? false;
		new Setting(items)
			.setName('Open links in')
			.setDesc(`Inherit uses the global default (currently ${globalNewTab ? 'New tab' : 'Current tab'})`)
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
		new Setting(items)
			.setName('Hover preview')
			.setDesc(`Inherit uses the global default (currently ${globalHover ? 'On' : 'Off'})`)
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

		// Locks
		new Setting(items)
			.setName('Lock zoom')
			.setDesc('Prevent zooming. Scroll wheel passes through to page scroll')
			.addToggle((toggle) => {
				toggle.setValue(this.state.zoomLocked ?? false).onChange((value) => {
					this.state.zoomLocked = value || undefined;
				});
			});

		new Setting(items)
			.setName('Lock pan')
			.setDesc('Prevent panning by click-and-drag')
			.addToggle((toggle) => {
				toggle.setValue(this.state.panLocked ?? false).onChange((value) => {
					this.state.panLocked = value || undefined;
				});
			});
	}

	private buildScaleOverride(
		container: HTMLElement,
		name: string,
		globalDefault: number,
		currentValue: number | undefined,
		onSet: (value: number | undefined) => void,
	): void {
		const hasOverride = currentValue != null;
		const effective = currentValue ?? globalDefault;
		const globalPct = Math.round(globalDefault * 100);

		const setting = new Setting(container).setName(name);
		const controls = buildScaleSlider({
			setting,
			value: effective,
			onChange: (value) => {
				onSet(value);
				setting.setDesc(`Map override: ${Math.round(value * 100)}% (global default: ${globalPct}%)`);
			},
			disabled: !hasOverride,
		});

		setting.addToggle((toggle) => {
			toggle.setValue(hasOverride).onChange((enabled) => {
				if (enabled) {
					controls.setDisabled(false);
					controls.setValue(globalDefault);
					onSet(globalDefault);
					setting.setDesc(`Map override: ${globalPct}% (global default: ${globalPct}%)`);
				} else {
					controls.setDisabled(true);
					controls.setValue(globalDefault);
					onSet(undefined);
					setting.setDesc(`Using global default: ${globalPct}%`);
				}
			});
		});

		setting.setDesc(
			hasOverride
				? `Map override: ${Math.round(effective * 100)}% (global default: ${globalPct}%)`
				: `Using global default: ${globalPct}%`,
		);
	}

	private buildZoomBehaviorDropdown(
		container: HTMLElement,
		name: string,
		globalDefault: boolean,
		currentValue: boolean | undefined,
		onSet: (value: boolean | undefined) => void,
	): void {
		const globalLabel = globalDefault ? 'Screen-constant' : 'Fixed to map';
		new Setting(container)
			.setName(name)
			.setDesc(`Inherit uses the global default (currently ${globalLabel})`)
			.addDropdown((dropdown) => {
				dropdown
					.addOption('inherit', 'Inherit')
					.addOption('screen', 'Screen-constant')
					.addOption('map', 'Fixed to map')
					.setValue(currentValue == null ? 'inherit' : currentValue ? 'screen' : 'map')
					.onChange((value) => {
						if (value === 'inherit') onSet(undefined);
						else onSet(value === 'screen');
					});
			});
	}

	private buildMarkersSection(contentEl: HTMLElement): void {
		const items = this.buildCollapsibleGroup(contentEl, 'Markers');

		this.buildScaleOverride(
			items,
			'Marker size',
			this.plugin.settings.defaultMarkerScale ?? DEFAULT_MARKER_SCALE,
			this.state.markerScale,
			(v) => {
				this.state.markerScale = v;
			},
		);

		this.buildZoomBehaviorDropdown(
			items,
			'Scale markers to zoom',
			this.plugin.settings.defaultScaleMarkersToZoom ?? true,
			this.state.scaleMarkersToZoom,
			(v) => {
				this.state.scaleMarkersToZoom = v;
			},
		);

		new Setting(items)
			.setName('Lock markers')
			.setDesc('Prevent moving markers by click-and-drag')
			.addToggle((toggle) => {
				toggle.setValue(this.state.markersLocked ?? false).onChange((value) => {
					this.state.markersLocked = value || undefined;
				});
			});

		// Max rendered markers
		const globalMax = this.plugin.settings.maxRenderedMarkers ?? 200;
		const hasMaxOverride = this.state.maxRenderedMarkers != null;
		const effectiveMax = this.state.maxRenderedMarkers ?? globalMax;

		const maxSetting = new Setting(items).setName('Max rendered markers');
		let maxTextRef: { setValue: (v: string) => unknown; setDisabled: (d: boolean) => unknown } | null = null;

		maxSetting.addText((text) => {
			maxTextRef = text;
			text.inputEl.type = 'number';
			text.inputEl.min = '1';
			text.inputEl.step = '1';
			text.setValue(String(effectiveMax)).onChange((value) => {
				const num = parseInt(value, 10);
				if (!isNaN(num) && num > 0) this.state.maxRenderedMarkers = num;
			});
			if (!hasMaxOverride) text.setDisabled(true);
		});

		maxSetting.addToggle((toggle) => {
			toggle.setValue(hasMaxOverride).onChange((enabled) => {
				if (enabled) {
					if (maxTextRef) {
						maxTextRef.setDisabled(false);
						maxTextRef.setValue(String(globalMax));
					}
					this.state.maxRenderedMarkers = globalMax;
					maxSetting.setDesc(`Map override: ${globalMax} (global default: ${globalMax})`);
				} else {
					if (maxTextRef) {
						maxTextRef.setDisabled(true);
						maxTextRef.setValue(String(globalMax));
					}
					this.state.maxRenderedMarkers = undefined;
					maxSetting.setDesc(`Using global default: ${globalMax}`);
				}
			});
		});

		maxSetting.setDesc(
			hasMaxOverride
				? `Map override: ${effectiveMax} (global default: ${globalMax})`
				: `Using global default: ${globalMax}`,
		);
	}

	private buildTextSection(contentEl: HTMLElement): void {
		const items = this.buildCollapsibleGroup(contentEl, 'Text');

		this.buildScaleOverride(
			items,
			'Text size',
			this.plugin.settings.defaultMarkerTextScale ?? DEFAULT_MARKER_TEXT_SCALE,
			this.state.markerTextScale,
			(v) => {
				this.state.markerTextScale = v;
			},
		);

		this.buildZoomBehaviorDropdown(
			items,
			'Scale text to zoom',
			this.plugin.settings.defaultScaleMarkerTextToZoom ?? true,
			this.state.scaleMarkerTextToZoom,
			(v) => {
				this.state.scaleMarkerTextToZoom = v;
			},
		);

		const globalFont = this.plugin.settings.defaultMarkerFont ?? 'default';
		const globalFontLabel = getMarkerFontDef(globalFont)?.label ?? 'Default';
		const fontSetting = new Setting(items)
			.setName('Label font')
			.setDesc(`Inherit uses the global default (currently ${globalFontLabel})`);
		buildFontDropdown({
			setting: fontSetting,
			value: this.state.markerFont ?? 'inherit',
			includeInherit: true,
			onChange: (value) => {
				if (value === 'inherit') this.state.markerFont = undefined;
				else this.state.markerFont = value;
			},
		});

		const globalVis = this.plugin.settings.defaultTextVisibility ?? 'visible';
		const globalVisLabel =
			globalVis === 'visible' ? 'Always visible' : globalVis === 'hover' ? 'Mouseover only' : 'Hidden';
		new Setting(items)
			.setName('Text visibility')
			.setDesc(`Inherit uses the global default (currently ${globalVisLabel})`)
			.addDropdown((dropdown) => {
				dropdown
					.addOption('inherit', 'Inherit')
					.addOption('visible', 'Always visible')
					.addOption('hover', 'Mouseover only')
					.addOption('hidden', 'Hidden')
					.setValue(this.state.textVisibility ?? 'inherit')
					.onChange((value) => {
						(this.state as unknown as Record<string, unknown>).textVisibility = value === 'inherit' ? undefined : value;
					});
			});
	}

	private buildMeasurementSection(contentEl: HTMLElement): void {
		const items = this.buildCollapsibleGroup(contentEl, 'Measurement');
		const scale = this.state.distanceScale;

		if (!scale) {
			new Setting(items)
				.setName('No scale set')
				.setDesc('Set a distance scale on the map first by clicking the ruler icon and measuring a reference distance');
			return;
		}

		const system = scale.unitSystem;
		const hasStructuredUnits = system === 'imperial' || system === 'metric';
		const systemUnits = hasStructuredUnits ? getUnitsForSystem(system) : [];

		// ── Conversion mode (imperial/metric only) ──
		const conversionSetting = new Setting(items)
			.setName('Unit conversion')
			.setDesc('How distances are converted for display');

		const displayUnitSetting = new Setting(items).setName('Display unit');

		const conversionUnitsHeading = new Setting(items)
			.setName('Conversion units')
			.setDesc('Units available for auto-conversion');
		let unitListEl: HTMLElement | null = null;

		const updateConversionVisibility = (mode: string) => {
			displayUnitSetting.settingEl.toggleClass('ttrpgmap-hidden', mode !== 'fixed');
			conversionUnitsHeading.settingEl.toggleClass('ttrpgmap-hidden', mode !== 'auto');
			unitListEl?.toggleClass('ttrpgmap-hidden', mode !== 'auto');
		};

		if (hasStructuredUnits) {
			const currentConversion = this.state.conversionMode ?? 'auto';
			const baseIdx = systemUnits.findIndex((u) => u.id === scale?.unit);
			const largerUnits = systemUnits.filter((_, i) => i > baseIdx);

			conversionSetting.addDropdown((dropdown) => {
				dropdown
					.addOption('none', 'No conversion')
					.addOption('auto', 'Auto-convert')
					.addOption('fixed', 'Always show as...')
					.setValue(currentConversion)
					.onChange((value) => {
						this.state.conversionMode = value as ConversionMode;
						updateConversionVisibility(value);
					});
			});

			displayUnitSetting.addDropdown((dropdown) => {
				for (const u of systemUnits) {
					dropdown.addOption(u.id, u.label.charAt(0).toUpperCase() + u.label.slice(1));
				}
				dropdown.setValue(this.state.displayUnit ?? scale?.unit ?? systemUnits[0]?.id ?? '').onChange((value) => {
					this.state.displayUnit = value as MeasurementUnit;
				});
			});

			// Conversion unit toggles (one per unit, wrapped in a layer-list container)
			const excluded = new Set(this.state.excludedUnits ?? []);
			unitListEl = items.createDiv({ cls: 'ttrpgmap-layer-list' });
			for (const u of largerUnits) {
				new Setting(unitListEl).setName(u.label.charAt(0).toUpperCase() + u.label.slice(1)).addToggle((toggle) => {
					toggle.setValue(!excluded.has(u.id)).onChange((enabled) => {
						if (!this.state.excludedUnits) this.state.excludedUnits = [];
						if (enabled) {
							this.state.excludedUnits = this.state.excludedUnits.filter((id) => id !== u.id);
						} else {
							this.state.excludedUnits.push(u.id);
						}
					});
				});
			}

			updateConversionVisibility(currentConversion);
		} else {
			conversionSetting.settingEl.addClass('ttrpgmap-hidden');
			displayUnitSetting.settingEl.addClass('ttrpgmap-hidden');
			conversionUnitsHeading.settingEl.addClass('ttrpgmap-hidden');
		}

		// ── Rounding mode ──
		const currentRoundingMode = this.state.roundingMode ?? 'none';

		const roundingSetting = new Setting(items).setName('Rounding mode').setDesc('How measured distances are rounded');
		roundingSetting.addDropdown((dropdown) => {
			dropdown
				.addOption('none', 'None')
				.addOption('closest', 'Closest')
				.addOption('up', 'Up to')
				.addOption('down', 'Down to')
				.setValue(currentRoundingMode)
				.onChange((value) => {
					this.state.roundingMode = value as RoundingMode;
					updateRoundingVisibility(value);
				});
		});

		// ── Rounding multiple + unit ──
		const multipleSetting = new Setting(items).setName('Round to nearest');

		multipleSetting.addText((text) => {
			text
				.setValue(String(this.state.roundingMultiple ?? 5))
				.setPlaceholder('5')
				.onChange((value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > 0) this.state.roundingMultiple = num;
				});
			text.inputEl.type = 'number';
			text.inputEl.min = '0';
			text.inputEl.step = 'any';
		});

		if (hasStructuredUnits) {
			multipleSetting.addDropdown((dropdown) => {
				for (const u of systemUnits) {
					dropdown.addOption(u.id, u.label.charAt(0).toUpperCase() + u.label.slice(1));
				}
				dropdown.setValue(this.state.roundingUnit ?? scale?.unit ?? systemUnits[0]?.id ?? '').onChange((value) => {
					this.state.roundingUnit = value as MeasurementUnit;
				});
			});
		}

		// ── Show raw distance ──
		const rawSetting = new Setting(items)
			.setName('Show raw distance')
			.setDesc('Display the unrounded distance alongside the rounded value');
		rawSetting.addToggle((toggle) => {
			toggle.setValue(this.state.showRawDistance ?? false).onChange((value) => {
				this.state.showRawDistance = value;
			});
		});

		const updateRoundingVisibility = (mode: string) => {
			const isNone = mode === 'none';
			multipleSetting.settingEl.toggleClass('ttrpgmap-hidden', isNone);
			rawSetting.settingEl.toggleClass('ttrpgmap-hidden', isNone);
		};
		updateRoundingVisibility(currentRoundingMode);

		// ── Decimal places ──
		new Setting(items)
			.setName('Decimal places')
			.setDesc('Number of decimal places shown in distance values')
			.addText((text) => {
				text
					.setValue(String(this.state.distanceDecimals ?? 0))
					.setPlaceholder('0')
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0 && num <= 6) this.state.distanceDecimals = num;
					});
				text.inputEl.type = 'number';
				text.inputEl.min = '0';
				text.inputEl.max = '6';
				text.inputEl.step = '1';
			});
	}

	private buildControlsSection(contentEl: HTMLElement): void {
		const items = this.buildCollapsibleGroup(contentEl, 'Controls');

		const controlSettings: {
			name: string;
			desc: string;
			field: 'showMeasurementTools' | 'showZoomControls' | 'showMarkerList' | 'showLayerList' | 'showMapSettings';
		}[] = [
			{ name: 'Measurement tools', desc: 'Distance measurement panel', field: 'showMeasurementTools' },
			{ name: 'Zoom controls', desc: 'Zoom buttons, center, fit, and locks', field: 'showZoomControls' },
			{ name: 'Marker list', desc: 'Marker list tab', field: 'showMarkerList' },
			{ name: 'Layer list', desc: 'Layer list tab', field: 'showLayerList' },
			{
				name: 'Map settings button',
				desc: 'Gear button (accessible via right-click when hidden)',
				field: 'showMapSettings',
			},
		];

		for (const ctrl of controlSettings) {
			const globalVal = this.plugin.settings[ctrl.field] ?? true;
			new Setting(items)
				.setName(ctrl.name)
				.setDesc(`${ctrl.desc}. Inherit uses the global default (currently ${globalVal ? 'Shown' : 'Hidden'})`)
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

		// Control opacity
		const globalOpacity = this.plugin.settings.defaultControlOpacity ?? 50;
		const hasOpacityOverride = this.state.controlOpacity != null;
		const effectiveOpacity = this.state.controlOpacity ?? globalOpacity;

		const opacitySetting = new Setting(items).setName('Control opacity');
		const opacityControls = buildPercentSlider({
			setting: opacitySetting,
			value: effectiveOpacity,
			onChange: (value) => {
				this.state.controlOpacity = value;
				opacitySetting.setDesc(`Map override: ${value}% (global default: ${globalOpacity}%)`);
			},
			disabled: !hasOpacityOverride,
		});

		opacitySetting.addToggle((toggle) => {
			toggle.setValue(hasOpacityOverride).onChange((enabled) => {
				if (enabled) {
					opacityControls.setDisabled(false);
					opacityControls.setValue(globalOpacity);
					this.state.controlOpacity = globalOpacity;
					opacitySetting.setDesc(`Map override: ${globalOpacity}% (global default: ${globalOpacity}%)`);
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
	}

	private buildLayersSection(contentEl: HTMLElement): void {
		const items = this.buildCollapsibleGroup(contentEl, 'Layers');
		this.renderLayers(items);
	}

	private buildFooter(contentEl: HTMLElement): void {
		const footer = contentEl.createDiv({ cls: 'modal-button-container' });
		const exportBtn = footer.createEl('button', { cls: 'mod-warning', text: 'Export map' });
		exportBtn.addEventListener('click', () => {
			void exportMap(this.app, this.plugin, this.config, this.state);
		});
		const cancelBtn = footer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.doCancel());
		const saveBtn = footer.createEl('button', { cls: 'mod-cta', text: 'Save' });
		saveBtn.addEventListener('click', () => this.doSave());
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
							const msg =
								count > 0
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
