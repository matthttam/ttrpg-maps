import { describe, it, expect } from 'vitest';
import {
	ZONE_MIN_POINTS,
	anchorZonePoints,
	darkenHex,
	isZone,
	resolveZonePoints,
	zoneArea,
	zoneBounds,
	zoneCentroid,
	zonePointsAttr,
	appendZoneListPreview,
} from '../../src/utils/zoneGeometry';
import type { MapMarker, MapPoint } from '../../src/types';

/** A 10x10 square starting at (0,0) */
const SQUARE: MapPoint[] = [
	{ x: 0, y: 0 },
	{ x: 10, y: 0 },
	{ x: 10, y: 10 },
	{ x: 0, y: 10 },
];

describe('zoneBounds', () => {
	it('computes the bounding box', () => {
		expect(zoneBounds(SQUARE)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 });
	});

	it('handles negative coordinates', () => {
		const b = zoneBounds([
			{ x: -5, y: -2 },
			{ x: 3, y: 8 },
		]);
		expect(b).toEqual({ minX: -5, minY: -2, maxX: 3, maxY: 8, width: 8, height: 10 });
	});

	it('returns zeros for an empty list', () => {
		expect(zoneBounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 });
	});
});

describe('zoneArea', () => {
	it('computes the area of a square', () => {
		expect(zoneArea(SQUARE)).toBe(100);
	});

	it('is orientation independent', () => {
		expect(zoneArea([...SQUARE].reverse())).toBe(100);
	});

	it('is zero for degenerate shapes', () => {
		expect(zoneArea([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe(0);
		expect(zoneArea([])).toBe(0);
	});

	it('is zero for collinear points', () => {
		expect(
			zoneArea([
				{ x: 0, y: 0 },
				{ x: 5, y: 0 },
				{ x: 10, y: 0 },
			]),
		).toBe(0);
	});
});

describe('zoneCentroid', () => {
	it('finds the center of a square', () => {
		expect(zoneCentroid(SQUARE)).toEqual({ x: 5, y: 5 });
	});

	it('falls back to the mean for collinear points', () => {
		const c = zoneCentroid([
			{ x: 0, y: 0 },
			{ x: 4, y: 0 },
			{ x: 8, y: 0 },
		]);
		expect(c).toEqual({ x: 4, y: 0 });
	});

	it('handles fewer than three points', () => {
		expect(zoneCentroid([{ x: 2, y: 4 }])).toEqual({ x: 2, y: 4 });
		expect(zoneCentroid([])).toEqual({ x: 0, y: 0 });
	});
});

describe('anchorZonePoints / resolveZonePoints', () => {
	it('stores points relative to the centroid', () => {
		const { anchor, points } = anchorZonePoints(SQUARE);
		expect(anchor).toEqual({ x: 5, y: 5 });
		expect(points).toEqual([
			{ x: -5, y: -5 },
			{ x: 5, y: -5 },
			{ x: 5, y: 5 },
			{ x: -5, y: 5 },
		]);
	});

	it('round-trips back to the original absolute points', () => {
		const { anchor, points } = anchorZonePoints(SQUARE);
		const resolved = resolveZonePoints({ x: anchor.x, y: anchor.y, points });
		expect(resolved).toEqual(SQUARE);
	});

	it('moving the anchor translates the whole shape', () => {
		const { points } = anchorZonePoints(SQUARE);
		const resolved = resolveZonePoints({ x: 105, y: 205, points });
		expect(resolved).toEqual([
			{ x: 100, y: 200 },
			{ x: 110, y: 200 },
			{ x: 110, y: 210 },
			{ x: 100, y: 210 },
		]);
	});

	it('resolves to an empty list when there is no geometry', () => {
		expect(resolveZonePoints({ x: 0, y: 0, points: undefined })).toEqual([]);
	});
});

describe('isZone', () => {
	const zone = (shape: MapMarker['shape'], points?: MapPoint[]) => ({ shape, points });

	it('is true for an area marker with enough points', () => {
		expect(isZone(zone('area', SQUARE))).toBe(true);
	});

	it('is false for other shapes', () => {
		expect(isZone(zone('pin', SQUARE))).toBe(false);
		expect(isZone(zone('hotspot', SQUARE))).toBe(false);
	});

	it('is false for an area marker without usable geometry', () => {
		expect(isZone(zone('area', undefined))).toBe(false);
		expect(isZone(zone('area', []))).toBe(false);
		expect(isZone(zone('area', SQUARE.slice(0, ZONE_MIN_POINTS - 1)))).toBe(false);
	});
});

describe('zonePointsAttr', () => {
	it('formats points for an SVG points attribute', () => {
		expect(zonePointsAttr(SQUARE, 1, 1)).toBe('0,0 10,0 10,10 0,10');
	});

	it('applies the display scale factors', () => {
		expect(zonePointsAttr([{ x: 2, y: 3 }], 2, 0.5)).toBe('4,1.5');
	});
});

describe('darkenHex', () => {
	it('darkens a color toward black', () => {
		expect(darkenHex('#ffffff', 0.5)).toBe('#808080');
		expect(darkenHex('#ff0000', 0.5)).toBe('#800000');
	});

	it('keeps black black', () => {
		expect(darkenHex('#000000')).toBe('#000000');
	});

	it('accepts uppercase and surrounding whitespace', () => {
		expect(darkenHex('  #FFFFFF  ', 0.5)).toBe('#808080');
	});

	it('falls back to black for unparseable input', () => {
		expect(darkenHex('rgb(1,2,3)')).toBe('#000000');
		expect(darkenHex('#fff')).toBe('#000000');
	});
});

describe('appendZoneListPreview', () => {
	function zoneMarker(overrides?: Partial<MapMarker>): MapMarker {
		return {
			id: 'z1',
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
			points: SQUARE.map((p) => ({ x: p.x - 5, y: p.y - 5 })),
			scale: null,
			scaleToZoom: null,
			textScale: null,
			textScaleToZoom: null,
			font: null,
			textVisibility: null,
			...overrides,
		} as MapMarker;
	}

	it('renders the real outline, not a generic glyph', () => {
		const container = document.createElement('div');
		appendZoneListPreview(container, zoneMarker());

		const polygon = container.querySelector('polygon');
		expect(polygon).not.toBeNull();
		// Absolute points: anchor (100,200) plus each relative point
		expect(polygon!.getAttribute('points')).toBe('95,195 105,195 105,205 95,205');
	});

	it('sizes the viewBox to the bounding box so any shape scales to fit', () => {
		const container = document.createElement('div');
		appendZoneListPreview(container, zoneMarker());

		const viewBox = container.querySelector('svg')!.getAttribute('viewBox')!;
		const [minX, minY, w, h] = viewBox.split(' ').map(Number);
		// Padded box around the 10x10 square at (95,195)
		expect(minX).toBeLessThan(95);
		expect(minY).toBeLessThan(195);
		expect(w).toBeGreaterThan(10);
		expect(h).toBeGreaterThan(10);
		expect(w).toBe(h);
	});

	it('shows the fill color and derives the outline from it', () => {
		const container = document.createElement('div');
		appendZoneListPreview(container, zoneMarker({ color: '#ff0000' }));

		const polygon = container.querySelector('polygon')!;
		expect(polygon.getAttribute('fill')).toBe('#ff0000');
		expect(polygon.getAttribute('stroke')).toBe(darkenHex('#ff0000'));
	});

	it('reflects transparency in the swatch', () => {
		const container = document.createElement('div');
		appendZoneListPreview(container, zoneMarker({ transparency: 25 }));

		expect(container.querySelector('polygon')!.getAttribute('fill-opacity')).toBe('0.75');
	});

	it('renders nothing when the zone has no geometry', () => {
		const container = document.createElement('div');
		appendZoneListPreview(container, zoneMarker({ points: undefined }));

		expect(container.querySelector('svg')).toBeNull();
	});
});
