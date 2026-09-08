import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MapRenderer } from '../../src/map/MapRenderer';
import { MapConfig, MapState, MapMarker, MapPoint, DEFAULT_SETTINGS, DEFAULT_LAYER } from '../../src/types';
import { darkenHex } from '../../src/utils/zoneGeometry';
import { App } from 'obsidian';

function createMockPlugin(mapState?: Partial<MapState>) {
	const state: MapState = {
		mapId: 'test-map',
		markers: [],
		layers: [{ ...DEFAULT_LAYER }],
		distanceScale: null,
		...mapState,
	};

	const app = new App();
	const fakeFile = { path: 'maps/test.png', basename: 'test', extension: 'png' };
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	app.vault.getFileByPath = () => fakeFile as any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/** A 20x20 square centred on the anchor. */
const SQUARE: MapPoint[] = [
	{ x: -10, y: -10 },
	{ x: 10, y: -10 },
	{ x: 10, y: 10 },
	{ x: -10, y: 10 },
];

/** Scale a relative point list, keeping it centred on the anchor. */
function square(half: number): MapPoint[] {
	return [
		{ x: -half, y: -half },
		{ x: half, y: -half },
		{ x: half, y: half },
		{ x: -half, y: half },
	];
}

function createZone(overrides?: Partial<MapMarker>): MapMarker {
	return {
		id: 'zone_1',
		// Zones deliberately carry no template
		templateId: '',
		x: 100,
		y: 200,
		layerId: null,
		note: null,
		alias: null,
		previewNote: null,
		description: null,
		direction: null,
		textPlacement: 'above',
		color: '#ff0000',
		transparency: 0,
		icon: null,
		iconColor: null,
		iconRotation: null,
		useBaseMarker: null,
		shape: 'area',
		points: SQUARE,
		scale: null,
		scaleToZoom: null,
		textScale: null,
		textScaleToZoom: null,
		font: null,
		textVisibility: null,
		...overrides,
	};
}

function createPin(overrides?: Partial<MapMarker>): MapMarker {
	return {
		id: 'pin_1',
		templateId: 'default',
		x: 50,
		y: 60,
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
		textVisibility: null,
		...overrides,
	};
}

async function render(markers: MapMarker[], container: HTMLElement): Promise<MapRenderer> {
	const plugin = createMockPlugin({ markers });
	const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
	await renderer.onload();
	return renderer;
}

describe('MapRenderer hot zones', () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement('div');
	});

	it('creates a zone layer inside the transformed SVG overlay', async () => {
		await render([], container);

		const overlay = container.querySelector('.ttrpgmap-svg-overlay');
		const layer = container.querySelector('.ttrpgmap-zone-layer');
		expect(layer).not.toBeNull();
		// Must live inside the overlay so pan/zoom apply to it for free
		expect(overlay!.contains(layer!)).toBe(true);
	});

	it('renders a polygon with points resolved to absolute map coordinates', async () => {
		await render([createZone()], container);

		const polygon = container.querySelector('.ttrpgmap-zone-shape');
		expect(polygon).not.toBeNull();
		// anchor (100,200) + each relative point
		expect(polygon!.getAttribute('points')).toBe('90,190 110,190 110,210 90,210');
	});

	it('tags each zone group with its marker id', async () => {
		await render([createZone({ id: 'zone_abc' })], container);

		const group = container.querySelector('.ttrpgmap-zone');
		expect(group!.getAttribute('data-marker-id')).toBe('zone_abc');
	});

	it('applies the fill color and derives the outline from it', async () => {
		await render([createZone({ color: '#ff0000' })], container);

		const polygon = container.querySelector('.ttrpgmap-zone-shape')!;
		expect(polygon.getAttribute('fill')).toBe('#ff0000');
		expect(polygon.getAttribute('stroke')).toBe(darkenHex('#ff0000'));
	});

	it('converts transparency into fill-opacity', async () => {
		await render([createZone({ transparency: 40 })], container);

		const polygon = container.querySelector('.ttrpgmap-zone-shape')!;
		expect(polygon.getAttribute('fill-opacity')).toBe('0.6');
	});

	it('treats a missing transparency as fully opaque', async () => {
		await render([createZone({ transparency: undefined })], container);

		const polygon = container.querySelector('.ttrpgmap-zone-shape')!;
		expect(polygon.getAttribute('fill-opacity')).toBe('1');
	});

	it('clamps out-of-range transparency', async () => {
		await render([createZone({ transparency: 150 })], container);

		const polygon = container.querySelector('.ttrpgmap-zone-shape')!;
		expect(polygon.getAttribute('fill-opacity')).toBe('0');
	});

	it('keeps the outline a constant on-screen width by dividing by zoom scale', async () => {
		await render([createZone()], container);

		// Default zoom is 100%, so scale is 1
		const polygon = container.querySelector('.ttrpgmap-zone-shape')!;
		expect(polygon.getAttribute('stroke-width')).toBe('2');
	});

	it('does not render a zone as a pin marker element', async () => {
		await render([createZone()], container);

		expect(container.querySelector('.ttrpgmap-zone-shape')).not.toBeNull();
		// Zones live only in the SVG layer, never in the marker overlay
		expect(container.querySelector('.ttrpgmap-marker')).toBeNull();
		expect(container.querySelector('.ttrpgmap-pin')).toBeNull();
	});

	it('renders pins and zones side by side', async () => {
		await render([createZone(), createPin()], container);

		expect(container.querySelectorAll('.ttrpgmap-zone').length).toBe(1);
		expect(container.querySelectorAll('.ttrpgmap-marker').length).toBe(1);
	});

	it('skips an area marker with too few points to form a polygon', async () => {
		const degenerate = createZone({ points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] });
		await render([degenerate], container);

		expect(container.querySelector('.ttrpgmap-zone')).toBeNull();
	});

	it('skips an area marker with no geometry at all', async () => {
		await render([createZone({ points: undefined })], container);

		expect(container.querySelector('.ttrpgmap-zone')).toBeNull();
	});

	it('paints larger zones first so nested zones stay clickable', async () => {
		const big = createZone({ id: 'big', points: square(100) });
		const small = createZone({ id: 'small', points: square(5) });
		// Deliberately supply the small one first
		await render([small, big], container);

		const ids = Array.from(container.querySelectorAll('.ttrpgmap-zone')).map((el) =>
			el.getAttribute('data-marker-id'),
		);
		expect(ids).toEqual(['big', 'small']);
	});

	it('does not reveal all outlines by default', async () => {
		await render([createZone()], container);

		const layer = container.querySelector('.ttrpgmap-zone-layer')!;
		expect(layer.classList.contains('ttrpgmap-zone-layer--show-all')).toBe(false);
	});
});

describe('MapRenderer hot zone labels', () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement('div');
	});

	it('labels a zone with its alias', async () => {
		await render([createZone({ alias: 'Whispering Wood' })], container);

		const label = container.querySelector('.ttrpgmap-zone-label');
		expect(label).not.toBeNull();
		expect(label!.textContent).toBe('Whispering Wood');
	});

	it('falls back to the note name when there is no alias', async () => {
		await render([createZone({ note: 'Places/Old Keep' })], container);

		expect(container.querySelector('.ttrpgmap-zone-label')!.textContent).toBe('Old Keep');
	});

	it('uses the description when there is no note or alias', async () => {
		await render([createZone({ description: 'A dark clearing' })], container);

		expect(container.querySelector('.ttrpgmap-zone-label')!.textContent).toBe('A dark clearing');
	});

	it('omits the label when there is nothing to show', async () => {
		await render([createZone()], container);

		expect(container.querySelector('.ttrpgmap-zone-label')).toBeNull();
	});

	it('omits the label when text visibility is hidden', async () => {
		await render([createZone({ alias: 'Hidden', textVisibility: 'hidden' })], container);

		expect(container.querySelector('.ttrpgmap-zone-label')).toBeNull();
	});

	it('marks hover-only labels so CSS can fade them in', async () => {
		await render([createZone({ alias: 'Peek', textVisibility: 'hover' })], container);

		const label = container.querySelector('.ttrpgmap-zone-label')!;
		expect(label.classList.contains('ttrpgmap-zone-label--hover')).toBe(true);
	});

	it('anchors the label at the zone centroid', async () => {
		await render([createZone({ alias: 'Centred' })], container);

		const label = container.querySelector('.ttrpgmap-zone-label')!;
		// Square centred on the anchor, so the centroid is the anchor itself
		expect(label.getAttribute('x')).toBe('100');
		expect(label.getAttribute('text-anchor')).toBe('middle');
	});

	it('places the label below the centroid when asked', async () => {
		await render([createZone({ alias: 'Below', textPlacement: 'below' })], container);

		const label = container.querySelector('.ttrpgmap-zone-label')!;
		expect(label.getAttribute('dominant-baseline')).toBe('hanging');
		expect(Number(label.getAttribute('y'))).toBeGreaterThan(200);
	});

	it('places the label above the centroid by default', async () => {
		await render([createZone({ alias: 'Above' })], container);

		const label = container.querySelector('.ttrpgmap-zone-label')!;
		expect(label.getAttribute('dominant-baseline')).toBe('auto');
		expect(Number(label.getAttribute('y'))).toBeLessThan(200);
	});
});

describe('MapRenderer hot zone hover feedback', () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement('div');
	});

	it('exposes the base fill opacity as a variable for the hover tint', async () => {
		await render([createZone({ transparency: 40 })], container);

		const group = container.querySelector('.ttrpgmap-zone') as SVGGElement;
		expect(group.style.getPropertyValue('--zone-fill-opacity')).toBe('0.6');
	});

	it('exposes a variable even for a fully transparent zone', async () => {
		await render([createZone({ transparency: 100 })], container);

		const group = container.querySelector('.ttrpgmap-zone') as SVGGElement;
		// Hover still has something to tint relative to
		expect(group.style.getPropertyValue('--zone-fill-opacity')).toBe('0');
	});

	it('keeps the variable in step with the rendered fill-opacity', async () => {
		await render([createZone({ transparency: 25 })], container);

		const group = container.querySelector('.ttrpgmap-zone') as SVGGElement;
		const polygon = container.querySelector('.ttrpgmap-zone-shape')!;
		expect(group.style.getPropertyValue('--zone-fill-opacity')).toBe(polygon.getAttribute('fill-opacity'));
	});
});

describe('MapRenderer zone drawing suppresses existing markers', () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement('div');
	});

	/** Reach the private zone-draw entry points the context menu uses. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const priv = (r: MapRenderer) => r as any;

	it('marks pins inert and strips their events while drawing', async () => {
		const renderer = await render([createPin()], container);

		priv(renderer).startZoneDraw();

		const markerEl = container.querySelector('.ttrpgmap-marker')!;
		expect(markerEl.classList.contains('ttrpgmap-marker-inert')).toBe(true);
	});

	it('marks the zone layer inert while drawing', async () => {
		const renderer = await render([createZone()], container);
		const layer = container.querySelector('.ttrpgmap-zone-layer')!;
		expect(layer.classList.contains('ttrpgmap-zone-layer--inert')).toBe(false);

		priv(renderer).startZoneDraw();

		expect(layer.classList.contains('ttrpgmap-zone-layer--inert')).toBe(true);
	});

	it('restores interactivity once drawing is cancelled', async () => {
		const renderer = await render([createZone(), createPin()], container);

		priv(renderer).startZoneDraw();
		priv(renderer).zoneDraw.cancel();

		const layer = container.querySelector('.ttrpgmap-zone-layer')!;
		const markerEl = container.querySelector('.ttrpgmap-marker')!;
		expect(layer.classList.contains('ttrpgmap-zone-layer--inert')).toBe(false);
		expect(markerEl.classList.contains('ttrpgmap-marker-inert')).toBe(false);
	});

	it('hides the zone being redrawn so it cannot block drawing over it', async () => {
		const zone = createZone({ id: 'zone_redraw' });
		const renderer = await render([zone], container);
		expect(container.querySelectorAll('.ttrpgmap-zone').length).toBe(1);

		priv(renderer).redrawZone(zone);

		// Hidden entirely rather than dimmed
		expect(container.querySelector('.ttrpgmap-zone')).toBeNull();
	});

	it('keeps other zones visible while one is being redrawn', async () => {
		const target = createZone({ id: 'target', points: square(30) });
		const other = createZone({ id: 'other', points: square(10) });
		const renderer = await render([target, other], container);

		priv(renderer).redrawZone(target);

		const ids = Array.from(container.querySelectorAll('.ttrpgmap-zone')).map((el) =>
			el.getAttribute('data-marker-id'),
		);
		expect(ids).toEqual(['other']);
	});

	it('brings the redrawn zone back after the redraw is cancelled', async () => {
		const zone = createZone({ id: 'zone_redraw' });
		const renderer = await render([zone], container);

		priv(renderer).redrawZone(zone);
		priv(renderer).zoneDraw.cancel();

		const group = container.querySelector('.ttrpgmap-zone');
		expect(group).not.toBeNull();
		expect(group!.getAttribute('data-marker-id')).toBe('zone_redraw');
	});

	it('does not hide the zone if drawing could not start', async () => {
		const zone = createZone({ id: 'zone_redraw' });
		const renderer = await render([zone], container);
		// Another interaction owns the map, so start() is refused
		priv(renderer).interaction.tryEnter('panning');

		priv(renderer).redrawZone(zone);

		expect(container.querySelector('.ttrpgmap-zone')).not.toBeNull();
	});
});
