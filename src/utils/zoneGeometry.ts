import { MapMarker, MapPoint } from '../types';

/**
 * Geometry helpers for hot zones (markers with `shape === 'area'`).
 *
 * Zone points are stored on the marker relative to its `x`/`y` anchor, in
 * natural image pixels. Keeping them relative means dragging a whole zone only
 * updates the anchor, and it keeps the numbers small and readable in the
 * sidecar JSON.
 */

/** Minimum vertices for a usable polygon. */
export const ZONE_MIN_POINTS = 3;

export interface ZoneBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

/** Axis-aligned bounding box of a point list. */
export function zoneBounds(points: MapPoint[]): ZoneBounds {
	if (points.length === 0) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
	}
	let minX = points[0].x;
	let maxX = points[0].x;
	let minY = points[0].y;
	let maxY = points[0].y;
	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}
	return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Signed-area (shoelace) magnitude of a polygon. Used to order overlapping zones. */
export function zoneArea(points: MapPoint[]): number {
	if (points.length < ZONE_MIN_POINTS) return 0;
	let sum = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		sum += a.x * b.y - b.x * a.y;
	}
	return Math.abs(sum) / 2;
}

/**
 * Polygon centroid. Falls back to the mean of the vertices for degenerate
 * (zero-area) shapes, e.g. a straight line of points.
 */
export function zoneCentroid(points: MapPoint[]): MapPoint {
	if (points.length === 0) return { x: 0, y: 0 };
	if (points.length < ZONE_MIN_POINTS) return meanPoint(points);

	let signedArea = 0;
	let cx = 0;
	let cy = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		const cross = a.x * b.y - b.x * a.y;
		signedArea += cross;
		cx += (a.x + b.x) * cross;
		cy += (a.y + b.y) * cross;
	}
	if (signedArea === 0) return meanPoint(points);
	return { x: cx / (3 * signedArea), y: cy / (3 * signedArea) };
}

function meanPoint(points: MapPoint[]): MapPoint {
	let sx = 0;
	let sy = 0;
	for (const p of points) {
		sx += p.x;
		sy += p.y;
	}
	return { x: sx / points.length, y: sy / points.length };
}

/**
 * Split absolute drawn points into an anchor (the centroid) plus points
 * relative to it, ready to store on a marker.
 */
export function anchorZonePoints(absolute: MapPoint[]): { anchor: MapPoint; points: MapPoint[] } {
	const anchor = zoneCentroid(absolute);
	return {
		anchor,
		points: absolute.map((p) => ({ x: p.x - anchor.x, y: p.y - anchor.y })),
	};
}

/** Resolve a zone marker's stored relative points back to absolute map coords. */
export function resolveZonePoints(marker: Pick<MapMarker, 'x' | 'y' | 'points'>): MapPoint[] {
	if (!marker.points) return [];
	return marker.points.map((p) => ({ x: marker.x + p.x, y: marker.y + p.y }));
}

/** True when this marker is a hot zone with usable geometry. */
export function isZone(marker: Pick<MapMarker, 'shape' | 'points'>): boolean {
	return marker.shape === 'area' && (marker.points?.length ?? 0) >= ZONE_MIN_POINTS;
}

/**
 * Format points for an SVG `points` attribute, scaled from natural image
 * pixels into the overlay's display coordinates.
 */
export function zonePointsAttr(points: MapPoint[], sx: number, sy: number): string {
	return points.map((p) => `${p.x * sx},${p.y * sy}`).join(' ');
}

/**
 * Render a zone's real outline into a small preview swatch.
 *
 * Setting the viewBox to the polygon's bounding box makes any shape scale to
 * fit, so the list shows the actual drawn outline rather than a generic glyph.
 */
export function appendZoneListPreview(container: HTMLElement, marker: MapMarker): void {
	const absolute = resolveZonePoints(marker);
	if (absolute.length === 0) return;
	const b = zoneBounds(absolute);
	const pad = Math.max(b.width, b.height) * 0.08 + 1;
	const fill = marker.color ?? '#ffffff';

	const svg = createSvg('svg', {
		cls: 'ttrpgmap-zone-list-preview',
		attr: {
			viewBox: `${b.minX - pad} ${b.minY - pad} ${b.width + pad * 2} ${b.height + pad * 2}`,
			preserveAspectRatio: 'xMidYMid meet',
		},
	});
	const polygon = createSvg('polygon', {
		attr: {
			points: zonePointsAttr(absolute, 1, 1),
			fill,
			'fill-opacity': String(1 - Math.min(100, Math.max(0, marker.transparency ?? 0)) / 100),
			stroke: darkenHex(fill),
			'stroke-width': String(Math.max(1, Math.max(b.width, b.height) * 0.03)),
		},
	});
	svg.appendChild(polygon);
	container.appendChild(svg);
}

/**
 * Darken a `#rrggbb` color for a zone outline. The outline is derived from the
 * fill rather than stored, and deliberately ignores the fill's transparency so
 * a fully transparent zone still shows an outline on hover.
 */
export function darkenHex(hex: string, factor = 0.45): string {
	const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return '#000000';
	const value = parseInt(m[1], 16);
	const r = Math.round(((value >> 16) & 0xff) * factor);
	const g = Math.round(((value >> 8) & 0xff) * factor);
	const b = Math.round((value & 0xff) * factor);
	const to2 = (n: number) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0');
	return `#${to2(r)}${to2(g)}${to2(b)}`;
}
