import { describe, it, expect } from 'vitest';
import {
	createPinSvg,
	createCircleSvg,
	createHotspotSvg,
	createPinElement,
	PIN_PATH,
	PIN_VIEWBOX,
} from '../../src/utils/markerPin';
import { getMapIcon, getMapIconNames } from '../../src/utils/mapIcon';

describe('createPinSvg', () => {
	it('creates an SVG element with correct viewBox', () => {
		const svg = createPinSvg('#ff0000', 'test-svg');
		expect(svg.tagName).toBe('svg');
		expect(svg.getAttribute('viewBox')).toBe(PIN_VIEWBOX);
		expect(svg.getAttribute('class')).toBe('test-svg');
	});

	it('sets fill color on the path', () => {
		const svg = createPinSvg('#00ff00', 'test');
		const path = svg.querySelector('path');
		expect(path).not.toBeNull();
		expect(path!.getAttribute('fill')).toBe('#00ff00');
	});

	it('has a black stroke', () => {
		const svg = createPinSvg('#ffffff', 'test');
		const path = svg.querySelector('path');
		expect(path!.getAttribute('stroke')).toBe('#000000');
	});
});

describe('createCircleSvg', () => {
	it('creates an SVG element with correct viewBox', () => {
		const svg = createCircleSvg('#ff0000', 'test-circle');
		expect(svg.tagName).toBe('svg');
		expect(svg.getAttribute('viewBox')).toBe('0 0 512 512');
		expect(svg.getAttribute('class')).toBe('test-circle');
	});

	it('sets fill color on the path', () => {
		const svg = createCircleSvg('#00ff00', 'test');
		const path = svg.querySelector('path');
		expect(path).not.toBeNull();
		expect(path!.getAttribute('fill')).toBe('#00ff00');
	});

	it('has a black stroke', () => {
		const svg = createCircleSvg('#ffffff', 'test');
		const path = svg.querySelector('path');
		expect(path!.getAttribute('stroke')).toBe('#000000');
	});

	it('has stroke-width of 12', () => {
		const svg = createCircleSvg('#ffffff', 'test');
		const path = svg.querySelector('path');
		expect(path!.getAttribute('stroke-width')).toBe('12');
	});
});

describe('createHotspotSvg', () => {
	it('creates an SVG element with correct viewBox', () => {
		const svg = createHotspotSvg('test-hotspot');
		expect(svg.tagName).toBe('svg');
		expect(svg.getAttribute('viewBox')).toBe('0 0 512 512');
		expect(svg.getAttribute('class')).toBe('test-hotspot');
	});

	it('contains a circle element, not a path', () => {
		const svg = createHotspotSvg('test');
		const circle = svg.querySelector('circle');
		const path = svg.querySelector('path');
		expect(circle).not.toBeNull();
		expect(path).toBeNull();
	});

	it('circle has fill none', () => {
		const svg = createHotspotSvg('test');
		const circle = svg.querySelector('circle');
		expect(circle!.getAttribute('fill')).toBe('none');
	});

	it('circle has stroke-dasharray', () => {
		const svg = createHotspotSvg('test');
		const circle = svg.querySelector('circle');
		expect(circle!.getAttribute('stroke-dasharray')).toBe('40 25');
	});
});

describe('createPinElement', () => {
	it('creates a pin container with SVG', () => {
		const container = document.createElement('div');
		const pin = createPinElement(container, {
			pinClass: 'my-pin',
			svgClass: 'my-svg',
			color: '#ffffff',
			iconClass: 'my-icon',
		});

		expect(pin.classList.contains('ttrpgmap-pin')).toBe(true);
		expect(pin.classList.contains('my-pin')).toBe(true);
		expect(pin.querySelector('svg')).not.toBeNull();
		expect(pin.querySelector('.my-icon')).toBeNull(); // No icon when not specified
	});

	it('FA icon registry loads correctly', () => {
		const names = getMapIconNames();
		expect(names.length).toBeGreaterThan(0);
		expect(getMapIcon('star')).toBeDefined();
		expect(getMapIcon('location-dot')).toBeDefined();
	});

	it('adds an icon element when icon is provided', () => {
		const container = document.createElement('div');
		const pin = createPinElement(container, {
			pinClass: 'my-pin',
			svgClass: 'my-svg',
			color: '#ffffff',
			icon: 'star',
			iconColor: '#ff0000',
			iconClass: 'my-icon',
		});

		const iconEl = pin.querySelector('.my-icon');
		expect(iconEl).not.toBeNull();
		expect(iconEl!.classList.contains('ttrpgmap-pin-icon')).toBe(true);
		expect((iconEl as HTMLElement).style.color).toBe('rgb(255, 0, 0)');
		// FA icon renders as inline SVG with fill="currentColor"
		const iconSvg = iconEl!.querySelector('svg');
		expect(iconSvg).not.toBeNull();
		expect(iconSvg!.getAttribute('fill')).toBe('currentColor');
	});

	it('does not add icon when icon is null', () => {
		const container = document.createElement('div');
		const pin = createPinElement(container, {
			pinClass: 'pin',
			svgClass: 'svg',
			color: '#000',
			icon: null,
			iconClass: 'icon',
		});

		expect(pin.querySelector('.icon')).toBeNull();
	});

	it('appends the pin to the container', () => {
		const container = document.createElement('div');
		createPinElement(container, {
			pinClass: 'pin',
			svgClass: 'svg',
			color: '#fff',
			iconClass: 'icon',
		});

		expect(container.children.length).toBe(1);
		expect(container.firstElementChild!.classList.contains('pin')).toBe(true);
	});

	it('creates pin with ttrpgmap-pin--circle class for circle shape', () => {
		const container = document.createElement('div');
		const pin = createPinElement(container, {
			pinClass: 'my-pin',
			svgClass: 'my-svg',
			color: '#ff0000',
			iconClass: 'my-icon',
			shape: 'circle',
		});

		expect(pin.classList.contains('ttrpgmap-pin')).toBe(true);
		expect(pin.classList.contains('ttrpgmap-pin--circle')).toBe(true);
	});

	it('creates pin with ttrpgmap-pin--hotspot class for hotspot shape', () => {
		const container = document.createElement('div');
		const pin = createPinElement(container, {
			pinClass: 'my-pin',
			svgClass: 'my-svg',
			color: '#ff0000',
			iconClass: 'my-icon',
			shape: 'hotspot',
		});

		expect(pin.classList.contains('ttrpgmap-pin')).toBe(true);
		expect(pin.classList.contains('ttrpgmap-pin--hotspot')).toBe(true);
	});

	it('creates standalone pin when useBaseMarker is false and icon is set', () => {
		const container = document.createElement('div');
		const pin = createPinElement(container, {
			pinClass: 'my-pin',
			svgClass: 'my-svg',
			color: '#ff0000',
			icon: 'star',
			iconColor: '#00ff00',
			iconClass: 'my-icon',
			useBaseMarker: false,
		});

		expect(pin.classList.contains('ttrpgmap-pin')).toBe(true);
		expect(pin.classList.contains('ttrpgmap-pin--standalone')).toBe(true);
		// Standalone uses a different icon wrapper class
		const standaloneIcon = pin.querySelector('.ttrpgmap-pin-standalone-icon');
		expect(standaloneIcon).not.toBeNull();
	});
});
