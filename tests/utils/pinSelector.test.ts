import { describe, it, expect, vi } from 'vitest';
import { createPinSelector, PinSelectorOpts } from '../../src/utils/pinSelector';

function build(overrides: Partial<PinSelectorOpts> = {}) {
	const container = document.createElement('div');
	const onTransparencyChange = vi.fn();
	const onColorChange = vi.fn();

	createPinSelector({
		container,
		selected: 'down',
		color: '#ffffff',
		transparency: 0,
		onChange: vi.fn(),
		onColorChange,
		onTransparencyChange,
		...overrides,
	});

	return {
		container,
		onTransparencyChange,
		onColorChange,
		input: container.querySelector('.ttrpgmap-pin-transparency-input') as HTMLInputElement,
		slider: container.querySelector('.ttrpgmap-pin-transparency-slider') as HTMLInputElement,
	};
}

/** Simulate the user editing a field, which is what fires an `input` event. */
function typeInto(el: HTMLInputElement, value: string): void {
	el.value = value;
	el.dispatchEvent(new Event('input'));
}

describe('createPinSelector transparency', () => {
	it('renders the slider and number box seeded from the given value', () => {
		const { input, slider } = build({ transparency: 35 });

		expect(input.value).toBe('35');
		expect(slider.value).toBe('35');
	});

	it('clamps an out-of-range initial value', () => {
		expect(build({ transparency: 250 }).input.value).toBe('100');
		expect(build({ transparency: -40 }).input.value).toBe('0');
	});

	it('reports and mirrors an in-range typed value', () => {
		const { input, slider, onTransparencyChange } = build();

		typeInto(input, '40');

		expect(onTransparencyChange).toHaveBeenCalledWith(40);
		expect(slider.value).toBe('40');
		expect(input.value).toBe('40');
	});

	// Regression: the box used to clamp only what it reported, so typing 150 left
	// "150" on screen while the marker was actually set to 100.
	it('snaps a typed value above the maximum back to 100', () => {
		const { input, slider, onTransparencyChange } = build();

		typeInto(input, '150');

		expect(input.value).toBe('100');
		expect(slider.value).toBe('100');
		expect(onTransparencyChange).toHaveBeenCalledWith(100);
	});

	it('snaps a typed value below the minimum up to 0', () => {
		const { input, slider, onTransparencyChange } = build();

		typeInto(input, '-20');

		expect(input.value).toBe('0');
		expect(slider.value).toBe('0');
		expect(onTransparencyChange).toHaveBeenCalledWith(0);
	});

	it('ignores a cleared box instead of reporting NaN', () => {
		const { input, onTransparencyChange } = build({ transparency: 30 });

		typeInto(input, '');

		expect(onTransparencyChange).not.toHaveBeenCalled();
		expect(input.value).toBe('');
	});

	it('mirrors slider drags into the number box', () => {
		const { input, slider, onTransparencyChange } = build();

		typeInto(slider, '70');

		expect(input.value).toBe('70');
		expect(onTransparencyChange).toHaveBeenCalledWith(70);
	});

	it('reports pin color changes through the shared swatch component', () => {
		const { container, onColorChange } = build();
		const swatch = container.querySelector('.ttrpgmap-color-swatch') as HTMLInputElement;

		expect(swatch).not.toBeNull();
		typeInto(swatch, '#ff0000');

		expect(onColorChange).toHaveBeenCalledWith('#ff0000');
	});
});
