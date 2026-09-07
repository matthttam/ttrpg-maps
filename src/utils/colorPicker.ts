/**
 * Creates a simple color picker (swatch only, no extra inputs).
 * The native OS color picker already provides hex/RGB switching.
 */
export interface ColorPickerOpts {
	container: HTMLElement;
	value: string;
	onChange: (hex: string) => void;
	cls?: string;
}

/**
 * Normalize an arbitrary color string to a `#rrggbb` value that a native
 * `<input type="color">` accepts. The native input silently resets to
 * `#000000` when assigned anything else (shorthand `#rgb`, values with an
 * alpha channel, `rgb()`, or named colors), which made white markers show a
 * black swatch. This guards against that by canonicalizing known hex forms.
 */
export function normalizeHexColor(input: string | null | undefined, fallback = '#000000'): string {
	if (typeof input === 'string') {
		const v = input.trim().toLowerCase();
		// #rrggbb or #rrggbbaa (drop any alpha channel)
		let m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(v);
		if (m) return `#${m[1]}`;
		// #rgb or #rgba -> expand to #rrggbb (drop any alpha channel)
		m = /^#([0-9a-f])([0-9a-f])([0-9a-f])[0-9a-f]?$/.exec(v);
		if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
	}
	return fallback;
}

export function createColorPicker(opts: ColorPickerOpts): { setValue: (hex: string) => void } {
	const swatch = opts.container.createEl('input', { cls: `ttrpgmap-color-swatch ${opts.cls ?? ''}` });
	swatch.type = 'color';
	swatch.value = normalizeHexColor(opts.value);
	swatch.addEventListener('input', () => opts.onChange(swatch.value));

	return {
		setValue: (hex: string) => {
			swatch.value = normalizeHexColor(hex);
		},
	};
}
