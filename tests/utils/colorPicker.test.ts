import { describe, it, expect } from 'vitest';
import { normalizeHexColor } from '../../src/utils/colorPicker';

describe('normalizeHexColor', () => {
	it('passes through canonical #rrggbb (lowercased)', () => {
		expect(normalizeHexColor('#ffffff')).toBe('#ffffff');
		expect(normalizeHexColor('#000000')).toBe('#000000');
		expect(normalizeHexColor('#FF8800')).toBe('#ff8800');
	});

	it('trims surrounding whitespace', () => {
		expect(normalizeHexColor('  #abcdef  ')).toBe('#abcdef');
	});

	it('expands shorthand #rgb', () => {
		expect(normalizeHexColor('#fff')).toBe('#ffffff');
		expect(normalizeHexColor('#f80')).toBe('#ff8800');
	});

	it('drops the alpha channel from #rrggbbaa and #rgba', () => {
		expect(normalizeHexColor('#ffffff80')).toBe('#ffffff');
		expect(normalizeHexColor('#fff8')).toBe('#ffffff');
	});

	it('falls back to #000000 for values a native color input rejects', () => {
		// Named colors, rgb(), and malformed strings would otherwise reset the
		// native <input type="color"> to #000000 anyway — normalize predictably.
		expect(normalizeHexColor('white')).toBe('#000000');
		expect(normalizeHexColor('rgb(255,255,255)')).toBe('#000000');
		expect(normalizeHexColor('#12')).toBe('#000000');
		expect(normalizeHexColor('')).toBe('#000000');
	});

	it('respects a custom fallback', () => {
		expect(normalizeHexColor('white', '#ffffff')).toBe('#ffffff');
		expect(normalizeHexColor(null, '#ffffff')).toBe('#ffffff');
		expect(normalizeHexColor(undefined, '#ffffff')).toBe('#ffffff');
	});
});
