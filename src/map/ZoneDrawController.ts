import { Notice } from 'obsidian';
import { MapPoint } from '../types';
import { InteractionManager } from './InteractionManager';
import { ZONE_MIN_POINTS, zonePointsAttr } from '../utils/zoneGeometry';

/** Screen distance (display px) within which a click counts as "on the first vertex". */
const CLOSE_SNAP_DISTANCE = 12;

export interface ZoneDrawContext {
	/** Element that receives the drawing clicks (the map container). */
	surface: HTMLElement;
	/** SVG overlay inside the zoom/pan transform, in display coordinates. */
	svgOverlay: SVGSVGElement;
	interaction: InteractionManager;
	/** Convert a mouse event to natural image pixel coords. */
	screenToMap: (e: MouseEvent) => MapPoint;
	/** Display-to-natural scale factors. */
	getImageScale: () => { sx: number; sy: number };
	/** Called when drawing starts and stops, so the map can re-render around it. */
	onDrawStateChange?: () => void;
}

/**
 * Click-to-place polygon drawing for hot zones.
 *
 * Click to drop each vertex, with a rubber-band preview following the cursor.
 * Close by clicking the first vertex, double-clicking, or pressing Enter.
 * Backspace removes the last vertex; Escape cancels the whole shape.
 */
export class ZoneDrawController {
	private ctx: ZoneDrawContext;
	private points: MapPoint[] = [];
	private active = false;
	private onFinish: ((points: MapPoint[]) => void) | null = null;

	private group: SVGGElement | null = null;
	private shape: SVGPolygonElement | null = null;
	private rubberBand: SVGLineElement | null = null;
	private vertexDots: SVGCircleElement[] = [];

	// Bound so the same reference can be removed again
	private readonly onClick = (e: MouseEvent) => this.handleClick(e);
	private readonly onMove = (e: MouseEvent) => this.handleMove(e);
	private readonly onDblClick = (e: MouseEvent) => this.handleDblClick(e);
	private readonly onContextMenu = (e: MouseEvent) => this.handleContextMenu(e);
	private readonly onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);

	constructor(ctx: ZoneDrawContext) {
		this.ctx = ctx;
	}

	get isDrawing(): boolean {
		return this.active;
	}

	/** Enter drawing mode. Resolves through `onFinish` only if a shape is completed. */
	start(onFinish: (points: MapPoint[]) => void): boolean {
		if (this.active) return false;
		if (!this.ctx.interaction.tryEnter('drawing-zone')) return false;

		this.active = true;
		this.points = [];
		this.onFinish = onFinish;

		this.group = createSvg('g', { cls: 'ttrpgmap-zone-draw' });
		this.ctx.svgOverlay.appendChild(this.group);

		this.rubberBand = createSvg('line', { cls: 'ttrpgmap-zone-draw-rubber' });
		this.group.appendChild(this.rubberBand);

		this.shape = createSvg('polygon', { cls: 'ttrpgmap-zone-draw-shape' });
		this.group.appendChild(this.shape);

		this.ctx.surface.addClass('ttrpgmap-cursor-crosshair');
		// Capture phase so a click lands here before marker/pan handlers see it.
		this.ctx.surface.addEventListener('click', this.onClick, true);
		this.ctx.surface.addEventListener('mousemove', this.onMove);
		this.ctx.surface.addEventListener('dblclick', this.onDblClick, true);
		// Capture phase so this beats the map's own context menu handler
		this.ctx.surface.addEventListener('contextmenu', this.onContextMenu, true);
		activeDocument.addEventListener('keydown', this.onKeyDown, true);

		// Let the map dim and disable existing markers while drawing
		this.ctx.onDrawStateChange?.();

		new Notice(
			'Click to place points. Press enter, right-click, double-click, or click the first point to finish. Escape cancels.',
		);
		return true;
	}

	/** Leave drawing mode and discard any in-progress shape. */
	cancel(): void {
		if (!this.active) return;
		this.teardown();
		this.onFinish = null;
	}

	private teardown(): void {
		this.active = false;
		this.points = [];
		this.vertexDots = [];
		this.group?.remove();
		this.group = null;
		this.shape = null;
		this.rubberBand = null;

		this.ctx.surface.removeClass('ttrpgmap-cursor-crosshair');
		this.ctx.surface.removeEventListener('click', this.onClick, true);
		this.ctx.surface.removeEventListener('mousemove', this.onMove);
		this.ctx.surface.removeEventListener('dblclick', this.onDblClick, true);
		this.ctx.surface.removeEventListener('contextmenu', this.onContextMenu, true);
		activeDocument.removeEventListener('keydown', this.onKeyDown, true);

		this.ctx.interaction.exit();
		this.ctx.onDrawStateChange?.();
	}

	private handleClick(e: MouseEvent): void {
		if (!this.active) return;
		e.preventDefault();
		e.stopPropagation();

		const point = this.ctx.screenToMap(e);

		// Clicking near the first vertex closes the shape
		if (this.points.length >= ZONE_MIN_POINTS && this.isNearFirstPoint(point)) {
			this.finish();
			return;
		}

		this.points.push(point);
		this.redraw();
	}

	private handleMove(e: MouseEvent): void {
		if (!this.active || this.points.length === 0 || !this.rubberBand) return;
		const { sx, sy } = this.ctx.getImageScale();
		const last = this.points[this.points.length - 1];
		const cursor = this.ctx.screenToMap(e);
		this.rubberBand.setAttribute('x1', String(last.x * sx));
		this.rubberBand.setAttribute('y1', String(last.y * sy));
		this.rubberBand.setAttribute('x2', String(cursor.x * sx));
		this.rubberBand.setAttribute('y2', String(cursor.y * sy));
	}

	private handleDblClick(e: MouseEvent): void {
		if (!this.active) return;
		e.preventDefault();
		e.stopPropagation();
		// The dblclick follows two clicks, so the vertex is already placed.
		this.finish();
	}

	private handleContextMenu(e: MouseEvent): void {
		if (!this.active) return;
		// Right-click finishes the shape rather than opening the map menu
		e.preventDefault();
		e.stopPropagation();
		this.finish();
	}

	private handleKeyDown(e: KeyboardEvent): void {
		if (!this.active) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			this.cancel();
			new Notice('Hot zone cancelled.');
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			this.finish();
			return;
		}
		if (e.key === 'Backspace') {
			e.preventDefault();
			e.stopPropagation();
			this.points.pop();
			this.redraw();
		}
	}

	private isNearFirstPoint(point: MapPoint): boolean {
		const first = this.points[0];
		const { sx, sy } = this.ctx.getImageScale();
		const dx = (point.x - first.x) * sx;
		const dy = (point.y - first.y) * sy;
		return Math.sqrt(dx * dx + dy * dy) <= CLOSE_SNAP_DISTANCE;
	}

	private redraw(): void {
		if (!this.shape || !this.group) return;
		const { sx, sy } = this.ctx.getImageScale();
		this.shape.setAttribute('points', zonePointsAttr(this.points, sx, sy));

		// Rebuild vertex dots so Backspace removes them too
		for (const dot of this.vertexDots) dot.remove();
		this.vertexDots = this.points.map((p, i) => {
			const dot = createSvg('circle', {
				cls: i === 0 ? 'ttrpgmap-zone-draw-dot ttrpgmap-zone-draw-dot--first' : 'ttrpgmap-zone-draw-dot',
			});
			dot.setAttribute('cx', String(p.x * sx));
			dot.setAttribute('cy', String(p.y * sy));
			dot.setAttribute('r', '4');
			this.group?.appendChild(dot);
			return dot;
		});

		if (this.points.length === 0 && this.rubberBand) {
			this.rubberBand.removeAttribute('x1');
			this.rubberBand.removeAttribute('y1');
			this.rubberBand.removeAttribute('x2');
			this.rubberBand.removeAttribute('y2');
		}
	}

	private finish(): void {
		if (!this.active) return;
		if (this.points.length < ZONE_MIN_POINTS) {
			new Notice(`A hot zone needs at least ${ZONE_MIN_POINTS} points.`);
			return;
		}
		const done = this.onFinish;
		const points = this.points.slice();
		this.teardown();
		this.onFinish = null;
		done?.(points);
	}
}
