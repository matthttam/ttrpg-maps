import { describe, it, expect } from 'vitest';
import {
	getUnitsForSystem,
	getUnitDef,
	getUnitAbbr,
	getUnitLabel,
	getSystemForUnit,
	convertUnits,
	detectUnitFromLabel,
	roundingToBaseUnits,
	convertForDisplay,
	formatDisplayParts,
} from '../src/units';

describe('Unit definitions', () => {
	it('returns imperial units ordered smallest to largest', () => {
		const units = getUnitsForSystem('imperial');
		expect(units.map((u) => u.id)).toEqual(['in', 'ft', 'yd', 'mi']);
	});

	it('returns metric units ordered smallest to largest', () => {
		const units = getUnitsForSystem('metric');
		expect(units.map((u) => u.id)).toEqual(['mm', 'cm', 'm', 'km']);
	});

	it('returns empty array for custom system', () => {
		expect(getUnitsForSystem('custom')).toEqual([]);
	});

	it('looks up unit definitions', () => {
		const ft = getUnitDef('ft');
		expect(ft.label).toBe('feet');
		expect(ft.abbr).toBe('ft');
		expect(ft.toBase).toBe(12);
	});

	it('returns abbreviations and labels', () => {
		expect(getUnitAbbr('mi')).toBe('mi');
		expect(getUnitLabel('km')).toBe('kilometers');
	});

	it('identifies system for a unit', () => {
		expect(getSystemForUnit('ft')).toBe('imperial');
		expect(getSystemForUnit('m')).toBe('metric');
	});
});

describe('convertUnits', () => {
	it('converts feet to miles', () => {
		expect(convertUnits(5280, 'ft', 'mi')).toBeCloseTo(1, 10);
	});

	it('converts miles to feet', () => {
		expect(convertUnits(1, 'mi', 'ft')).toBe(5280);
	});

	it('converts meters to kilometers', () => {
		expect(convertUnits(1000, 'm', 'km')).toBeCloseTo(1, 10);
	});

	it('converts kilometers to meters', () => {
		expect(convertUnits(2.5, 'km', 'm')).toBe(2500);
	});

	it('converts feet to yards', () => {
		expect(convertUnits(9, 'ft', 'yd')).toBeCloseTo(3, 10);
	});

	it('returns same value for same-unit conversion', () => {
		expect(convertUnits(42, 'ft', 'ft')).toBe(42);
	});

	it('converts centimeters to meters', () => {
		expect(convertUnits(150, 'cm', 'm')).toBeCloseTo(1.5, 10);
	});
});

describe('detectUnitFromLabel', () => {
	it('detects "feet" as imperial ft', () => {
		const result = detectUnitFromLabel('feet');
		expect(result).toEqual({ system: 'imperial', unit: 'ft' });
	});

	it('detects "Feet" case-insensitively', () => {
		expect(detectUnitFromLabel('Feet')).toEqual({ system: 'imperial', unit: 'ft' });
	});

	it('detects "ft" abbreviation', () => {
		expect(detectUnitFromLabel('ft')).toEqual({ system: 'imperial', unit: 'ft' });
	});

	it('detects "meters"', () => {
		expect(detectUnitFromLabel('meters')).toEqual({ system: 'metric', unit: 'm' });
	});

	it('detects "km"', () => {
		expect(detectUnitFromLabel('km')).toEqual({ system: 'metric', unit: 'km' });
	});

	it('detects "miles"', () => {
		expect(detectUnitFromLabel('miles')).toEqual({ system: 'imperial', unit: 'mi' });
	});

	it('returns null for unknown labels', () => {
		expect(detectUnitFromLabel('hexes')).toBeNull();
		expect(detectUnitFromLabel('squares')).toBeNull();
		expect(detectUnitFromLabel('parsecs')).toBeNull();
	});

	it('handles whitespace', () => {
		expect(detectUnitFromLabel('  feet  ')).toEqual({ system: 'imperial', unit: 'ft' });
	});
});

describe('roundingToBaseUnits', () => {
	it('converts 1 mile to feet', () => {
		expect(roundingToBaseUnits(1, 'mi', 'ft')).toBe(5280);
	});

	it('converts 5 yards to feet', () => {
		expect(roundingToBaseUnits(5, 'yd', 'ft')).toBeCloseTo(15, 10);
	});

	it('converts 1 km to meters', () => {
		expect(roundingToBaseUnits(1, 'km', 'm')).toBe(1000);
	});

	it('returns multiple unchanged when units match', () => {
		expect(roundingToBaseUnits(10, 'ft', 'ft')).toBe(10);
	});

	it('returns multiple unchanged when roundingUnit is undefined', () => {
		expect(roundingToBaseUnits(10, undefined, 'ft')).toBe(10);
	});
});

describe('convertForDisplay', () => {
	describe('no conversion mode', () => {
		it('returns single part in base unit', () => {
			const parts = convertForDisplay(5280, 'ft', 'none');
			expect(parts).toEqual([{ value: 5280, unit: 'ft' }]);
		});
	});

	describe('auto-convert mode', () => {
		it('cascades through multiple units', () => {
			// 6000 ft = 1 mi + 720 ft = 1 mi + 240 yd + 0 ft
			const parts = convertForDisplay(6000, 'ft', 'auto');
			expect(parts[0]).toEqual({ value: 1, unit: 'mi' });
			expect(parts[1]).toEqual({ value: 240, unit: 'yd' });
			// no ft part since remainder is 0
		});

		it('returns exact conversion with no remainder', () => {
			const parts = convertForDisplay(5280, 'ft', 'auto');
			expect(parts).toEqual([{ value: 1, unit: 'mi' }]);
		});

		it('converts to yards when feet >= 1 yard', () => {
			const parts = convertForDisplay(100, 'ft', 'auto');
			expect(parts).toHaveLength(2);
			expect(parts[0]).toEqual({ value: 33, unit: 'yd' });
			expect(parts[1]).toEqual({ value: 1, unit: 'ft' });
		});

		it('stays in base unit when no larger unit qualifies', () => {
			const parts = convertForDisplay(2, 'ft', 'auto');
			expect(parts).toEqual([{ value: 2, unit: 'ft' }]);
		});

		it('auto-converts metric with cascade (cm to km + m + cm)', () => {
			// 539262 cm = 5 km + 392 m + 62 cm
			const parts = convertForDisplay(539262, 'cm', 'auto');
			expect(parts[0]).toEqual({ value: 5, unit: 'km' });
			expect(parts[1]).toEqual({ value: 392, unit: 'm' });
			expect(parts[2]).toEqual({ value: 62, unit: 'cm' });
		});

		it('auto-converts metric (meters to km)', () => {
			const parts = convertForDisplay(1500, 'm', 'auto');
			expect(parts).toHaveLength(2);
			expect(parts[0]).toEqual({ value: 1, unit: 'km' });
			expect(parts[1]).toEqual({ value: 500, unit: 'm' });
		});

		it('handles large values with multi-level cascade', () => {
			// 10000 ft = 1 mi + 1573 yd + 1 ft
			const parts = convertForDisplay(10000, 'ft', 'auto');
			expect(parts[0]).toEqual({ value: 1, unit: 'mi' });
			expect(parts[1].unit).toBe('yd');
			expect(parts[parts.length - 1].unit).toBe('ft');
		});

		it('converts to yards when under 1 mile', () => {
			const parts = convertForDisplay(5279, 'ft', 'auto');
			expect(parts[0].unit).toBe('yd');
			expect(parts[0].value).toBe(1759);
		});

		it('skips excluded units during auto-convert', () => {
			// 100 ft would normally convert to 33 yd, but with yards excluded stays in feet
			const parts = convertForDisplay(100, 'ft', 'auto', undefined, ['yd']);
			expect(parts).toEqual([{ value: 100, unit: 'ft' }]);
		});

		it('skips yards and converts to miles + feet when yards excluded', () => {
			const parts = convertForDisplay(10000, 'ft', 'auto', undefined, ['yd']);
			expect(parts[0]).toEqual({ value: 1, unit: 'mi' });
			expect(parts[1]).toEqual({ value: 4720, unit: 'ft' });
		});

		it('stays in base unit when all larger units excluded', () => {
			const parts = convertForDisplay(10000, 'ft', 'auto', undefined, ['yd', 'mi']);
			expect(parts).toEqual([{ value: 10000, unit: 'ft' }]);
		});
	});

	describe('fixed conversion mode', () => {
		it('converts feet to miles', () => {
			const parts = convertForDisplay(5280, 'ft', 'fixed', 'mi');
			expect(parts).toEqual([{ value: 1, unit: 'mi' }]);
		});

		it('converts partial values', () => {
			const parts = convertForDisplay(2640, 'ft', 'fixed', 'mi');
			expect(parts[0].value).toBeCloseTo(0.5, 10);
			expect(parts[0].unit).toBe('mi');
		});

		it('converts meters to km', () => {
			const parts = convertForDisplay(500, 'm', 'fixed', 'km');
			expect(parts[0].value).toBeCloseTo(0.5, 10);
		});

		it('converts feet to inches', () => {
			const parts = convertForDisplay(2, 'ft', 'fixed', 'in');
			expect(parts[0].value).toBe(24);
			expect(parts[0].unit).toBe('in');
		});
	});
});

describe('formatDisplayParts', () => {
	it('formats single part with label', () => {
		expect(formatDisplayParts([{ value: 5280, unit: 'ft' }], 0)).toBe('5,280 feet');
	});

	it('formats single part with decimals', () => {
		expect(formatDisplayParts([{ value: 1.5, unit: 'mi' }], 1)).toBe('1.5 miles');
	});

	it('formats mixed parts with abbreviations', () => {
		const result = formatDisplayParts(
			[
				{ value: 1, unit: 'mi' },
				{ value: 4720, unit: 'ft' },
			],
			0,
		);
		expect(result).toBe('1 mi 4,720 ft');
	});

	it('formats metric mixed parts', () => {
		const result = formatDisplayParts(
			[
				{ value: 2, unit: 'km' },
				{ value: 500, unit: 'm' },
			],
			0,
		);
		expect(result).toBe('2 km 500 m');
	});

	it('formats three-level cascade', () => {
		const result = formatDisplayParts(
			[
				{ value: 5, unit: 'km' },
				{ value: 392, unit: 'm' },
				{ value: 62, unit: 'cm' },
			],
			0,
		);
		expect(result).toBe('5 km 392 m 62 cm');
	});

	it('formats single part with thousand separators', () => {
		expect(formatDisplayParts([{ value: 1234567, unit: 'm' }], 0)).toBe('1,234,567 meters');
	});
});
