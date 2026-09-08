import { createPinSvg, createCircleSvg, createHotspotSvg } from './markerPin';
import { createColorPicker } from './colorPicker';

export type PinSelection = 'none' | 'down' | 'up' | 'left' | 'right' | 'circle' | 'hotspot';

const SELECTIONS: PinSelection[] = ['none', 'down', 'up', 'left', 'right', 'circle', 'hotspot'];

const ROTATION: Record<string, string> = {
	down: '0deg',
	up: '180deg',
	left: '90deg',
	right: '-90deg',
};

export interface PinSelectorOpts {
	container: HTMLElement;
	selected: PinSelection;
	color: string;
	/** Pin transparency percentage: 0 = fully opaque. */
	transparency?: number;
	onChange: (value: PinSelection) => void;
	onColorChange: (color: string) => void;
	onTransparencyChange: (transparency: number) => void;
}

/**
 * Renders a pin selector: [None] [↓] [↑] [←] [→] + color circle + transparency.
 * The controls are self-contained -- callers that need to change these values
 * externally re-render the whole modal, so nothing is returned.
 */
export function createPinSelector(opts: PinSelectorOpts): void {
	const row = opts.container.createDiv({ cls: 'ttrpgmap-pin-selector' });

	// Button group wrapper so :first-child/:last-child work
	const btnGroup = row.createDiv({ cls: 'ttrpgmap-pin-selector-group' });

	const ICON_COLOR = 'var(--text-muted)';

	const buttons: HTMLElement[] = [];

	for (const sel of SELECTIONS) {
		const label =
			sel === 'none' ? 'No pin' : sel === 'circle' ? 'Circle' : sel === 'hotspot' ? 'Hotspot' : `Pin ${sel}`;
		const btn = btnGroup.createDiv({
			cls: `ttrpgmap-pin-selector-btn ${opts.selected === sel ? 'ttrpgmap-pin-selector-active' : ''}`,
			attr: { 'aria-label': label },
		});

		if (sel === 'none') {
			btn.createDiv({ cls: 'ttrpgmap-pin-selector-none', text: '✕' });
		} else if (sel === 'hotspot') {
			const hotspotWrap = btn.createDiv({ cls: 'ttrpgmap-pin-selector-circle' });
			hotspotWrap.appendChild(createHotspotSvg('ttrpgmap-pin-selector-svg'));
		} else if (sel === 'circle') {
			const circleWrap = btn.createDiv({ cls: 'ttrpgmap-pin-selector-circle' });
			circleWrap.appendChild(createCircleSvg(ICON_COLOR, 'ttrpgmap-pin-selector-svg'));
		} else {
			const pinWrap = btn.createDiv({ cls: 'ttrpgmap-pin-selector-icon' });
			pinWrap.setCssStyles({ transform: `rotate(${ROTATION[sel]})` });
			pinWrap.appendChild(createPinSvg(ICON_COLOR, 'ttrpgmap-pin-selector-svg'));
		}

		btn.addEventListener('click', () => {
			buttons.forEach((b) => b.removeClass('ttrpgmap-pin-selector-active'));
			btn.addClass('ttrpgmap-pin-selector-active');
			opts.onChange(sel);
		});

		buttons.push(btn);
	}

	// Color picker
	const colorWrap = row.createDiv({ cls: 'ttrpgmap-pin-selector-color-wrap' });
	colorWrap.createSpan({ cls: 'ttrpgmap-pin-selector-color-label', text: 'Color:' });
	// Same shared component (and therefore the same class/styling) as the icon color
	createColorPicker({
		container: colorWrap,
		value: opts.color,
		onChange: (hex) => opts.onColorChange(hex),
	});

	// Transparency (0 = fully opaque)
	const transpWrap = row.createDiv({ cls: 'ttrpgmap-pin-selector-transparency-wrap' });
	transpWrap.createSpan({ cls: 'ttrpgmap-pin-selector-color-label', text: 'Transparency:' });
	const clampTransparency = (v: number) => Math.min(100, Math.max(0, v));
	const initialTransparency = clampTransparency(opts.transparency ?? 0);
	const transpSlider = transpWrap.createEl('input', {
		cls: 'ttrpgmap-pin-transparency-slider',
		type: 'range',
		attr: { min: '0', max: '100', step: '1' },
		value: String(initialTransparency),
	});
	const transpInput = transpWrap.createEl('input', {
		cls: 'ttrpgmap-pin-transparency-input',
		type: 'number',
		attr: { min: '0', max: '100', step: '1' },
		value: String(initialTransparency),
	});
	transpSlider.addEventListener('input', () => {
		const v = parseInt(transpSlider.value, 10);
		if (isNaN(v)) return;
		transpInput.value = String(v);
		opts.onTransparencyChange(clampTransparency(v));
	});
	transpInput.addEventListener('input', () => {
		const v = parseInt(transpInput.value, 10);
		if (isNaN(v)) return;
		const clamped = clampTransparency(v);
		// Snap the box itself to the range too, so it can't display a value the
		// marker doesn't have (typing 150 shows 100).
		if (v !== clamped) transpInput.value = String(clamped);
		transpSlider.value = String(clamped);
		opts.onTransparencyChange(clamped);
	});
}
