import { App, Modal, Setting } from 'obsidian';
import type TTRPGMapsPlugin from '../main';
import { MapMarker, MarkerLayer, DEFAULT_LAYER_ID, TextVisibility } from '../types';
import { NoteLinkSuggest } from '../suggests/NoteLinkSuggest';
import { createColorPicker } from '../utils/colorPicker';
import { buildFontDropdown } from './sharedFields';
import { resolveZonePoints, zoneBounds, zonePointsAttr, darkenHex } from '../utils/zoneGeometry';

/**
 * Editor for hot zones (markers with `shape === 'area'`).
 *
 * Deliberately separate from MarkerEditModal: a zone has no pin shape,
 * direction, icon, or scale overrides, so sharing that modal would mean
 * hiding most of it. Zones carry no template in this version, so there are no
 * reset-to-template controls either.
 */
export class ZoneEditModal extends Modal {
	private plugin: TTRPGMapsPlugin;
	private layers: MarkerLayer[];
	private marker: MapMarker;
	private onSave: (marker: MapMarker) => void;
	private onRedraw: () => void;
	private isNew: boolean;
	/** What "Inherit" text visibility resolves to for this zone (map, else global). */
	private inheritedTextVisibility: TextVisibility;

	constructor(
		app: App,
		plugin: TTRPGMapsPlugin,
		marker: MapMarker,
		layers: MarkerLayer[],
		onSave: (marker: MapMarker) => void,
		onRedraw: () => void,
		isNew = false,
		inheritedTextVisibility: TextVisibility = 'visible',
	) {
		super(app);
		this.plugin = plugin;
		this.marker = { ...marker };
		this.layers = layers;
		this.onSave = onSave;
		this.onRedraw = onRedraw;
		this.isNew = isNew;
		this.inheritedTextVisibility = inheritedTextVisibility;
	}

	/** Human-readable label for a text-visibility value. */
	private static visibilityLabel(v: TextVisibility): string {
		return v === 'visible' ? 'Always visible' : v === 'hover' ? 'Mouseover only' : 'Hidden';
	}

	/** Draw the zone's real outline, scaled to fit the preview box. */
	private renderPreview(container: HTMLElement): void {
		container.empty();
		const absolute = resolveZonePoints(this.marker);
		if (absolute.length === 0) {
			container.createSpan({ text: 'No shape drawn', cls: 'ttrpgmap-muted' });
			return;
		}

		const b = zoneBounds(absolute);
		// Pad the viewBox so the stroke isn't clipped at the edges.
		const pad = Math.max(b.width, b.height) * 0.06 + 2;
		const svg = createSvg('svg', {
			cls: 'ttrpgmap-zone-preview-svg',
			attr: {
				viewBox: `${b.minX - pad} ${b.minY - pad} ${b.width + pad * 2} ${b.height + pad * 2}`,
				preserveAspectRatio: 'xMidYMid meet',
			},
		});
		const fill = this.marker.color ?? '#ffffff';
		const polygon = createSvg('polygon', {
			attr: {
				points: zonePointsAttr(absolute, 1, 1),
				fill,
				'fill-opacity': String(1 - Math.min(100, Math.max(0, this.marker.transparency ?? 0)) / 100),
				stroke: darkenHex(fill),
				'stroke-width': String(Math.max(1, Math.max(b.width, b.height) * 0.01)),
			},
		});
		svg.appendChild(polygon);
		container.appendChild(svg);

		container.createDiv({
			cls: 'ttrpgmap-muted ttrpgmap-zone-preview-meta',
			text: `${absolute.length} points`,
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('ttrpgmap-modal--x-wide');
		this.titleEl.setText(this.isNew ? 'Create hot zone' : 'Edit hot zone');

		const headerGroup = contentEl.createDiv({ cls: 'setting-group' });
		const layout = headerGroup.createDiv({ cls: 'ttrpgmap-modal-layout' });
		const mainCol = layout.createDiv({ cls: 'ttrpgmap-modal-main' });
		const previewContainer = layout.createDiv({ cls: 'ttrpgmap-edit-preview' });
		this.renderPreview(previewContainer);

		const items = mainCol.createDiv({ cls: 'setting-items' });
		this.buildFields(items, previewContainer);
		this.buildFooter(contentEl);
	}

	private buildFields(container: HTMLElement, previewContainer: HTMLElement): void {
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
					});
				new NoteLinkSuggest(this.app, text.inputEl, (value) => {
					this.marker.note = value || null;
				});
			});

		new Setting(container)
			.setName('Alias')
			.setDesc('Display name shown instead of the note filename')
			.addText((text) => {
				text
					.setPlaceholder('Display name...')
					.setValue(this.marker.alias ?? '')
					.onChange((value) => {
						this.marker.alias = value || null;
					});
			});

		new Setting(container)
			.setName('Description')
			.setDesc('Additional text shown below the note name')
			.addTextArea((textArea) => {
				textArea.setValue(this.marker.description ?? '').onChange((value) => {
					this.marker.description = value || null;
				});
				textArea.inputEl.addClass('ttrpgmap-description-input');
				textArea.inputEl.rows = 3;
			});

		// ── Appearance ──
		const fillSetting = new Setting(container)
			.setName('Fill color')
			.setDesc('Outline is derived from this color and shown on hover');
		const colorWrap = fillSetting.controlEl.createDiv({ cls: 'ttrpgmap-icon-color-wrap' });
		createColorPicker({
			container: colorWrap,
			value: this.marker.color ?? '#ffffff',
			onChange: (hex) => {
				this.marker.color = hex;
				this.renderPreview(previewContainer);
			},
		});

		const transparencySetting = new Setting(container)
			.setName('Transparency')
			.setDesc('0% is fully opaque, 100% is invisible until hovered');
		const transpWrap = transparencySetting.controlEl.createDiv({
			cls: 'ttrpgmap-pin-selector-transparency-wrap',
		});
		const clamp = (v: number) => Math.min(100, Math.max(0, v));
		const initial = clamp(this.marker.transparency ?? 0);
		const slider = transpWrap.createEl('input', {
			cls: 'ttrpgmap-pin-transparency-slider',
			type: 'range',
			attr: { min: '0', max: '100', step: '1' },
			value: String(initial),
		});
		const numberInput = transpWrap.createEl('input', {
			cls: 'ttrpgmap-pin-transparency-input',
			type: 'number',
			attr: { min: '0', max: '100', step: '1' },
			value: String(initial),
		});
		const applyTransparency = (v: number) => {
			this.marker.transparency = clamp(v);
			this.renderPreview(previewContainer);
		};
		slider.addEventListener('input', () => {
			const v = parseInt(slider.value, 10);
			if (isNaN(v)) return;
			numberInput.value = String(v);
			applyTransparency(v);
		});
		numberInput.addEventListener('input', () => {
			const v = parseInt(numberInput.value, 10);
			if (isNaN(v)) return;
			slider.value = String(clamp(v));
			applyTransparency(v);
		});

		// ── Label ──
		new Setting(container)
			.setName('Label placement')
			.setDesc('Where the label sits relative to the zone center')
			.addDropdown((dropdown) => {
				dropdown.addOption('above', 'Above');
				dropdown.addOption('below', 'Below');
				dropdown.setValue(this.marker.textPlacement === 'below' ? 'below' : 'above');
				dropdown.onChange((value) => {
					this.marker.textPlacement = value === 'below' ? 'below' : 'above';
				});
			});

		new Setting(container)
			.setName('Text visibility')
			.setDesc(
				`Whether the zone label is shown. Inherit uses this map's setting (currently ${ZoneEditModal.visibilityLabel(
					this.inheritedTextVisibility,
				)}).`,
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption('inherit', 'Inherit')
					.addOption('visible', 'Always visible')
					.addOption('hover', 'Mouseover only')
					.addOption('hidden', 'Hidden')
					.setValue(this.marker.textVisibility ?? 'inherit')
					.onChange((value) => {
						this.marker.textVisibility = value === 'inherit' ? null : (value as TextVisibility);
					});
			});

		const fontSetting = new Setting(container).setName('Label font').setDesc("Font family for this zone's label");
		buildFontDropdown({
			setting: fontSetting,
			value: this.marker.font ?? 'inherit',
			includeInherit: true,
			onChange: (value) => {
				this.marker.font = value === 'inherit' ? null : value;
			},
		});
	}

	private buildFooter(contentEl: HTMLElement): void {
		const footer = contentEl.createDiv({ cls: 'modal-button-container' });

		const redrawBtn = footer.createEl('button', { text: 'Redraw shape' });
		redrawBtn.title = 'Discard this outline and draw a new one';
		redrawBtn.addEventListener('click', () => {
			this.close();
			this.onRedraw();
		});

		const cancelBtn = footer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = footer.createEl('button', { cls: 'mod-cta', text: 'Save' });
		saveBtn.addEventListener('click', () => {
			this.onSave(this.marker);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
