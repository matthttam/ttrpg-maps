import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pulseHighlight } from '../../src/utils/settingsNav';

const HIGHLIGHT = 'ttrpgmap-setting-highlight';

/** Matches HIGHLIGHT_DURATION_MS + 100 in settingsNav.ts. */
const FALLBACK_MS = 2500;

describe('pulseHighlight', () => {
	let el: HTMLElement;
	let originalScrollIntoView: typeof Element.prototype.scrollIntoView;

	beforeEach(() => {
		vi.useFakeTimers();
		// jsdom has no layout, so scrollIntoView is not implemented
		originalScrollIntoView = Element.prototype.scrollIntoView;
		Element.prototype.scrollIntoView = vi.fn();
		el = document.createElement('div');
	});

	afterEach(() => {
		vi.useRealTimers();
		Element.prototype.scrollIntoView = originalScrollIntoView;
	});

	it('scrolls the target into view and marks it highlighted', () => {
		pulseHighlight(el);

		expect(el.scrollIntoView).toHaveBeenCalled();
		expect(el.classList.contains(HIGHLIGHT)).toBe(true);
	});

	it('clears the highlight when the flash animation ends', () => {
		pulseHighlight(el);
		el.dispatchEvent(new Event('animationend'));

		expect(el.classList.contains(HIGHLIGHT)).toBe(false);
	});

	// Regression: under `prefers-reduced-motion: reduce` styles.css sets
	// `animation: none` on this class, so `animationend` never fires. Without a
	// fallback the class -- and the grey background it paints -- stuck forever.
	// jsdom runs no CSS animations either, so this is that exact situation.
	it('clears the highlight on a timer when no animation ever runs', () => {
		pulseHighlight(el);
		expect(el.classList.contains(HIGHLIGHT)).toBe(true);

		vi.advanceTimersByTime(FALLBACK_MS - 100);
		expect(el.classList.contains(HIGHLIGHT)).toBe(true);

		vi.advanceTimersByTime(100);
		expect(el.classList.contains(HIGHLIGHT)).toBe(false);
	});

	it('cancels the fallback timer once the animation has ended', () => {
		pulseHighlight(el);
		el.dispatchEvent(new Event('animationend'));

		// A highlight applied later must not be stripped by the earlier timer
		el.addClass(HIGHLIGHT);
		vi.advanceTimersByTime(FALLBACK_MS * 2);

		expect(el.classList.contains(HIGHLIGHT)).toBe(true);
	});

	it('detaches its animationend listener after clearing', () => {
		pulseHighlight(el);
		el.dispatchEvent(new Event('animationend'));

		// An unrelated animation on the same element must not clear a fresh highlight
		el.addClass(HIGHLIGHT);
		el.dispatchEvent(new Event('animationend'));

		expect(el.classList.contains(HIGHLIGHT)).toBe(true);
	});

	it('clears the highlight only once when both the animation and the timer would fire', () => {
		pulseHighlight(el);
		el.dispatchEvent(new Event('animationend'));
		expect(el.classList.contains(HIGHLIGHT)).toBe(false);

		vi.advanceTimersByTime(FALLBACK_MS * 2);
		expect(el.classList.contains(HIGHLIGHT)).toBe(false);
	});
});
