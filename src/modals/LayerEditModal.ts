import { App, Modal, Setting } from 'obsidian';
import { MarkerLayer, DEFAULT_LAYER_ID } from '../types';

interface LayerEditOptions {
	layer: MarkerLayer;
	mapZoomMin: number;
	mapZoomMax: number;
	onSave: (layer: MarkerLayer) => void;
	isNew?: boolean;
}

export class LayerEditModal extends Modal {
	private layer: MarkerLayer;
	private isDefault: boolean;
	private isNew: boolean;
	private mapZoomMin: number;
	private mapZoomMax: number;
	private onSave: (layer: MarkerLayer) => void;

	constructor(app: App, opts: LayerEditOptions) {
		super(app);
		this.layer = { ...opts.layer };
		this.isDefault = opts.layer.id === DEFAULT_LAYER_ID;
		this.isNew = opts.isNew ?? false;
		this.mapZoomMin = opts.mapZoomMin;
		this.mapZoomMax = opts.mapZoomMax;
		this.onSave = opts.onSave;
	}

	private validate(): string | null {
		const { zoomMin, zoomMax } = this.layer;
		if (zoomMin != null && zoomMax != null) {
			if (zoomMin >= zoomMax) return 'The zoomed-out limit must be less than the zoomed-in limit.';
		}
		return null;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		const group = contentEl.createDiv({ cls: 'setting-group' });
		this.titleEl.setText(this.isNew ? 'Create layer' : this.isDefault ? 'Edit default layer' : 'Edit layer');
		const items = group.createDiv({ cls: 'setting-items' });

		const nameSetting = new Setting(items).setName('Name').addText((text) => {
			text.setValue(this.layer.name).onChange((value) => {
				this.layer.name = value || 'Unnamed Layer';
				errorEl.addClass('ttrpgmap-hidden');
			});
			if (this.isDefault) {
				text.setDisabled(true);
			}
		});

		if (this.isDefault) {
			nameSetting.setDesc('The default layer name cannot be changed.');
		}

		// ── Zoom visibility range slider ──
		new Setting(items).setName('Visibility range');

		const rangeContainer = items.createDiv({ cls: 'ttrpgmap-zoom-range' });

		const trackMin = this.mapZoomMin;
		const trackMax = this.mapZoomMax;
		const currentMin = this.layer.zoomMin ?? trackMin;
		const currentMax = this.layer.zoomMax ?? trackMax;

		// Labels row with editable text inputs for bounds
		const labelsRow = rangeContainer.createDiv({ cls: 'ttrpgmap-zoom-range-labels' });

		const leftGroup = labelsRow.createDiv({ cls: 'ttrpgmap-zoom-range-bound' });
		leftGroup.createSpan({ text: 'Zoomed' });
		leftGroup.createEl('br');
		leftGroup.createSpan({ text: 'out' });

		const minText = labelsRow.createEl('input', {
			cls: 'ttrpgmap-zoom-range-text',
			type: 'number',
			attr: { min: String(trackMin), max: String(trackMax), step: '1' },
			value: currentMin <= trackMin ? '' : String(currentMin),
		});
		minText.placeholder = String(trackMin);

		const rangeDisplay = labelsRow.createSpan({ cls: 'ttrpgmap-zoom-range-display' });

		const maxText = labelsRow.createEl('input', {
			cls: 'ttrpgmap-zoom-range-text',
			type: 'number',
			attr: { min: String(trackMin), max: String(trackMax), step: '1' },
			value: currentMax >= trackMax ? '' : String(currentMax),
		});
		maxText.placeholder = String(trackMax);

		const rightGroup = labelsRow.createDiv({ cls: 'ttrpgmap-zoom-range-bound' });
		rightGroup.createSpan({ text: 'Zoomed' });
		rightGroup.createEl('br');
		rightGroup.createSpan({ text: 'in' });

		// Track with two range inputs
		const track = rangeContainer.createDiv({ cls: 'ttrpgmap-zoom-range-track' });
		const highlight = track.createDiv({ cls: 'ttrpgmap-zoom-range-highlight' });

		const minSlider = track.createEl('input', {
			cls: 'ttrpgmap-zoom-range-input',
			type: 'range',
			attr: { min: String(trackMin), max: String(trackMax), step: '1' },
			value: String(currentMin),
		});

		const maxSlider = track.createEl('input', {
			cls: 'ttrpgmap-zoom-range-input',
			type: 'range',
			attr: { min: String(trackMin), max: String(trackMax), step: '1' },
			value: String(currentMax),
		});

		const getValues = () => ({
			lo: parseInt(minSlider.value, 10),
			hi: parseInt(maxSlider.value, 10),
		});

		const updateAll = () => {
			const { lo, hi } = getValues();

			// Update text inputs
			minText.value = lo <= trackMin ? '' : String(lo);
			maxText.value = hi >= trackMax ? '' : String(hi);

			// Update display
			if (lo <= trackMin && hi >= trackMax) {
				rangeDisplay.setText('Always visible');
			} else {
				const loLabel = lo <= trackMin ? `${trackMin}%` : `${lo}%`;
				const hiLabel = hi >= trackMax ? `${trackMax}%` : `${hi}%`;
				rangeDisplay.setText(`${loLabel} \u2013 ${hiLabel}`);
			}

			// Position the highlight bar
			const range = trackMax - trackMin;
			const leftPct = ((lo - trackMin) / range) * 100;
			const rightPct = ((trackMax - hi) / range) * 100;
			highlight.setCssStyles({ left: `${leftPct}%`, right: `${rightPct}%` });

			// Update layer state
			this.layer.zoomMin = lo <= trackMin ? null : lo;
			this.layer.zoomMax = hi >= trackMax ? null : hi;

			errorEl.addClass('ttrpgmap-hidden');
		};

		const errorEl = contentEl.createDiv({ cls: 'ttrpgmap-field-error' });
		errorEl.addClass('ttrpgmap-hidden');

		updateAll();

		// Slider events
		minSlider.addEventListener('input', () => {
			const { lo, hi } = getValues();
			if (lo > hi) minSlider.value = maxSlider.value;
			updateAll();
		});

		maxSlider.addEventListener('input', () => {
			const { lo, hi } = getValues();
			if (hi < lo) maxSlider.value = minSlider.value;
			updateAll();
		});

		// Text input events -- only validate and sync on blur or Enter
		const syncMinText = () => {
			const val = minText.value ? parseInt(minText.value, 10) : trackMin;
			if (isNaN(val)) return;
			const clamped = Math.max(trackMin, Math.min(trackMax, val));
			const hi = parseInt(maxSlider.value, 10);
			minSlider.value = String(clamped > hi ? hi : clamped);
			updateAll();
		};
		minText.addEventListener('blur', syncMinText);
		minText.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') syncMinText();
		});

		const syncMaxText = () => {
			const val = maxText.value ? parseInt(maxText.value, 10) : trackMax;
			if (isNaN(val)) return;
			const clamped = Math.max(trackMin, Math.min(trackMax, val));
			const lo = parseInt(minSlider.value, 10);
			maxSlider.value = String(clamped < lo ? lo : clamped);
			updateAll();
		};
		maxText.addEventListener('blur', syncMaxText);
		maxText.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') syncMaxText();
		});

		const footer = contentEl.createDiv({ cls: 'modal-button-container' });
		const cancelBtn = footer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
		const saveBtn = footer.createEl('button', { cls: 'mod-cta', text: 'Save' });
		saveBtn.addEventListener('click', () => {
			const err = this.validate();
			if (err) {
				errorEl.setText(err);
				errorEl.removeClass('ttrpgmap-hidden');
				return;
			}
			this.onSave(this.layer);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
