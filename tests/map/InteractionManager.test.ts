import { describe, it, expect, vi } from 'vitest';
import { InteractionManager } from '../../src/map/InteractionManager';

describe('InteractionManager', () => {
	it('starts in idle', () => {
		const mgr = new InteractionManager(vi.fn());
		expect(mgr.current).toBe('idle');
		expect(mgr.isIdle).toBe(true);
	});

	it('allows transition from idle to any mode', () => {
		const modes = [
			'panning',
			'dragging-marker',
			'calibrating',
			'measuring',
			'freehand',
			'resizing-marker',
			'edge-resize',
			'copying',
		] as const;
		for (const mode of modes) {
			const mgr = new InteractionManager(vi.fn());
			expect(mgr.tryEnter(mode)).toBe(true);
			expect(mgr.current).toBe(mode);
		}
	});

	it('blocks invalid transitions', () => {
		const mgr = new InteractionManager(vi.fn());
		mgr.tryEnter('panning');
		expect(mgr.tryEnter('copying')).toBe(false);
		expect(mgr.current).toBe('panning');
	});

	it('allows re-entering the same mode', () => {
		const mgr = new InteractionManager(vi.fn());
		mgr.tryEnter('panning');
		expect(mgr.tryEnter('panning')).toBe(true);
	});

	it('exit returns to idle from simple modes', () => {
		const mgr = new InteractionManager(vi.fn());
		mgr.tryEnter('panning');
		mgr.exit();
		expect(mgr.current).toBe('idle');
	});

	it('exit from drawing-freehand returns to freehand', () => {
		const mgr = new InteractionManager(vi.fn());
		mgr.tryEnter('freehand');
		mgr.tryEnter('drawing-freehand');
		expect(mgr.current).toBe('drawing-freehand');
		mgr.exit();
		expect(mgr.current).toBe('freehand');
	});

	it('exit from dragging-handle returns to resizing-marker', () => {
		const mgr = new InteractionManager(vi.fn());
		mgr.tryEnter('resizing-marker');
		mgr.tryEnter('dragging-handle');
		mgr.exit();
		expect(mgr.current).toBe('resizing-marker');
	});

	it('reset always returns to idle', () => {
		const mgr = new InteractionManager(vi.fn());
		mgr.tryEnter('freehand');
		mgr.tryEnter('drawing-freehand');
		mgr.reset();
		expect(mgr.current).toBe('idle');
	});

	it('isMeasuring is true for measurement modes', () => {
		const measureModes = ['calibrating', 'measuring', 'freehand', 'drawing-freehand'] as const;
		for (const mode of measureModes) {
			const mgr = new InteractionManager(vi.fn());
			if (mode === 'drawing-freehand') {
				mgr.tryEnter('freehand');
			}
			mgr.tryEnter(mode);
			expect(mgr.isMeasuring).toBe(true);
		}
	});

	it('isMeasuring is false for non-measurement modes', () => {
		const nonMeasure = ['idle', 'panning', 'dragging-marker', 'copying'] as const;
		for (const mode of nonMeasure) {
			const mgr = new InteractionManager(vi.fn());
			if (mode !== 'idle') mgr.tryEnter(mode);
			expect(mgr.isMeasuring).toBe(false);
		}
	});

	it('isDrawing is true only for drawing-freehand', () => {
		const mgr = new InteractionManager(vi.fn());
		mgr.tryEnter('freehand');
		expect(mgr.isDrawing).toBe(false);
		mgr.tryEnter('drawing-freehand');
		expect(mgr.isDrawing).toBe(true);
	});

	it('allows dragging-marker to transition to panning (locked markers fallback)', () => {
		const mgr = new InteractionManager(vi.fn());
		mgr.tryEnter('dragging-marker');
		expect(mgr.tryEnter('panning')).toBe(true);
		expect(mgr.current).toBe('panning');
	});

	it('calls onTransition callback on every state change', () => {
		const cb = vi.fn();
		const mgr = new InteractionManager(cb);
		mgr.tryEnter('panning');
		expect(cb).toHaveBeenCalledTimes(1);
		mgr.exit();
		expect(cb).toHaveBeenCalledTimes(2);
		mgr.reset();
		expect(cb).toHaveBeenCalledTimes(3);
	});

	it('does not call onTransition for blocked transitions', () => {
		const cb = vi.fn();
		const mgr = new InteractionManager(cb);
		mgr.tryEnter('panning');
		cb.mockClear();
		mgr.tryEnter('copying'); // blocked
		expect(cb).not.toHaveBeenCalled();
	});
});
