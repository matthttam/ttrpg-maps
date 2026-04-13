import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MapRenderer } from '../../src/map/MapRenderer';
import { MapConfig, MapState, MapMarker, DEFAULT_SETTINGS, DEFAULT_LAYER } from '../../src/types';
import { App } from 'obsidian';

/** Create a mock plugin with controllable state */
function createMockPlugin(mapState?: Partial<MapState>) {
	const state: MapState = {
		mapId: 'test-map',
		markers: [],
		layers: [{ ...DEFAULT_LAYER }],
		distanceScale: null,
		...mapState,
	};

	const app = new App();
	// Mock vault to return a fake file for image loading
	const fakeFile = { path: 'maps/test.png', basename: 'test', extension: 'png' };
	app.vault.getFileByPath = (path: string) => fakeFile as any;
	app.vault.getResourcePath = (file: any) => `app://local/${file.path}`;

	return {
		app,
		settings: { ...DEFAULT_SETTINGS },
		dataManager: {
			loadMapState: vi.fn().mockResolvedValue(state),
			saveMapState: vi.fn(),
			loadSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
			saveSettings: vi.fn(),
		},
		manifest: { id: 'ttrpg-maps' },
		onMapRefresh: vi.fn(),
		offMapRefresh: vi.fn(),
		triggerMapRefresh: vi.fn(),
	} as any;
}

function createConfig(overrides?: Partial<MapConfig>): MapConfig {
	return {
		id: 'test-map',
		image: 'maps/test.png',
		height: null,
		width: null,
		zoomMin: 50,
		zoomMax: 200,
		zoomStep: 10,
		...overrides,
	};
}

function createMarker(overrides?: Partial<MapMarker>): MapMarker {
	return {
		id: 'marker_1',
		templateId: 'default',
		x: 100,
		y: 200,
		layerId: null,
		note: null,
		alias: null,
		previewNote: null,
		description: null,
		direction: 'down',
		textPlacement: 'above',
		color: '#ffffff',
		icon: null,
		iconColor: '#000000',
		iconRotation: 0,
		useBaseMarker: true,
		shape: 'pin',
		scale: null,
		scaleToZoom: null,
		textScale: null,
		textScaleToZoom: null,
		font: null,
		...overrides,
	};
}

describe('MapRenderer DOM', () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement('div');
	});

	it('creates the root structure on load', async () => {
		const plugin = createMockPlugin();
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		// The root class is added to the container itself, not a child
		expect(container.classList.contains('ttrpgmap-root')).toBe(true);
		expect(container.querySelector('.ttrpgmap-wrapper')).not.toBeNull();
		expect(container.querySelector('.ttrpgmap-container')).not.toBeNull();
		expect(container.querySelector('.ttrpgmap-marker-overlay')).not.toBeNull();
		expect(container.querySelector('.ttrpgmap-image')).not.toBeNull();
		expect(container.querySelector('.ttrpgmap-svg-overlay')).not.toBeNull();
	});

	it('renders zoom controls', async () => {
		const plugin = createMockPlugin();
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const zoomControls = container.querySelector('.ttrpgmap-zoom-controls');
		expect(zoomControls).not.toBeNull();

		const buttons = zoomControls!.querySelectorAll('.ttrpgmap-zoom-btn');
		expect(buttons.length).toBe(7); // +, -, center, fit, lock zoom, lock pan, lock markers

		const label = zoomControls!.querySelector('.ttrpgmap-zoom-label');
		expect(label).not.toBeNull();
		expect(label!.textContent).toBe('100%');
	});

	it('renders measurement drawer with calibrate, measure, and freehand buttons', async () => {
		const plugin = createMockPlugin();
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const panel = container.querySelector('.ttrpgmap-measure-panel');
		expect(panel).not.toBeNull();
		const tools = panel!.querySelector('.ttrpgmap-measure-tools');
		expect(tools).not.toBeNull();
		const btns = tools!.querySelectorAll('.ttrpgmap-toolbar-btn');
		expect(btns.length).toBe(3);
	});

	it('renders settings button', async () => {
		const plugin = createMockPlugin();
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		expect(container.querySelector('.ttrpgmap-settings-btn')).not.toBeNull();
	});

	it('renders markers with pin SVG', async () => {
		const marker = createMarker({ color: '#ff0000', icon: 'star' });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEl = container.querySelector('.ttrpgmap-marker');
		expect(markerEl).not.toBeNull();
		expect(markerEl!.getAttribute('data-direction')).toBe('down');
		expect(markerEl!.getAttribute('data-text-placement')).toBe('above');

		// Pin SVG
		const pin = markerEl!.querySelector('.ttrpgmap-marker-pin');
		expect(pin).not.toBeNull();
		const svg = pin!.querySelector('svg');
		expect(svg).not.toBeNull();
		const path = svg!.querySelector('path');
		expect(path!.getAttribute('fill')).toBe('#ff0000');

		// Icon (FA icon renders as inline SVG)
		const iconEl = pin!.querySelector('.ttrpgmap-marker-icon');
		expect(iconEl).not.toBeNull();
		const iconSvg = iconEl!.querySelector('svg');
		expect(iconSvg).not.toBeNull();
		expect(iconSvg!.getAttribute('fill')).toBe('currentColor');
	});

	it('does not render label when no note or description', async () => {
		const marker = createMarker({ note: null, description: null });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const label = container.querySelector('.ttrpgmap-marker-label');
		expect(label).toBeNull();
	});

	it('renders label when note is set', async () => {
		const marker = createMarker({ note: 'Places/Tavern' });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const label = container.querySelector('.ttrpgmap-marker-label');
		expect(label).not.toBeNull();
		const title = label!.querySelector('.ttrpgmap-marker-title');
		expect(title).not.toBeNull();
		expect(title!.textContent).toBe('Tavern');
	});

	it('renders label when only description is set', async () => {
		const marker = createMarker({ description: 'A cozy inn' });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const label = container.querySelector('.ttrpgmap-marker-label');
		expect(label).not.toBeNull();
		expect(label!.querySelector('.ttrpgmap-marker-desc')!.textContent).toBe('A cozy inn');
	});

	it('renders multiple markers', async () => {
		const markers = [
			createMarker({ id: 'm1', x: 10, y: 20 }),
			createMarker({ id: 'm2', x: 30, y: 40, direction: 'up' }),
			createMarker({ id: 'm3', x: 50, y: 60, direction: 'left' }),
		];
		const plugin = createMockPlugin({ markers });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEls = container.querySelectorAll('.ttrpgmap-marker');
		expect(markerEls.length).toBe(3);
		expect(markerEls[1].getAttribute('data-direction')).toBe('up');
		expect(markerEls[2].getAttribute('data-direction')).toBe('left');
	});

	it('sets marker CSS variables', async () => {
		const marker = createMarker({ color: '#ff0000' });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;
		expect(markerEl.style.getPropertyValue('--marker-color')).toBe('#ff0000');
	});

	it('shows error when image not found', async () => {
		const plugin = createMockPlugin();
		plugin.app.vault.getFileByPath = () => null; // Override to simulate missing file
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const error = container.querySelector('.ttrpgmap-error');
		expect(error).not.toBeNull();
		expect(error!.textContent).toContain('Image not found');
	});

	it('renders total display element (hidden by default)', async () => {
		const plugin = createMockPlugin();
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const total = container.querySelector('.ttrpgmap-measure-total');
		expect(total).not.toBeNull();
		expect((total as HTMLElement).classList.contains('ttrpgmap-hidden')).toBe(true);
	});

	it('renders rounding controls in the measurement drawer', async () => {
		const plugin = createMockPlugin();
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const rounding = container.querySelector('.ttrpgmap-measure-rounding');
		expect(rounding).not.toBeNull();

		const select = rounding!.querySelector('select');
		expect(select).not.toBeNull();
		const options = select!.querySelectorAll('option');
		expect(options.length).toBe(4);
		expect(options[0].value).toBe('none');
		expect(options[1].value).toBe('closest');
		expect(options[2].value).toBe('up');
		expect(options[3].value).toBe('down');

		const input = rounding!.querySelector("input[type='number']");
		expect(input).not.toBeNull();
	});

	it('measurement drawer is hidden by default', async () => {
		const plugin = createMockPlugin();
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const drawer = container.querySelector('.ttrpgmap-measure-drawer');
		expect(drawer).not.toBeNull();
		expect((drawer as HTMLElement).classList.contains('ttrpgmap-hidden')).toBe(true);
	});

	it('renders measurement toggle button', async () => {
		const plugin = createMockPlugin();
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const toggle = container.querySelector('.ttrpgmap-measure-toggle');
		expect(toggle).not.toBeNull();
	});

	it('initializes rounding select from state', async () => {
		const plugin = createMockPlugin({ roundingMode: 'up', roundingMultiple: 10 });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const select = container.querySelector('.ttrpgmap-measure-rounding-select') as HTMLSelectElement;
		expect(select).not.toBeNull();
		expect(select.value).toBe('up');

		const input = container.querySelector('.ttrpgmap-measure-rounding-input') as HTMLInputElement;
		expect(input).not.toBeNull();
		expect(input.value).toBe('10');
	});

	it('sets --marker-scale to 1 on markers by default', async () => {
		const marker = createMarker();
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;
		expect(markerEl.style.getPropertyValue('--marker-scale')).toBe('1');
	});

	it('sets --marker-scale from per-map state', async () => {
		const marker = createMarker();
		const plugin = createMockPlugin({ markers: [marker], markerScale: 0.75 });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;
		expect(markerEl.style.getPropertyValue('--marker-scale')).toBe('0.75');
	});

	it('falls back to global defaultMarkerScale when per-map is not set', async () => {
		const marker = createMarker();
		const plugin = createMockPlugin({ markers: [marker] });
		plugin.settings.defaultMarkerScale = 1.5;
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;
		expect(markerEl.style.getPropertyValue('--marker-scale')).toBe('1.5');
	});

	it('per-map markerScale takes precedence over global default', async () => {
		const marker = createMarker();
		const plugin = createMockPlugin({ markers: [marker], markerScale: 0.5 });
		plugin.settings.defaultMarkerScale = 2.0;
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;
		expect(markerEl.style.getPropertyValue('--marker-scale')).toBe('0.5');
	});

	it('scaleMarkersToZoom defaults to true (screen-constant, no zoom factor)', async () => {
		const marker = createMarker();
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;
		// At 100% zoom with scaleToZoom=true: just baseScale, no zoom multiplication
		expect(markerEl.style.getPropertyValue('--marker-scale')).toBe('1');
	});

	it('scaleMarkersToZoom=false multiplies scale by zoom factor', async () => {
		const marker = createMarker();
		const plugin = createMockPlugin({ markers: [marker], scaleMarkersToZoom: false, markerScale: 1.0 });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;
		// At 100% zoom: 1.0 * (100/100) = 1.0
		expect(markerEl.style.getPropertyValue('--marker-scale')).toBe('1');
	});

	it('per-marker scale override sets --marker-scale on element', async () => {
		const marker = createMarker({ scale: 0.5 });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;
		expect(markerEl.style.getPropertyValue('--marker-scale')).toBe('0.5');
	});

	it('per-marker scaleToZoom=false applies zoom factor to that marker', async () => {
		const marker = createMarker({ scaleToZoom: false });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;
		// At 100% zoom: 1.0 * 1.0 = 1.0 (fixed to map but zoom is 100%)
		expect(markerEl.style.getPropertyValue('--marker-scale')).toBe('1');
	});

	it('marker with null overrides inherits map-level scale', async () => {
		const marker = createMarker({ scale: null, scaleToZoom: null });
		const plugin = createMockPlugin({ markers: [marker], markerScale: 1.5 });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;
		expect(markerEl.style.getPropertyValue('--marker-scale')).toBe('1.5');
	});
});

describe('MapRenderer copy marker', () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement('div');
	});

	it('startCopyMarker sets pendingCopy and changes cursor', async () => {
		const marker = createMarker();
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		(renderer as any).startCopyMarker(marker);

		expect((renderer as any).pendingCopy).toBe(marker);
		const wrapper = container.querySelector('.ttrpgmap-wrapper') as HTMLElement;
		expect(wrapper.classList.contains('ttrpgmap-cursor-copy')).toBe(true);
		expect(wrapper.classList.contains('ttrpgmap-copy-mode')).toBe(true);
	});

	it('completeCopy creates a new marker at given coordinates', async () => {
		const marker = createMarker({ x: 100, y: 200, color: '#ff0000', icon: 'star' });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		(renderer as any).startCopyMarker(marker);
		(renderer as any).completeCopy(300, 400);

		const state = (renderer as any).state;
		expect(state.markers).toHaveLength(2);

		const copy = state.markers[1];
		expect(copy.id).not.toBe(marker.id);
		expect(copy.x).toBe(300);
		expect(copy.y).toBe(400);
		expect(copy.color).toBe('#ff0000');
		expect(copy.icon).toBe('star');
		expect(copy.templateId).toBe(marker.templateId);
		expect(plugin.dataManager.saveMapState).toHaveBeenCalled();
	});

	it('completeCopy clears pendingCopy and restores cursor', async () => {
		const marker = createMarker();
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		(renderer as any).startCopyMarker(marker);
		(renderer as any).completeCopy(50, 50);

		expect((renderer as any).pendingCopy).toBeNull();
		const wrapper = container.querySelector('.ttrpgmap-wrapper') as HTMLElement;
		expect(wrapper.classList.contains('ttrpgmap-cursor-grab')).toBe(true);
		expect(wrapper.classList.contains('ttrpgmap-cursor-copy')).toBe(false);
		expect(wrapper.classList.contains('ttrpgmap-copy-mode')).toBe(false);
	});

	it('copy preserves all marker properties except id and position', async () => {
		const marker = createMarker({
			note: 'Test Note',
			description: 'Test Desc',
			direction: 'left',
			textPlacement: 'right',
			iconColor: '#aabbcc',
			useBaseMarker: false,
			shape: 'circle',
			scale: 1.5,
			scaleToZoom: false,
			textScale: 2.0,
			textScaleToZoom: true,
			layerId: 'layer_1',
			font: 'serif',
		});
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		(renderer as any).startCopyMarker(marker);
		(renderer as any).completeCopy(999, 888);

		const copy = (renderer as any).state.markers[1];
		expect(copy.note).toBe('Test Note');
		expect(copy.description).toBe('Test Desc');
		expect(copy.direction).toBe('left');
		expect(copy.textPlacement).toBe('right');
		expect(copy.iconColor).toBe('#aabbcc');
		expect(copy.useBaseMarker).toBe(false);
		expect(copy.shape).toBe('circle');
		expect(copy.scale).toBe(1.5);
		expect(copy.scaleToZoom).toBe(false);
		expect(copy.textScale).toBe(2.0);
		expect(copy.textScaleToZoom).toBe(true);
		expect(copy.layerId).toBe('layer_1');
		expect(copy.font).toBe('serif');
	});

	it('keydown cancels copy mode', async () => {
		const marker = createMarker();
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		(renderer as any).startCopyMarker(marker);
		expect((renderer as any).pendingCopy).toBe(marker);

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		expect((renderer as any).pendingCopy).toBeNull();
		const wrapper = container.querySelector('.ttrpgmap-wrapper') as HTMLElement;
		expect(wrapper.classList.contains('ttrpgmap-cursor-grab')).toBe(true);
		expect(wrapper.classList.contains('ttrpgmap-cursor-copy')).toBe(false);
	});
});

describe('MapRenderer marker click navigation', () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement('div');
	});

	it('clicking a marker with a note calls openLinkText', async () => {
		const marker = createMarker({ note: 'Places/Tavern' });
		const plugin = createMockPlugin({ markers: [marker] });
		const openLinkSpy = vi.fn();
		plugin.app.workspace.openLinkText = openLinkSpy;

		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const wrapper = container.querySelector('.ttrpgmap-wrapper') as HTMLElement;
		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;

		// Simulate a simple click: mousedown -> mouseup -> click (no movement)
		markerEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
		wrapper.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
		markerEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(openLinkSpy).toHaveBeenCalledWith('Places/Tavern', '', false);
	});

	it('dragging a marker beyond threshold does NOT navigate', async () => {
		const marker = createMarker({ note: 'Places/Tavern' });
		const plugin = createMockPlugin({ markers: [marker] });
		const openLinkSpy = vi.fn();
		plugin.app.workspace.openLinkText = openLinkSpy;

		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const wrapper = container.querySelector('.ttrpgmap-wrapper') as HTMLElement;
		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;

		// Simulate a drag: mousedown -> mousemove (beyond threshold) -> mouseup -> click
		markerEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100, bubbles: true }));
		wrapper.dispatchEvent(new MouseEvent('mousemove', { clientX: 110, clientY: 110, bubbles: true }));
		wrapper.dispatchEvent(new MouseEvent('mouseup', { clientX: 110, clientY: 110, bubbles: true }));
		markerEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(openLinkSpy).not.toHaveBeenCalled();
	});

	it('dragging a marker by 1 pixel does NOT navigate', async () => {
		const marker = createMarker({ note: 'Places/Tavern' });
		const plugin = createMockPlugin({ markers: [marker] });
		const openLinkSpy = vi.fn();
		plugin.app.workspace.openLinkText = openLinkSpy;

		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const wrapper = container.querySelector('.ttrpgmap-wrapper') as HTMLElement;
		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;

		// Simulate a tiny drag (1px) -- below the drag threshold but still movement
		markerEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100, bubbles: true }));
		wrapper.dispatchEvent(new MouseEvent('mousemove', { clientX: 101, clientY: 100, bubbles: true }));
		wrapper.dispatchEvent(new MouseEvent('mouseup', { clientX: 101, clientY: 100, bubbles: true }));
		markerEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(openLinkSpy).not.toHaveBeenCalled();
	});

	it('clicking a marker without a note does not call openLinkText', async () => {
		const marker = createMarker({ note: null });
		const plugin = createMockPlugin({ markers: [marker] });
		const openLinkSpy = vi.fn();
		plugin.app.workspace.openLinkText = openLinkSpy;

		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const wrapper = container.querySelector('.ttrpgmap-wrapper') as HTMLElement;
		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;

		markerEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
		wrapper.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
		markerEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(openLinkSpy).not.toHaveBeenCalled();
	});
});

describe('MapRenderer Alt+Scroll resize', () => {
	let container: HTMLElement;

	function dispatchWheel(target: HTMLElement, opts: { altKey?: boolean; shiftKey?: boolean; deltaY?: number } = {}) {
		const event = new WheelEvent('wheel', {
			altKey: opts.altKey ?? true,
			shiftKey: opts.shiftKey ?? false,
			deltaY: opts.deltaY ?? -100, // scroll up = scale up
			bubbles: true,
			cancelable: true,
		});
		target.dispatchEvent(event);
	}

	beforeEach(() => {
		container = document.createElement('div');
	});

	it('Alt+Scroll over a marker pin adjusts per-marker scale', async () => {
		const marker = createMarker({ note: 'Test', description: 'desc' });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;
		const pinEl = markerEl.querySelector('.ttrpgmap-marker-pin') as HTMLElement;

		expect(marker.scale).toBeNull();
		dispatchWheel(pinEl);

		// Scale should be materialized and incremented
		expect(marker.scale).not.toBeNull();
		expect(marker.scale).toBeGreaterThan(1.0);
	});

	it('Alt+Scroll over a marker label adjusts per-marker textScale', async () => {
		const marker = createMarker({ note: 'Test', description: 'desc' });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const markerEl = container.querySelector('.ttrpgmap-marker') as HTMLElement;
		const labelEl = markerEl.querySelector('.ttrpgmap-marker-label') as HTMLElement;
		expect(labelEl).not.toBeNull();

		expect(marker.textScale).toBeNull();
		dispatchWheel(labelEl);

		// textScale should be materialized and incremented, scale should remain null
		expect(marker.textScale).not.toBeNull();
		expect(marker.textScale).toBeGreaterThan(1.0);
		expect(marker.scale).toBeNull();
	});

	it('Shift+Alt+Scroll over pin adjusts map-level markerScale', async () => {
		const marker = createMarker();
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const state = (renderer as any).state as MapState;
		expect(state.markerScale).toBeUndefined();

		const pinEl = container.querySelector('.ttrpgmap-marker-pin') as HTMLElement;
		dispatchWheel(pinEl, { shiftKey: true });

		// Map-level scale should be set, per-marker should remain null
		expect(state.markerScale).toBeDefined();
		expect(state.markerScale).toBeGreaterThan(1.0);
		expect(marker.scale).toBeNull();
	});

	it('Shift+Alt+Scroll over label adjusts map-level markerTextScale', async () => {
		const marker = createMarker({ note: 'Test', description: 'desc' });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const state = (renderer as any).state as MapState;
		expect(state.markerTextScale).toBeUndefined();

		const labelEl = container.querySelector('.ttrpgmap-marker-label') as HTMLElement;
		dispatchWheel(labelEl, { shiftKey: true });

		// Map-level text scale should be set, per-marker should remain null
		expect(state.markerTextScale).toBeDefined();
		expect(state.markerTextScale).toBeGreaterThan(1.0);
		expect(marker.textScale).toBeNull();
	});

	it('scroll down decreases scale', async () => {
		const marker = createMarker({ scale: 1.5 });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const pinEl = container.querySelector('.ttrpgmap-marker-pin') as HTMLElement;
		dispatchWheel(pinEl, { deltaY: 100 }); // scroll down

		expect(marker.scale).toBeLessThan(1.5);
	});

	it('scale is clamped to minimum', async () => {
		const marker = createMarker({ scale: 0.15 });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const pinEl = container.querySelector('.ttrpgmap-marker-pin') as HTMLElement;
		dispatchWheel(pinEl, { deltaY: 100 }); // scroll down

		expect(marker.scale).toBe(0.1);
	});

	it('scale is clamped to maximum', async () => {
		const marker = createMarker({ scale: 4.98 });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const pinEl = container.querySelector('.ttrpgmap-marker-pin') as HTMLElement;
		dispatchWheel(pinEl, { deltaY: -100 }); // scroll up

		expect(marker.scale).toBe(5.0);
	});

	it("map-level Shift+Alt initializes from hovered marker's effective scale", async () => {
		const marker = createMarker({ scale: 2.0 });
		const plugin = createMockPlugin({ markers: [marker] });
		const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
		await renderer.onload();

		const state = (renderer as any).state as MapState;
		const pinEl = container.querySelector('.ttrpgmap-marker-pin') as HTMLElement;
		dispatchWheel(pinEl, { shiftKey: true });

		// Should NOT use the per-marker override; getMarkerBaseScale resolves marker.scale first
		// Since marker.scale is 2.0, map-level should start from 2.0 + step
		expect(state.markerScale).toBeCloseTo(2.05, 5);
	});
});

describe('EmptyMapRenderer DOM', () => {
	it('renders placeholder with configure button', async () => {
		const { EmptyMapRenderer } = await import('../../src/map/EmptyMapRenderer');
		const container = document.createElement('div');
		const plugin = createMockPlugin();
		const renderer = new EmptyMapRenderer(container, plugin, 'test.md', null);
		renderer.onload();

		expect(container.querySelector('.ttrpgmap-placeholder')).not.toBeNull();
		expect(container.querySelector('.ttrpgmap-placeholder-text')!.textContent).toBe('TTRPG Map');
		expect(container.querySelector('.ttrpgmap-configure-btn')).not.toBeNull();
	});
});
