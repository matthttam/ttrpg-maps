import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import { confirmAction } from '../utils/confirmModal';
import type TTRPGMapsPlugin from '../main';
import {
	MarkerTemplate,
	MarkerDirection,
	TextPlacement,
	MarkerLayer,
	DEFAULT_LAYER_ID,
	MarkerFont,
	getMarkerFontStack,
} from '../types';
import { NoteLinkSuggest } from '../suggests/NoteLinkSuggest';
import { createPinElement } from '../utils/markerPin';
import { buildMarkerLabel } from '../utils/markerLabel';
import {
	buildTextPlacementField,
	buildPinSelectorField,
	buildIconField,
	buildScaleSlider,
	buildFontDropdown,
	MarkerFieldState,
} from './sharedFields';

const sizeOverridesExpanded = new WeakMap<App, boolean>();
const additionalOptionsExpanded = new WeakMap<App, boolean>();

export class MarkerEditModal extends Modal {
	private plugin: TTRPGMapsPlugin;
	private layers: MarkerLayer[];
	private marker: {
		note: string | null;
		alias: string | null;
		previewNote: string | null;
		description: string | null;
		templateId: string;
		layerId: string | null;
		direction: string | null;
		textPlacement: string | null;
		color: string | null;
		icon: string | null;
		iconColor: string | null;
		iconRotation: number | null;
		useBaseMarker: boolean | null;
		shape: 'pin' | 'circle' | 'hotspot' | null;
		scale: number | null;
		scaleToZoom: boolean | null;
		textScale: number | null;
		textScaleToZoom: boolean | null;
		font: MarkerFont | null;
	};
	private onSave: (marker: typeof this.marker) => void;

	constructor(
		app: App,
		plugin: TTRPGMapsPlugin,
		marker: typeof MarkerEditModal.prototype.marker,
		layers: MarkerLayer[],
		onSave: (marker: typeof MarkerEditModal.prototype.marker) => void,
		private isNew = false,
	) {
		super(app);
		this.plugin = plugin;
		this.marker = { ...marker };
		this.layers = layers;
		this.onSave = onSave;
	}

	private getTemplate(): MarkerTemplate | undefined {
		return this.plugin.settings.markerTemplates.find((t) => t.id === this.marker.templateId);
	}

	private addResetButton(setting: Setting, onReset: () => void): void {
		if (!this.getTemplate()) return;
		setting.addExtraButton((btn) =>
			btn
				.setIcon('history')
				.setTooltip('Reset to template default')
				.onClick(() => {
					if (this.getTemplate()) {
						onReset();
						this.onOpen();
					}
				}),
		);
	}

	/** Bridge marker's nullable fields into the non-null MarkerFieldState the shared builders expect */
	private getFieldState(): MarkerFieldState {
		return {
			icon: this.marker.icon,
			iconColor: this.marker.iconColor ?? '#000000',
			iconRotation: this.marker.iconRotation ?? 0,
			direction: (this.marker.direction ?? 'down') as MarkerDirection,
			textPlacement: (this.marker.textPlacement ?? 'above') as TextPlacement,
			color: this.marker.color ?? '#ffffff',
			useBaseMarker: this.marker.useBaseMarker ?? true,
			shape: this.marker.shape ?? 'pin',
		};
	}

	/** Write shared field state back to marker's nullable fields */
	private syncFromFieldState(fs: MarkerFieldState): void {
		this.marker.icon = fs.icon;
		this.marker.iconColor = fs.iconColor;
		this.marker.iconRotation = fs.iconRotation;
		this.marker.direction = fs.direction;
		this.marker.textPlacement = fs.textPlacement;
		this.marker.color = fs.color;
		this.marker.useBaseMarker = fs.useBaseMarker;
		this.marker.shape = fs.shape;
	}

	private renderPreview(container: HTMLElement): void {
		container.empty();
		const usePin = this.marker.useBaseMarker ?? true;
		const direction = (this.marker.direction ?? 'down') as MarkerDirection;
		const textPlacement = (this.marker.textPlacement ?? 'above') as TextPlacement;

		// Nothing to render when no pin shape and no icon
		if (!usePin && !this.marker.icon) {
			container.createSpan({ text: 'No icon set', cls: 'ttrpgmap-muted' });
			return;
		}

		const wrapper = container.createDiv({ cls: 'ttrpgmap-edit-preview-wrapper' });
		wrapper.dataset.direction = direction;
		wrapper.dataset.textPlacement = textPlacement;

		createPinElement(wrapper, {
			pinClass: 'ttrpgmap-edit-preview-pin',
			svgClass: 'ttrpgmap-pin-svg',
			color: this.marker.color ?? '#ffffff',
			icon: this.marker.icon,
			iconColor: this.marker.iconColor ?? '#000000',
			iconRotation: this.marker.iconRotation ?? 0,
			iconClass: 'ttrpgmap-edit-preview-icon',
			useBaseMarker: usePin,
			shape: this.marker.shape ?? 'pin',
		});

		const fontStack = this.marker.font ? getMarkerFontStack(this.marker.font) : null;
		if (fontStack) wrapper.style.setProperty('--marker-font', fontStack);

		buildMarkerLabel(
			wrapper,
			this.marker.note,
			this.marker.alias,
			this.marker.description,
			'ttrpgmap-edit-preview-label',
		);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('ttrpgmap-modal--x-wide');
		this.titleEl.setText(this.isNew ? 'Create marker' : 'Edit marker');

		const template = this.getTemplate();

		// Two-column layout: settings left, preview right
		const headerGroup = contentEl.createDiv({ cls: 'setting-group' });
		const layout = headerGroup.createDiv({ cls: 'ttrpgmap-modal-layout' });
		const mainCol = layout.createDiv({ cls: 'ttrpgmap-modal-main' });
		const previewContainer = layout.createDiv({ cls: 'ttrpgmap-edit-preview' });
		this.renderPreview(previewContainer);

		const infoItems = mainCol.createDiv({ cls: 'setting-items' });
		this.buildMainFields(infoItems, template, previewContainer);
		this.buildAdditionalOptions(contentEl, previewContainer);
		this.buildSizeOverrides(contentEl);
		this.buildFooter(contentEl, template);
	}

	private buildMainFields(
		container: HTMLElement,
		template: MarkerTemplate | undefined,
		previewContainer: HTMLElement,
	): void {
		new Setting(container).setName('Template').addDropdown((dropdown) => {
			for (const t of this.plugin.settings.markerTemplates) {
				dropdown.addOption(t.id, t.name);
			}
			dropdown.setValue(this.marker.templateId);
			dropdown.onChange((value) => {
				this.marker.templateId = value;
				const newTemplate = this.plugin.settings.markerTemplates.find((t) => t.id === value);
				if (newTemplate) {
					this.marker.direction = newTemplate.direction;
					this.marker.textPlacement = newTemplate.textPlacement;
					this.marker.color = newTemplate.color;
					this.marker.icon = newTemplate.icon;
					this.marker.iconColor = newTemplate.iconColor;
					this.marker.iconRotation = newTemplate.iconRotation;
					this.marker.useBaseMarker = newTemplate.useBaseMarker;
					this.marker.shape = newTemplate.shape;
				}
				activeWindow.requestAnimationFrame(() => this.onOpen());
			});
		});

		if (this.layers.length > 1) {
			new Setting(container)
				.setName('Layer')
				.setDesc('Visibility layer for zoom-based show/hide')
				.addDropdown((dropdown) => {
					for (const layer of this.layers) {
						dropdown.addOption(layer.id, layer.name);
					}
					dropdown.setValue(this.marker.layerId ?? DEFAULT_LAYER_ID);
					dropdown.onChange((value) => {
						this.marker.layerId = value === DEFAULT_LAYER_ID ? null : value;
					});
				});
		}

		new Setting(container)
			.setName('Note')
			.setDesc('Link to a note. Type # for headings, #^ for blocks')
			.addText((text) => {
				text
					.setPlaceholder('Search for a note...')
					.setValue(this.marker.note ?? '')
					.onChange((value) => {
						this.marker.note = value || null;
						this.renderPreview(previewContainer);
					});
				new NoteLinkSuggest(this.app, text.inputEl, (value) => {
					this.marker.note = value || null;
					this.renderPreview(previewContainer);
				});
			});

		// Appearance fields (text placement, pin, icon)
		const fieldState = this.getFieldState();
		const ctx = {
			app: this.app,
			contentEl: container,
			state: fieldState,
			onChanged: () => {
				this.syncFromFieldState(fieldState);
				this.renderPreview(previewContainer);
			},
		};

		const tpSetting = buildTextPlacementField(ctx);
		tpSetting.setDesc('');
		this.addResetButton(tpSetting, () => {
			this.marker.textPlacement = template?.textPlacement ?? 'above';
		});

		const pinSetting = buildPinSelectorField(ctx);
		this.addResetButton(pinSetting, () => {
			this.marker.useBaseMarker = template?.useBaseMarker ?? true;
			this.marker.direction = template?.direction ?? 'down';
			this.marker.color = template?.color ?? '#ffffff';
		});

		const { setting: iconSetting, colorPicker: iconColorPicker } = buildIconField(ctx);
		this.addResetButton(iconSetting, () => {
			this.marker.icon = template?.icon ?? null;
			this.marker.iconColor = template?.iconColor ?? '#000000';
			iconColorPicker.setValue(this.marker.iconColor);
		});
	}

	private buildAdditionalOptions(contentEl: HTMLElement, previewContainer: HTMLElement): void {
		const group = contentEl.createDiv({ cls: 'setting-group' });
		const expanded = additionalOptionsExpanded.get(this.app) ?? false;

		const heading = new Setting(group).setName('').setHeading();
		const nameRow = heading.nameEl.createDiv({ cls: 'ttrpgmap-collapsible-heading' });
		const chevron = nameRow.createSpan({ cls: 'ttrpgmap-folder-chevron' });
		setIcon(chevron, 'chevron-down');
		nameRow.createSpan({ text: 'Additional options' });
		heading.settingEl.setCssStyles({ cursor: 'pointer' });

		const items = group.createDiv({ cls: 'setting-items ttrpgmap-collapsible-content' });
		if (!expanded) {
			items.addClass('is-collapsed');
			chevron.addClass('is-collapsed');
		}
		heading.settingEl.addEventListener('click', () => {
			const expanding = items.hasClass('is-collapsed');
			items.toggleClass('is-collapsed', !expanding);
			chevron.toggleClass('is-collapsed', !expanding);
			additionalOptionsExpanded.set(this.app, expanding);
		});

		new Setting(items)
			.setName('Alias')
			.setDesc('Display name shown instead of the note filename')
			.addText((text) => {
				text
					.setPlaceholder('Display name...')
					.setValue(this.marker.alias ?? '')
					.onChange((value) => {
						this.marker.alias = value || null;
						this.renderPreview(previewContainer);
					});
			});

		new Setting(items)
			.setName('Preview note')
			.setDesc('Note shown on hover preview (blank uses the linked note)')
			.addText((text) => {
				text
					.setPlaceholder('Search for a note...')
					.setValue(this.marker.previewNote ?? '')
					.onChange((value) => {
						this.marker.previewNote = value || null;
					});
				new NoteLinkSuggest(this.app, text.inputEl, (value) => {
					this.marker.previewNote = value || null;
				});
			});

		new Setting(items)
			.setName('Description')
			.setDesc('Additional text shown below the note name')
			.addTextArea((textArea) => {
				textArea.setValue(this.marker.description ?? '').onChange((value) => {
					this.marker.description = value || null;
					this.renderPreview(previewContainer);
				});
				textArea.inputEl.addClass('ttrpgmap-description-input');
				textArea.inputEl.rows = 3;
			});

		const fontSetting = new Setting(items).setName('Label font').setDesc("Font family for this marker's label");
		buildFontDropdown({
			setting: fontSetting,
			value: this.marker.font ?? 'inherit',
			includeInherit: true,
			onChange: (value) => {
				if (value === 'inherit') this.marker.font = null;
				else this.marker.font = value;
				this.renderPreview(previewContainer);
			},
		});
	}

	private buildSizeOverrides(contentEl: HTMLElement): void {
		const group = contentEl.createDiv({ cls: 'setting-group' });
		const expanded = sizeOverridesExpanded.get(this.app) ?? false;

		const heading = new Setting(group).setName('').setHeading();
		const nameRow = heading.nameEl.createDiv({ cls: 'ttrpgmap-collapsible-heading' });
		const chevron = nameRow.createSpan({ cls: 'ttrpgmap-folder-chevron' });
		setIcon(chevron, 'chevron-down');
		nameRow.createSpan({ text: 'Size overrides' });
		heading.settingEl.setCssStyles({ cursor: 'pointer' });

		const items = group.createDiv({ cls: 'setting-items ttrpgmap-collapsible-content' });
		if (!expanded) {
			items.addClass('is-collapsed');
			chevron.addClass('is-collapsed');
		}
		heading.settingEl.addEventListener('click', () => {
			const expanding = items.hasClass('is-collapsed');
			items.toggleClass('is-collapsed', !expanding);
			chevron.toggleClass('is-collapsed', !expanding);
			sizeOverridesExpanded.set(this.app, expanding);
		});

		const hasScaleOverride = this.marker.scale != null;
		const markerScaleSetting = new Setting(items)
			.setName('Marker size')
			.setDesc('Override the map marker scale for this marker');

		const scaleControls = buildScaleSlider({
			setting: markerScaleSetting,
			value: this.marker.scale ?? 1.0,
			onChange: (value) => {
				this.marker.scale = value;
			},
			disabled: !hasScaleOverride,
		});

		markerScaleSetting.addToggle((toggle) => {
			toggle.setValue(hasScaleOverride).onChange((enabled) => {
				if (enabled) {
					scaleControls.setDisabled(false);
					scaleControls.setValue(1.0);
					this.marker.scale = 1.0;
				} else {
					scaleControls.setDisabled(true);
					scaleControls.setValue(1.0);
					this.marker.scale = null;
				}
			});
		});

		new Setting(items)
			.setName('Scale to zoom')
			.setDesc('How this marker behaves when zooming')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('inherit', 'Inherit')
					.addOption('screen', 'Screen-constant')
					.addOption('map', 'Fixed to map')
					.setValue(this.marker.scaleToZoom === null ? 'inherit' : this.marker.scaleToZoom ? 'screen' : 'map')
					.onChange((value) => {
						if (value === 'inherit') this.marker.scaleToZoom = null;
						else if (value === 'screen') this.marker.scaleToZoom = true;
						else this.marker.scaleToZoom = false;
					});
			});

		const hasTextScaleOverride = this.marker.textScale != null;
		const textScaleSetting = new Setting(items)
			.setName('Text size')
			.setDesc('Override the text label scale for this marker');

		const textScaleControls = buildScaleSlider({
			setting: textScaleSetting,
			value: this.marker.textScale ?? 1.0,
			onChange: (value) => {
				this.marker.textScale = value;
			},
			disabled: !hasTextScaleOverride,
		});

		textScaleSetting.addToggle((toggle) => {
			toggle.setValue(hasTextScaleOverride).onChange((enabled) => {
				if (enabled) {
					textScaleControls.setDisabled(false);
					textScaleControls.setValue(1.0);
					this.marker.textScale = 1.0;
				} else {
					textScaleControls.setDisabled(true);
					textScaleControls.setValue(1.0);
					this.marker.textScale = null;
				}
			});
		});

		new Setting(items)
			.setName('Text scale to zoom')
			.setDesc("How this marker's text behaves when zooming")
			.addDropdown((dropdown) => {
				dropdown
					.addOption('inherit', 'Inherit')
					.addOption('screen', 'Screen-constant')
					.addOption('map', 'Fixed to map')
					.setValue(this.marker.textScaleToZoom === null ? 'inherit' : this.marker.textScaleToZoom ? 'screen' : 'map')
					.onChange((value) => {
						if (value === 'inherit') this.marker.textScaleToZoom = null;
						else if (value === 'screen') this.marker.textScaleToZoom = true;
						else this.marker.textScaleToZoom = false;
					});
			});
	}

	private buildFooter(contentEl: HTMLElement, template: MarkerTemplate | undefined): void {
		const hasTemplate = !!template;
		new Setting(contentEl)
			.addButton((btn) => {
				btn
					.setButtonText('Reset to template')
					.setDisabled(!hasTemplate)
					.onClick(() => {
						const tpl = this.getTemplate();
						if (!tpl) return;
						void confirmAction(
							this.app,
							'Reset to template',
							`This will reset all visual properties to match the "${tpl.name}" template. You can review the changes before saving.`,
							'Reset',
						).then((confirmed) => {
							if (!confirmed) return;
							this.marker.direction = tpl.direction;
							this.marker.textPlacement = tpl.textPlacement;
							this.marker.color = tpl.color;
							this.marker.icon = tpl.icon;
							this.marker.iconColor = tpl.iconColor;
							this.marker.iconRotation = tpl.iconRotation;
							this.marker.useBaseMarker = tpl.useBaseMarker;
							this.marker.shape = tpl.shape;
							this.marker.scale = null;
							this.marker.scaleToZoom = null;
							this.marker.textScale = null;
							this.marker.textScaleToZoom = null;
							this.onOpen();
						});
					});
				if (!hasTemplate) btn.setTooltip('Template not found');
			})
			.addButton((btn) =>
				btn
					.setButtonText('Save')
					.setCta()
					.onClick(() => {
						const usePin = this.marker.useBaseMarker ?? true;
						if (!usePin && !this.marker.icon) {
							new Notice('A marker must have either a pin shape or an icon.');
							return;
						}
						this.onSave(this.marker);
						this.close();
					}),
			)
			.addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
