import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZoneDrawController } from '../../src/map/ZoneDrawController';
import { InteractionManager } from '../../src/map/InteractionManager';
import type { MapPoint } from '../../src/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Harness {
	surface: HTMLElement;
	svgOverlay: SVGSVGElement;
	interaction: InteractionManager;
	controller: ZoneDrawController;
}

/**
 * Controllers to tear down after each test. The keydown listener lives on the
 * shared document, so a leaked one would fire during later tests.
 */
const active: ZoneDrawController[] = [];

function createHarness(scale: { sx: number; sy: number } = { sx: 1, sy: 1 }): Harness {
	const surface = document.createElement('div');
	document.body.appendChild(surface);
	const svgOverlay = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
	const interaction = new InteractionManager(vi.fn());
	const controller = new ZoneDrawController({
		surface,
		svgOverlay,
		interaction,
		// Identity mapping keeps the assertions readable
		screenToMap: (e: MouseEvent) => ({ x: e.clientX, y: e.clientY }),
		getImageScale: () => scale,
	});
	active.push(controller);
	return { surface, svgOverlay, interaction, controller };
}

function click(surface: HTMLElement, x: number, y: number): void {
	surface.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
}

function dblclick(surface: HTMLElement, x: number, y: number): void {
	surface.dispatchEvent(new MouseEvent('dblclick', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
}

function press(key: string): void {
	document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function shapePoints(svg: SVGSVGElement): string | null {
	return svg.querySelector('.ttrpgmap-zone-draw-shape')?.getAttribute('points') ?? null;
}

function dotCount(svg: SVGSVGElement): number {
	return svg.querySelectorAll('.ttrpgmap-zone-draw-dot').length;
}

/** Place a valid triangle without finishing it. */
function drawTriangle(surface: HTMLElement): void {
	click(surface, 0, 0);
	click(surface, 100, 0);
	click(surface, 100, 100);
}

beforeEach(() => {
	document.body.innerHTML = '';
});

afterEach(() => {
	while (active.length) active.pop()?.cancel();
});

describe('ZoneDrawController: entering and leaving draw mode', () => {
	it('claims the drawing-zone interaction mode on start', () => {
		const { controller, interaction } = createHarness();
		expect(controller.isDrawing).toBe(false);

		expect(controller.start(vi.fn())).toBe(true);
		expect(controller.isDrawing).toBe(true);
		expect(interaction.current).toBe('drawing-zone');
	});

	it('refuses to start twice', () => {
		const { controller } = createHarness();
		controller.start(vi.fn());
		expect(controller.start(vi.fn())).toBe(false);
	});

	it('refuses to start when another interaction owns the map', () => {
		const { controller, interaction } = createHarness();
		interaction.tryEnter('panning');

		expect(controller.start(vi.fn())).toBe(false);
		expect(controller.isDrawing).toBe(false);
		expect(interaction.current).toBe('panning');
	});

	it('releases the interaction mode and removes the preview when cancelled', () => {
		const { controller, interaction, svgOverlay, surface } = createHarness();
		controller.start(vi.fn());
		drawTriangle(surface);

		controller.cancel();

		expect(controller.isDrawing).toBe(false);
		expect(interaction.current).toBe('idle');
		expect(svgOverlay.querySelector('.ttrpgmap-zone-draw')).toBeNull();
	});

	it('cancel is a no-op when not drawing', () => {
		const { controller, interaction } = createHarness();
		expect(() => controller.cancel()).not.toThrow();
		expect(interaction.current).toBe('idle');
	});
});

describe('ZoneDrawController: placing vertices', () => {
	it('accumulates a vertex per click', () => {
		const { controller, surface, svgOverlay } = createHarness();
		controller.start(vi.fn());

		click(surface, 10, 20);
		expect(shapePoints(svgOverlay)).toBe('10,20');

		click(surface, 30, 40);
		expect(shapePoints(svgOverlay)).toBe('10,20 30,40');
	});

	it('scales preview coordinates by the image scale', () => {
		const { controller, surface, svgOverlay } = createHarness({ sx: 2, sy: 0.5 });
		controller.start(vi.fn());

		click(surface, 10, 20);
		expect(shapePoints(svgOverlay)).toBe('20,10');
	});

	it('draws a dot per vertex and marks the first one', () => {
		const { controller, surface, svgOverlay } = createHarness();
		controller.start(vi.fn());
		drawTriangle(surface);

		expect(dotCount(svgOverlay)).toBe(3);
		expect(svgOverlay.querySelectorAll('.ttrpgmap-zone-draw-dot--first').length).toBe(1);
	});

	it('backspace removes the most recent vertex', () => {
		const { controller, surface, svgOverlay } = createHarness();
		controller.start(vi.fn());
		drawTriangle(surface);

		press('Backspace');

		expect(shapePoints(svgOverlay)).toBe('0,0 100,0');
		expect(dotCount(svgOverlay)).toBe(2);
		expect(controller.isDrawing).toBe(true);
	});

	it('backspace past the first vertex leaves an empty shape without erroring', () => {
		const { controller, surface, svgOverlay } = createHarness();
		controller.start(vi.fn());
		click(surface, 5, 5);

		press('Backspace');
		expect(() => press('Backspace')).not.toThrow();

		expect(shapePoints(svgOverlay)).toBe('');
		expect(controller.isDrawing).toBe(true);
	});

	it('tracks the cursor with a rubber-band line from the last vertex', () => {
		const { controller, surface, svgOverlay } = createHarness();
		controller.start(vi.fn());
		click(surface, 10, 10);

		surface.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 60, bubbles: true }));

		const rubber = svgOverlay.querySelector('.ttrpgmap-zone-draw-rubber');
		expect(rubber?.getAttribute('x1')).toBe('10');
		expect(rubber?.getAttribute('y1')).toBe('10');
		expect(rubber?.getAttribute('x2')).toBe('50');
		expect(rubber?.getAttribute('y2')).toBe('60');
	});
});

describe('ZoneDrawController: completing a shape', () => {
	it('reports the drawn points in map coordinates', () => {
		const { controller, surface } = createHarness();
		const onFinish = vi.fn();
		controller.start(onFinish);
		drawTriangle(surface);

		press('Enter');

		expect(onFinish).toHaveBeenCalledTimes(1);
		const points = onFinish.mock.calls[0][0] as MapPoint[];
		expect(points).toEqual([
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 },
		]);
	});

	it('reports unscaled map coordinates even when the image scale is not 1', () => {
		const { controller, surface } = createHarness({ sx: 2, sy: 0.5 });
		const onFinish = vi.fn();
		controller.start(onFinish);
		drawTriangle(surface);

		press('Enter');

		expect(onFinish.mock.calls[0][0]).toEqual([
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 },
		]);
	});

	it('refuses to finish with fewer than three points', () => {
		const { controller, surface } = createHarness();
		const onFinish = vi.fn();
		controller.start(onFinish);
		click(surface, 0, 0);
		click(surface, 10, 10);

		press('Enter');

		expect(onFinish).not.toHaveBeenCalled();
		expect(controller.isDrawing).toBe(true);
	});

	it('closes when clicking near the first vertex', () => {
		const { controller, surface } = createHarness();
		const onFinish = vi.fn();
		controller.start(onFinish);
		drawTriangle(surface);

		// Within the snap distance of (0,0), so this closes rather than adding
		click(surface, 4, 4);

		expect(onFinish).toHaveBeenCalledTimes(1);
		expect(onFinish.mock.calls[0][0]).toHaveLength(3);
	});

	it('adds a vertex when clicking far from the first one', () => {
		const { controller, surface } = createHarness();
		const onFinish = vi.fn();
		controller.start(onFinish);
		drawTriangle(surface);

		click(surface, 60, 90);

		expect(onFinish).not.toHaveBeenCalled();
		expect(controller.isDrawing).toBe(true);
	});

	it('does not treat a near-first click as closing before there are three points', () => {
		const { controller, surface } = createHarness();
		const onFinish = vi.fn();
		controller.start(onFinish);
		click(surface, 0, 0);
		click(surface, 100, 0);

		click(surface, 2, 2);

		expect(onFinish).not.toHaveBeenCalled();
		expect(controller.isDrawing).toBe(true);
	});

	it('finishes on double click', () => {
		const { controller, surface } = createHarness();
		const onFinish = vi.fn();
		controller.start(onFinish);
		drawTriangle(surface);

		dblclick(surface, 100, 100);

		expect(onFinish).toHaveBeenCalledTimes(1);
	});

	it('escape abandons the shape without reporting it', () => {
		const { controller, surface } = createHarness();
		const onFinish = vi.fn();
		controller.start(onFinish);
		drawTriangle(surface);

		press('Escape');

		expect(onFinish).not.toHaveBeenCalled();
		expect(controller.isDrawing).toBe(false);
	});

	it('tears down the preview and interaction mode after finishing', () => {
		const { controller, surface, svgOverlay, interaction } = createHarness();
		controller.start(vi.fn());
		drawTriangle(surface);

		press('Enter');

		expect(controller.isDrawing).toBe(false);
		expect(interaction.current).toBe('idle');
		expect(svgOverlay.querySelector('.ttrpgmap-zone-draw')).toBeNull();
	});

	it('ignores further input once finished', () => {
		const { controller, surface } = createHarness();
		const onFinish = vi.fn();
		controller.start(onFinish);
		drawTriangle(surface);
		press('Enter');

		click(surface, 500, 500);
		press('Enter');

		expect(onFinish).toHaveBeenCalledTimes(1);
	});

	it('can draw a second zone after the first completes', () => {
		const { controller, surface } = createHarness();
		const first = vi.fn();
		controller.start(first);
		drawTriangle(surface);
		press('Enter');

		const second = vi.fn();
		expect(controller.start(second)).toBe(true);
		click(surface, 5, 5);
		click(surface, 50, 5);
		click(surface, 50, 50);
		press('Enter');

		expect(second).toHaveBeenCalledTimes(1);
		expect(second.mock.calls[0][0]).toHaveLength(3);
	});
});
