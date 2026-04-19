/** Measurement system for distance calibration */
export type UnitSystem = 'imperial' | 'metric' | 'custom';

/** Imperial unit identifiers, ordered smallest to largest */
export type ImperialUnit = 'in' | 'ft' | 'yd' | 'mi';

/** Metric unit identifiers, ordered smallest to largest */
export type MetricUnit = 'mm' | 'cm' | 'm' | 'km';

/** Any structured measurement unit */
export type MeasurementUnit = ImperialUnit | MetricUnit;

/** How to display converted distances */
export type ConversionMode = 'none' | 'auto' | 'fixed';

/** Definition of a single unit within a measurement system */
export interface UnitDef {
	id: MeasurementUnit;
	label: string;
	abbr: string;
	/** Factor to convert FROM this unit TO the system's smallest unit */
	toBase: number;
}

/** A piece of a formatted distance (e.g., "1 mi" + "4720 ft") */
export interface DisplayPart {
	value: number;
	unit: MeasurementUnit;
}

// ── Unit tables (ordered smallest to largest) ──

const IMPERIAL_UNITS: UnitDef[] = [
	{ id: 'in', label: 'inches', abbr: 'in', toBase: 1 },
	{ id: 'ft', label: 'feet', abbr: 'ft', toBase: 12 },
	{ id: 'yd', label: 'yards', abbr: 'yd', toBase: 36 },
	{ id: 'mi', label: 'miles', abbr: 'mi', toBase: 63360 },
];

const METRIC_UNITS: UnitDef[] = [
	{ id: 'mm', label: 'millimeters', abbr: 'mm', toBase: 1 },
	{ id: 'cm', label: 'centimeters', abbr: 'cm', toBase: 10 },
	{ id: 'm', label: 'meters', abbr: 'm', toBase: 1000 },
	{ id: 'km', label: 'kilometers', abbr: 'km', toBase: 1000000 },
];

const UNIT_MAP = new Map<string, UnitDef>();
for (const u of [...IMPERIAL_UNITS, ...METRIC_UNITS]) UNIT_MAP.set(u.id, u);

/** Case-insensitive alias map for auto-detecting unit system from legacy unitLabel strings */
const LABEL_ALIASES: Record<string, { system: UnitSystem; unit: MeasurementUnit }> = {
	// Imperial
	inches: { system: 'imperial', unit: 'in' },
	inch: { system: 'imperial', unit: 'in' },
	in: { system: 'imperial', unit: 'in' },
	'"': { system: 'imperial', unit: 'in' },
	feet: { system: 'imperial', unit: 'ft' },
	foot: { system: 'imperial', unit: 'ft' },
	ft: { system: 'imperial', unit: 'ft' },
	"'": { system: 'imperial', unit: 'ft' },
	yards: { system: 'imperial', unit: 'yd' },
	yard: { system: 'imperial', unit: 'yd' },
	yd: { system: 'imperial', unit: 'yd' },
	miles: { system: 'imperial', unit: 'mi' },
	mile: { system: 'imperial', unit: 'mi' },
	mi: { system: 'imperial', unit: 'mi' },
	// Metric
	millimeters: { system: 'metric', unit: 'mm' },
	millimeter: { system: 'metric', unit: 'mm' },
	mm: { system: 'metric', unit: 'mm' },
	centimeters: { system: 'metric', unit: 'cm' },
	centimeter: { system: 'metric', unit: 'cm' },
	cm: { system: 'metric', unit: 'cm' },
	meters: { system: 'metric', unit: 'm' },
	meter: { system: 'metric', unit: 'm' },
	m: { system: 'metric', unit: 'm' },
	kilometres: { system: 'metric', unit: 'km' },
	kilometers: { system: 'metric', unit: 'km' },
	kilometre: { system: 'metric', unit: 'km' },
	kilometer: { system: 'metric', unit: 'km' },
	km: { system: 'metric', unit: 'km' },
};

// ── Lookup functions ──

/** Get all unit definitions for a system, ordered smallest to largest. Returns [] for custom. */
export function getUnitsForSystem(system: UnitSystem): UnitDef[] {
	if (system === 'imperial') return IMPERIAL_UNITS;
	if (system === 'metric') return METRIC_UNITS;
	return [];
}

/** Get the definition for a specific unit */
export function getUnitDef(unit: MeasurementUnit): UnitDef {
	return UNIT_MAP.get(unit)!;
}

/** Get the abbreviation for a unit (e.g., "ft") */
export function getUnitAbbr(unit: MeasurementUnit): string {
	return getUnitDef(unit).abbr;
}

/** Get the display label for a unit (e.g., "feet") */
export function getUnitLabel(unit: MeasurementUnit): string {
	return getUnitDef(unit).label;
}

/** Get the system a unit belongs to */
export function getSystemForUnit(unit: MeasurementUnit): UnitSystem {
	if (IMPERIAL_UNITS.some((u) => u.id === unit)) return 'imperial';
	return 'metric';
}

// ── Conversion functions ──

/** Convert a value between two units in the same system */
export function convertUnits(value: number, from: MeasurementUnit, to: MeasurementUnit): number {
	if (from === to) return value;
	const fromDef = getUnitDef(from);
	const toDef = getUnitDef(to);
	return (value * fromDef.toBase) / toDef.toBase;
}

/** Try to detect unit system and unit from a free-text label (case-insensitive) */
export function detectUnitFromLabel(label: string): { system: UnitSystem; unit: MeasurementUnit } | null {
	const key = label.trim().toLowerCase();
	return LABEL_ALIASES[key] ?? null;
}

/**
 * Convert a rounding specification (e.g., "5 miles") to the calibration base unit.
 * Returns the multiple unchanged if roundingUnit is undefined or matches baseUnit.
 */
export function roundingToBaseUnits(
	multiple: number,
	roundingUnit: MeasurementUnit | undefined,
	baseUnit: MeasurementUnit,
): number {
	if (!roundingUnit || roundingUnit === baseUnit) return multiple;
	return multiple * convertUnits(1, roundingUnit, baseUnit);
}

// ── Display conversion ──

/**
 * Convert a value in the calibration base unit to display parts.
 *
 * - 'none': single part in the base unit
 * - 'auto': largest unit where value >= 1, plus remainder in base unit
 * - 'fixed': single part in the specified target unit
 */
export function convertForDisplay(
	value: number,
	baseUnit: MeasurementUnit,
	mode: ConversionMode,
	fixedUnit?: MeasurementUnit,
	excludedUnits?: MeasurementUnit[],
): DisplayPart[] {
	if (mode === 'none') {
		return [{ value, unit: baseUnit }];
	}

	if (mode === 'fixed' && fixedUnit) {
		return [{ value: convertUnits(value, baseUnit, fixedUnit), unit: fixedUnit }];
	}

	// Auto-convert: cascade through enabled units from largest to smallest
	const system = getSystemForUnit(baseUnit);
	const allUnits = getUnitsForSystem(system);
	const baseIdx = allUnits.findIndex((u) => u.id === baseUnit);
	const excluded = new Set(excludedUnits);

	// Build list of enabled units from largest to base
	const enabledUnits = allUnits
		.slice(baseIdx)
		.filter((u) => !excluded.has(u.id))
		.reverse(); // largest first

	if (enabledUnits.length <= 1) {
		return [{ value, unit: baseUnit }];
	}

	const parts: DisplayPart[] = [];
	let remainingInBase = value;

	for (const u of enabledUnits) {
		if (u.id === baseUnit) {
			// Last unit: take whatever is left
			const leftover = Math.round(remainingInBase);
			if (leftover > 0 || parts.length === 0) {
				parts.push({ value: leftover, unit: baseUnit });
			}
			break;
		}
		const converted = convertUnits(remainingInBase, baseUnit, u.id);
		if (converted >= 1) {
			const wholeCount = Math.floor(converted);
			parts.push({ value: wholeCount, unit: u.id });
			remainingInBase -= convertUnits(wholeCount, u.id, baseUnit);
		}
	}

	return parts.length > 0 ? parts : [{ value, unit: baseUnit }];
}

// ── Formatting ──

/** Format a number with a given number of decimal places and thousand separators */
function formatNum(value: number, decimals: number): string {
	const fixed = value.toFixed(decimals);
	const [intPart, decPart] = fixed.split('.');
	const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return decPart ? `${withCommas}.${decPart}` : withCommas;
}

/**
 * Format display parts into a human-readable distance string.
 *
 * Single part: "5,280 feet" (full label)
 * Mixed parts: "1 mi 4,720 ft" (abbreviations for compactness)
 */
export function formatDisplayParts(parts: DisplayPart[], decimals: number): string {
	if (parts.length === 1) {
		return `${formatNum(parts[0].value, decimals)} ${getUnitLabel(parts[0].unit)}`;
	}
	// Mixed display: abbreviations, all parts are whole numbers
	return parts.map((p) => `${formatNum(p.value, 0)} ${getUnitAbbr(p.unit)}`).join(' ');
}
