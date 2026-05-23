import { App, Setting } from 'obsidian';
import { MarkerDirection, TextPlacement, MarkerFont, getAvailableMarkerFonts, getMarkerFontStack } from '../types';
import { IconSuggest } from '../suggests/IconSuggest';
import { setMapIcon, getMapIcon } from '../utils/mapIcon';

import { createPinSelector, PinSelection } from '../utils/pinSelector';
import { createColorPicker } from '../utils/colorPicker';

/** Shared state bag for the fields below */
export interface MarkerFieldState {
	icon: string | null;
	iconColor: string;
	iconRotation: number;
	direction: MarkerDirection;
	textPlacement: TextPlacement;
	color: string;
	useBaseMarker: boolean;
	shape: 'pin' | 'circle' | 'hotspot';
}

interface FieldContext {
	app: App;
	contentEl: HTMLElement;
	state: MarkerFieldState;
	onChanged: () => void;
}

/** Text Placement dropdown. Returns the Setting for adding extras (e.g. reset button). */
export function buildTextPlacementField(ctx: FieldContext): Setting {
	const setting = new Setting(ctx.contentEl)
		.setName('Text placement')
		.setDesc('Where the label appears relative to the marker')
		.addDropdown((dropdown) => {
			dropdown.addOption('above', 'Above');
			dropdown.addOption('below', 'Below');
			dropdown.addOption('left', 'Left');
			dropdown.addOption('right', 'Right');
			dropdown.setValue(ctx.state.textPlacement);
			dropdown.onChange((value) => {
				ctx.state.textPlacement = value as TextPlacement;
				ctx.onChanged();
			});
		});
	return setting;
}

/** Pin selector (direction + color button group). Returns the Setting. */
export function buildPinSelectorField(ctx: FieldContext): Setting {
	const setting = new Setting(ctx.contentEl).setName('Pin');
	const container = setting.controlEl.createDiv();
	let selected: PinSelection;
	if (!ctx.state.useBaseMarker) {
		selected = 'none';
	} else if (ctx.state.shape === 'hotspot') {
		selected = 'hotspot';
	} else if (ctx.state.shape === 'circle') {
		selected = 'circle';
	} else {
		selected = ctx.state.direction as PinSelection;
	}

	createPinSelector({
		container,
		selected,
		color: ctx.state.color,
		onChange: (value) => {
			if (value === 'none') {
				ctx.state.useBaseMarker = false;
			} else if (value === 'hotspot') {
				ctx.state.useBaseMarker = true;
				ctx.state.shape = 'hotspot';
			} else if (value === 'circle') {
				ctx.state.useBaseMarker = true;
				ctx.state.shape = 'circle';
			} else {
				ctx.state.useBaseMarker = true;
				ctx.state.shape = 'pin';
				ctx.state.direction = value as MarkerDirection;
			}
			ctx.onChanged();
		},
		onColorChange: (color) => {
			ctx.state.color = color;
			ctx.onChanged();
		},
	});

	return setting;
}

/** Icon search + rotation + color picker. */
export function buildIconField(ctx: FieldContext): {
	setting: Setting;
	colorPicker: { setValue: (hex: string) => void };
	rotationInput: { setValue: (deg: number) => void };
} {
	const setting = new Setting(ctx.contentEl).setName('Icon');
	// Mark the setting row so its CSS rules can match without using
	// `:has(.ttrpgmap-icon-input-wrap)` on every .setting-item.
	setting.settingEl.addClass('ttrpgmap-icon-setting');

	// Wrapper that looks like a dropdown with icon + text + source badge
	const inputWrap = setting.controlEl.createDiv({ cls: 'ttrpgmap-icon-input-wrap' });
	const iconPreview = inputWrap.createDiv({ cls: 'ttrpgmap-icon-input-preview' });
	// Create source badge early so updateInputPreview can reference it (DOM order fixed later)
	const sourceEl = inputWrap.createSpan({ cls: 'ttrpgmap-icon-input-source' });

	function updateInputPreview() {
		iconPreview.empty();
		if (ctx.state.icon) {
			setMapIcon(iconPreview, ctx.state.icon);
			iconPreview.removeClass('ttrpgmap-hidden');
			const icon = getMapIcon(ctx.state.icon);
			sourceEl.setText(icon ? (icon.set === 'gi' ? 'Game Icons' : 'FA') : '');
			if (icon) {
				sourceEl.removeClass('ttrpgmap-hidden');
			} else {
				sourceEl.addClass('ttrpgmap-hidden');
			}
		} else {
			iconPreview.addClass('ttrpgmap-hidden');
			sourceEl.setText('');
			sourceEl.addClass('ttrpgmap-hidden');
		}
	}

	setting.addText((text) => {
		const inputEl = text.inputEl;

		// Auto-size input to content width, wide enough for placeholder when empty
		function autoSize() {
			inputEl.setCssStyles({ width: '0' });
			const minWidth = inputEl.value ? 80 : 150;
			inputEl.setCssStyles({ width: Math.max(inputEl.scrollWidth, minWidth) + 'px' });
		}

		text
			.setPlaceholder('Search for an icon...')
			.setValue(ctx.state.icon ?? '')
			.onChange((value) => {
				ctx.state.icon = value || null;
				updateInputPreview();
				autoSize();
				ctx.onChanged();
			});
		// Move the input element inside our styled wrapper
		inputWrap.appendChild(inputEl);
		autoSize();

		// Select all text on focus, but not on subsequent clicks
		let justFocused = false;
		inputEl.addEventListener('focus', () => {
			justFocused = true;
			inputEl.select();
		});
		inputEl.addEventListener('mouseup', (e) => {
			if (justFocused) {
				e.preventDefault();
				justFocused = false;
			}
		});

		new IconSuggest(ctx.app, text.inputEl, (value) => {
			ctx.state.icon = value || null;
			text.setValue(value || '');
			updateInputPreview();
			autoSize();
			ctx.onChanged();
		});
	});

	updateInputPreview();

	// Inline rotation (between search and color)
	const rotationWrap = setting.controlEl.createDiv({ cls: 'ttrpgmap-icon-rotation-inline' });
	rotationWrap.createSpan({ cls: 'ttrpgmap-icon-color-label', text: 'Rot:' });
	const rotationSlider = rotationWrap.createEl('input', {
		cls: 'ttrpgmap-icon-rotation-slider',
		type: 'range',
		attr: { min: '0', max: '359', step: '1' },
		value: String(ctx.state.iconRotation ?? 0),
	});
	const rotationInput = rotationWrap.createEl('input', {
		cls: 'ttrpgmap-icon-rotation-input',
		type: 'number',
		attr: { min: '0', max: '359', step: '1' },
		value: String(ctx.state.iconRotation ?? 0),
	});
	const updateRotation = (val: number) => {
		ctx.state.iconRotation = ((val % 360) + 360) % 360;
		ctx.onChanged();
	};
	rotationSlider.addEventListener('input', () => {
		const val = parseInt(rotationSlider.value, 10);
		if (!isNaN(val)) {
			rotationInput.value = String(val);
			updateRotation(val);
		}
	});
	rotationInput.addEventListener('input', () => {
		const val = parseInt(rotationInput.value, 10);
		if (!isNaN(val)) {
			rotationSlider.value = String(((val % 360) + 360) % 360);
			updateRotation(val);
		}
	});

	// Inline color picker (same row as icon search)
	const colorWrap = setting.controlEl.createDiv({ cls: 'ttrpgmap-icon-color-wrap' });
	colorWrap.createSpan({ cls: 'ttrpgmap-icon-color-label', text: 'Color:' });
	const colorPicker = createColorPicker({
		container: colorWrap,
		value: ctx.state.iconColor,
		onChange: (hex) => {
			ctx.state.iconColor = hex;
			ctx.onChanged();
		},
	});

	return {
		setting,
		colorPicker,
		rotationInput: {
			setValue(deg: number) {
				rotationInput.value = String(deg);
				rotationSlider.value = String(deg);
			},
		},
	};
}

// ── Scale slider + text input ──

export interface ScaleSliderControls {
	setValue: (fraction: number) => void;
	setDisabled: (disabled: boolean) => void;
}

interface ScaleSliderOpts {
	setting: Setting;
	value: number;
	onChange: (value: number) => void;
	disabled?: boolean;
}

/**
 * Add a linked slider (25-300%) + text input to a Setting.
 * Both controls stay in sync. Values are in fractions (1.0 = 100%).
 */
export interface PercentSliderControls {
	setValue: (pct: number) => void;
	setDisabled: (disabled: boolean) => void;
}

interface PercentSliderOpts {
	setting: Setting;
	value: number;
	min?: number;
	max?: number;
	step?: number;
	onChange: (value: number) => void;
	disabled?: boolean;
}

/**
 * Add a linked slider + text input to a Setting.
 * Values are direct integers (e.g. 0-100 for opacity).
 */
export function buildPercentSlider(opts: PercentSliderOpts): PercentSliderControls {
	const { setting, value, min = 0, max = 100, step = 1, onChange, disabled = false } = opts;
	let sliderRef: { setValue: (v: number) => unknown; setDisabled: (d: boolean) => unknown } | null = null;
	let textRef: { setValue: (v: string) => unknown; setDisabled: (d: boolean) => unknown } | null = null;

	setting.addSlider((slider) => {
		sliderRef = slider;
		slider
			.setLimits(min, max, step)
			.setValue(value)
			.onChange((v: number) => {
				if (textRef) textRef.setValue(String(v));
				onChange(v);
			});
		slider.sliderEl.addEventListener('input', () => {
			const v = parseInt(slider.sliderEl.value, 10);
			if (textRef) textRef.setValue(String(v));
		});
		if (disabled) slider.setDisabled(true);
	});

	setting.addText((text) => {
		textRef = text;
		text.inputEl.type = 'number';
		text.inputEl.min = String(min);
		text.inputEl.max = String(max);
		text.inputEl.step = String(step);
		text.inputEl.addClass('ttrpgmap-scale-input');
		text.setValue(String(value)).onChange((v: string) => {
			const num = parseInt(v, 10);
			if (!isNaN(num) && num >= min && num <= max) {
				if (sliderRef) sliderRef.setValue(num);
				onChange(num);
			}
		});
		if (disabled) text.setDisabled(true);
	});

	return {
		setValue(pct: number) {
			if (sliderRef) sliderRef.setValue(pct);
			if (textRef) textRef.setValue(String(pct));
		},
		setDisabled(d: boolean) {
			if (sliderRef) sliderRef.setDisabled(d);
			if (textRef) textRef.setDisabled(d);
		},
	};
}

const SCALE_MIN = 10;
const SCALE_MAX = 1000;
const SCALE_STEP = 5;

export function buildScaleSlider(opts: ScaleSliderOpts): ScaleSliderControls {
	const { setting, value, onChange, disabled = false } = opts;
	let sliderRef: { setValue: (v: number) => unknown; setDisabled: (d: boolean) => unknown } | null = null;
	let textRef: { setValue: (v: string) => unknown; setDisabled: (d: boolean) => unknown } | null = null;

	setting.addSlider((slider) => {
		sliderRef = slider;
		slider
			.setLimits(SCALE_MIN, SCALE_MAX, SCALE_STEP)
			.setValue(Math.round(value * 100))
			.onChange((v: number) => {
				if (textRef) textRef.setValue(String(v));
				onChange(v / 100);
			});
		slider.sliderEl.addEventListener('input', () => {
			const v = parseInt(slider.sliderEl.value, 10);
			if (textRef) textRef.setValue(String(v));
		});
		if (disabled) slider.setDisabled(true);
	});

	setting.addText((text) => {
		textRef = text;
		text.inputEl.type = 'number';
		text.inputEl.min = String(SCALE_MIN);
		text.inputEl.max = String(SCALE_MAX);
		text.inputEl.step = String(SCALE_STEP);
		text.inputEl.addClass('ttrpgmap-scale-input');
		text.setValue(String(Math.round(value * 100))).onChange((v: string) => {
			const num = parseInt(v, 10);
			if (!isNaN(num) && num >= SCALE_MIN && num <= SCALE_MAX) {
				const snapped = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(num / SCALE_STEP) * SCALE_STEP));
				if (sliderRef) sliderRef.setValue(snapped);
				text.setValue(String(snapped));
				onChange(snapped / 100);
			}
		});
		if (disabled) text.setDisabled(true);
	});

	return {
		setValue(fraction: number) {
			const pct = Math.round(fraction * 100);
			if (sliderRef) sliderRef.setValue(pct);
			if (textRef) textRef.setValue(String(pct));
		},
		setDisabled(d: boolean) {
			if (sliderRef) sliderRef.setDisabled(d);
			if (textRef) textRef.setDisabled(d);
		},
	};
}

// ── Font dropdown ──

interface FontDropdownOpts {
	setting: Setting;
	value: MarkerFont | 'inherit';
	includeInherit?: boolean;
	onChange: (value: MarkerFont | 'inherit') => void;
}

/**
 * Add a font-family dropdown to a Setting.
 * Only fonts available on the current system are listed.
 * Each option is styled with its font for a visual preview.
 */
export function buildFontDropdown(opts: FontDropdownOpts): void {
	const { setting, value, includeInherit = false, onChange } = opts;
	const fonts = getAvailableMarkerFonts();
	setting.addDropdown((dropdown) => {
		if (includeInherit) dropdown.addOption('inherit', 'Inherit');
		dropdown.addOption('default', 'Default');
		for (const font of fonts) {
			dropdown.addOption(font.id, font.label);
		}
		dropdown.setValue(value).onChange((v) => onChange(v as MarkerFont | 'inherit'));
		// Style each option with its font
		for (const option of Array.from(dropdown.selectEl.options)) {
			const stack = getMarkerFontStack(option.value);
			if (stack) option.style.fontFamily = stack;
		}
	});
}
