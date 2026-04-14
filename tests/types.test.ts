import { describe, it, expect } from 'vitest';
import {
	DEFAULT_SETTINGS,
	DEFAULT_MAP_CONFIG,
	DEFAULT_MARKER_SCALE,
	DEFAULT_MARKER_TEXT_SCALE,
	MarkerTemplate,
	MapMarker,
	MapState,
	TTRPGMapsSettings,
	DEFAULT_LAYER,
	MARKER_FONTS,
	getMarkerFontDef,
	getMarkerFontStack,
	getAvailableMarkerFonts,
} from '../src/types';

describe('DEFAULT_SETTINGS', () => {
	it('has exactly one Default template', () => {
		expect(DEFAULT_SETTINGS.markerTemplates).toHaveLength(1);
		expect(DEFAULT_SETTINGS.markerTemplates[0].name).toBe('Default');
	});

	it('Default template has correct values per spec', () => {
		const t = DEFAULT_SETTINGS.markerTemplates[0];
		expect(t.note).toBeNull();
		expect(t.description).toBeNull();
		expect(t.direction).toBe('down');
		expect(t.textPlacement).toBe('above');
		expect(t.color).toBe('#ffffff');
		expect(t.icon).toBeNull();
		expect(t.iconColor).toBe('#000000');
	});
});

describe('DEFAULT_MAP_CONFIG', () => {
	it('has correct zoom defaults', () => {
		expect(DEFAULT_MAP_CONFIG.zoomMin).toBe(50);
		expect(DEFAULT_MAP_CONFIG.zoomMax).toBe(200);
		expect(DEFAULT_MAP_CONFIG.zoomStep).toBe(10);
	});

	it('has null height and width by default', () => {
		expect(DEFAULT_MAP_CONFIG.height).toBeNull();
		expect(DEFAULT_MAP_CONFIG.width).toBeNull();
	});
});

describe('Marker template resolution', () => {
	const defaultTemplate: MarkerTemplate = {
		id: 'castle',
		name: 'Castle',
		folderId: null,
		note: null,
		description: null,
		direction: 'down',
		textPlacement: 'above',
		color: '#ff0000',
		icon: 'castle',
		iconColor: '#ffffff',
		iconRotation: 0,
		useBaseMarker: true,
		shape: 'pin',
	};

	it('marker overrides take precedence over template', () => {
		const marker: MapMarker = {
			id: 'test',
			templateId: 'castle',
			x: 100,
			y: 200,
			layerId: null,
			note: 'My Castle',
			alias: null,
			previewNote: null,
			description: null,
			direction: 'left',
			textPlacement: null,
			color: '#00ff00',
			icon: null,
			iconColor: null,
			iconRotation: null,
			useBaseMarker: null,
			shape: null,
			scale: null,
			scaleToZoom: null,
			textScale: null,
			textScaleToZoom: null,
			font: null,
		};

		// Simulate resolution logic (same as MapRenderer.renderMarkers)
		const color = marker.color ?? defaultTemplate.color;
		const direction = marker.direction ?? defaultTemplate.direction;
		const textPlacement = marker.textPlacement ?? defaultTemplate.textPlacement;
		const iconColor = marker.iconColor ?? defaultTemplate.iconColor;
		const note = marker.note ?? defaultTemplate.note;

		expect(color).toBe('#00ff00'); // marker override
		expect(direction).toBe('left'); // marker override
		expect(textPlacement).toBe('above'); // falls through to template
		expect(iconColor).toBe('#ffffff'); // falls through to template
		expect(note).toBe('My Castle'); // marker override
	});

	it('null marker fields fall through to template values', () => {
		const marker: MapMarker = {
			id: 'test',
			templateId: 'castle',
			x: 0,
			y: 0,
			layerId: null,
			note: null,
			alias: null,
			previewNote: null,
			description: null,
			direction: null,
			textPlacement: null,
			color: null,
			icon: null,
			iconColor: null,
			iconRotation: null,
			useBaseMarker: null,
			shape: null,
			scale: null,
			scaleToZoom: null,
			textScale: null,
			textScaleToZoom: null,
			font: null,
		};

		const color = marker.color ?? defaultTemplate.color;
		const direction = marker.direction ?? defaultTemplate.direction;
		const icon = marker.icon ?? defaultTemplate.icon;

		expect(color).toBe('#ff0000');
		expect(direction).toBe('down');
		expect(icon).toBe('castle');
	});
});

describe('MapState rounding fields', () => {
	it('defaults optional fields to undefined', () => {
		const state: MapState = {
			mapId: 'test',
			markers: [],
			layers: [{ ...DEFAULT_LAYER }],
			distanceScale: null,
		};
		expect(state.roundingMode).toBeUndefined();
		expect(state.roundingMultiple).toBeUndefined();
		expect(state.markerScale).toBeUndefined();
		expect(state.scaleMarkersToZoom).toBeUndefined();
		expect(state.markerTextScale).toBeUndefined();
		expect(state.scaleMarkerTextToZoom).toBeUndefined();
	});

	it('accepts valid rounding configuration', () => {
		const state: MapState = {
			mapId: 'test',
			markers: [],
			layers: [{ ...DEFAULT_LAYER }],
			distanceScale: null,
			roundingMode: 'up',
			roundingMultiple: 5,
		};
		expect(state.roundingMode).toBe('up');
		expect(state.roundingMultiple).toBe(5);
	});

	it('accepts markerScale override', () => {
		const state: MapState = {
			mapId: 'test',
			markers: [],
			layers: [{ ...DEFAULT_LAYER }],
			distanceScale: null,
			markerScale: 0.75,
		};
		expect(state.markerScale).toBe(0.75);
	});
});

describe('DEFAULT_MARKER_SCALE', () => {
	it('equals 1.0', () => {
		expect(DEFAULT_MARKER_SCALE).toBe(1.0);
	});
});

describe('DEFAULT_MARKER_TEXT_SCALE', () => {
	it('equals 1.0', () => {
		expect(DEFAULT_MARKER_TEXT_SCALE).toBe(1.0);
	});
});

describe('TTRPGMapsSettings marker scale', () => {
	it('defaultMarkerScale is optional and undefined in DEFAULT_SETTINGS', () => {
		expect(DEFAULT_SETTINGS.defaultMarkerScale).toBeUndefined();
	});

	it('accepts a defaultMarkerScale value', () => {
		const settings: TTRPGMapsSettings = {
			...DEFAULT_SETTINGS,
			defaultMarkerScale: 0.8,
		};
		expect(settings.defaultMarkerScale).toBe(0.8);
	});

	it('defaultScaleMarkersToZoom is optional and undefined in DEFAULT_SETTINGS', () => {
		expect(DEFAULT_SETTINGS.defaultScaleMarkersToZoom).toBeUndefined();
	});

	it('accepts a defaultScaleMarkersToZoom value', () => {
		const settings: TTRPGMapsSettings = {
			...DEFAULT_SETTINGS,
			defaultScaleMarkersToZoom: false,
		};
		expect(settings.defaultScaleMarkersToZoom).toBe(false);
	});
});

describe('MapMarker scale fields', () => {
	it('accepts per-marker scale and scaleToZoom', () => {
		const marker: MapMarker = {
			id: 'test',
			templateId: 'default',
			x: 0,
			y: 0,
			layerId: null,
			note: null,
			alias: null,
			previewNote: null,
			description: null,
			direction: null,
			textPlacement: null,
			color: null,
			icon: null,
			iconColor: null,
			iconRotation: null,
			useBaseMarker: null,
			shape: null,
			scale: 0.5,
			scaleToZoom: false,
			textScale: null,
			textScaleToZoom: null,
			font: null,
		};
		expect(marker.scale).toBe(0.5);
		expect(marker.scaleToZoom).toBe(false);
	});

	it('null values mean inherit from map/global', () => {
		const marker: MapMarker = {
			id: 'test',
			templateId: 'default',
			x: 0,
			y: 0,
			layerId: null,
			note: null,
			alias: null,
			previewNote: null,
			description: null,
			direction: null,
			textPlacement: null,
			color: null,
			icon: null,
			iconColor: null,
			iconRotation: null,
			useBaseMarker: null,
			shape: null,
			scale: null,
			scaleToZoom: null,
			textScale: null,
			textScaleToZoom: null,
			font: null,
		};
		expect(marker.scale).toBeNull();
		expect(marker.scaleToZoom).toBeNull();
	});
});

describe('MapState scaleMarkersToZoom', () => {
	it('accepts per-map scaleMarkersToZoom', () => {
		const state: MapState = {
			mapId: 'test',
			markers: [],
			layers: [{ ...DEFAULT_LAYER }],
			distanceScale: null,
			scaleMarkersToZoom: false,
		};
		expect(state.scaleMarkersToZoom).toBe(false);
	});
});

describe('MapState text scale fields', () => {
	it('accepts per-map text scale overrides', () => {
		const state: MapState = {
			mapId: 'test',
			markers: [],
			layers: [{ ...DEFAULT_LAYER }],
			distanceScale: null,
			markerTextScale: 1.5,
			scaleMarkerTextToZoom: false,
		};
		expect(state.markerTextScale).toBe(1.5);
		expect(state.scaleMarkerTextToZoom).toBe(false);
	});
});

describe('TTRPGMapsSettings text scale', () => {
	it('defaultMarkerTextScale is optional and undefined in DEFAULT_SETTINGS', () => {
		expect(DEFAULT_SETTINGS.defaultMarkerTextScale).toBeUndefined();
	});

	it('defaultScaleMarkerTextToZoom is optional and undefined in DEFAULT_SETTINGS', () => {
		expect(DEFAULT_SETTINGS.defaultScaleMarkerTextToZoom).toBeUndefined();
	});

	it('accepts text scale settings', () => {
		const settings: TTRPGMapsSettings = {
			...DEFAULT_SETTINGS,
			defaultMarkerTextScale: 0.8,
			defaultScaleMarkerTextToZoom: false,
		};
		expect(settings.defaultMarkerTextScale).toBe(0.8);
		expect(settings.defaultScaleMarkerTextToZoom).toBe(false);
	});
});

describe('MapMarker text scale fields', () => {
	it('accepts per-marker textScale and textScaleToZoom', () => {
		const marker: MapMarker = {
			id: 'test',
			templateId: 'default',
			x: 0,
			y: 0,
			layerId: null,
			note: null,
			alias: null,
			previewNote: null,
			description: null,
			direction: null,
			textPlacement: null,
			color: null,
			icon: null,
			iconColor: null,
			iconRotation: null,
			useBaseMarker: null,
			shape: null,
			scale: null,
			scaleToZoom: null,
			textScale: 0.75,
			textScaleToZoom: false,
			font: null,
		};
		expect(marker.textScale).toBe(0.75);
		expect(marker.textScaleToZoom).toBe(false);
	});

	it('null text scale values mean inherit', () => {
		const marker: MapMarker = {
			id: 'test',
			templateId: 'default',
			x: 0,
			y: 0,
			layerId: null,
			note: null,
			alias: null,
			previewNote: null,
			description: null,
			direction: null,
			textPlacement: null,
			color: null,
			icon: null,
			iconColor: null,
			iconRotation: null,
			useBaseMarker: null,
			shape: null,
			scale: null,
			scaleToZoom: null,
			textScale: null,
			textScaleToZoom: null,
			font: null,
		};
		expect(marker.textScale).toBeNull();
		expect(marker.textScaleToZoom).toBeNull();
	});
});

describe('MapMarker font field', () => {
	it('accepts a font string value', () => {
		const marker: MapMarker = {
			id: 'test',
			templateId: 'default',
			x: 0,
			y: 0,
			layerId: null,
			note: null,
			alias: null,
			previewNote: null,
			description: null,
			direction: null,
			textPlacement: null,
			color: null,
			icon: null,
			iconColor: null,
			iconRotation: null,
			useBaseMarker: null,
			shape: null,
			scale: null,
			scaleToZoom: null,
			textScale: null,
			textScaleToZoom: null,
			font: 'serif',
		};
		expect(marker.font).toBe('serif');
	});

	it('null font means inherit from map/global', () => {
		const marker: MapMarker = {
			id: 'test',
			templateId: 'default',
			x: 0,
			y: 0,
			layerId: null,
			note: null,
			alias: null,
			previewNote: null,
			description: null,
			direction: null,
			textPlacement: null,
			color: null,
			icon: null,
			iconColor: null,
			iconRotation: null,
			useBaseMarker: null,
			shape: null,
			scale: null,
			scaleToZoom: null,
			textScale: null,
			textScaleToZoom: null,
			font: null,
		};
		expect(marker.font).toBeNull();
	});
});

describe('MARKER_FONTS', () => {
	it('is a non-empty array', () => {
		expect(MARKER_FONTS.length).toBeGreaterThan(0);
	});

	it('each entry has id, label, stack, and testFont fields', () => {
		for (const font of MARKER_FONTS) {
			expect(typeof font.id).toBe('string');
			expect(typeof font.label).toBe('string');
			expect(typeof font.stack).toBe('string');
			expect(font.testFont === null || typeof font.testFont === 'string').toBe(true);
		}
	});

	it('contains generic stacks with null testFont', () => {
		const genericFonts = MARKER_FONTS.filter((f) => f.testFont === null);
		expect(genericFonts.length).toBeGreaterThanOrEqual(1);
	});

	it('has unique IDs', () => {
		const ids = MARKER_FONTS.map((f) => f.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('getMarkerFontDef', () => {
	it('returns a font definition for a known ID', () => {
		const def = getMarkerFontDef('serif');
		expect(def).toBeDefined();
		expect(def!.id).toBe('serif');
		expect(def!.label).toBe('Serif');
	});

	it('returns undefined for an unknown ID', () => {
		expect(getMarkerFontDef('nonexistent-font')).toBeUndefined();
	});
});

describe('getMarkerFontStack', () => {
	it('returns the CSS font stack for a known font ID', () => {
		const stack = getMarkerFontStack('serif');
		expect(stack).not.toBeNull();
		expect(stack).toContain('serif');
	});

	it('returns null for the "default" ID', () => {
		expect(getMarkerFontStack('default')).toBeNull();
	});

	it('returns null for an unknown font ID', () => {
		expect(getMarkerFontStack('nonexistent-font')).toBeNull();
	});
});

describe('getAvailableMarkerFonts', () => {
	it('returns an array of font definitions when document.fonts is available', () => {
		// Polyfill document.fonts for jsdom (not natively supported)
		const original = (document as any).fonts;
		(document as any).fonts = { check: () => true };
		try {
			const fonts = getAvailableMarkerFonts();
			expect(Array.isArray(fonts)).toBe(true);
			expect(fonts.length).toBeGreaterThan(0);
		} finally {
			(document as any).fonts = original;
		}
	});

	it('always includes generic stacks (testFont === null)', () => {
		const original = (document as any).fonts;
		(document as any).fonts = { check: () => false };
		try {
			const fonts = getAvailableMarkerFonts();
			const genericFonts = MARKER_FONTS.filter((f) => f.testFont === null);
			for (const generic of genericFonts) {
				expect(fonts.some((f) => f.id === generic.id)).toBe(true);
			}
		} finally {
			(document as any).fonts = original;
		}
	});

	it('excludes platform-specific fonts when they are not available', () => {
		const original = (document as any).fonts;
		(document as any).fonts = { check: () => false };
		try {
			const fonts = getAvailableMarkerFonts();
			const platformFonts = MARKER_FONTS.filter((f) => f.testFont !== null);
			for (const pf of platformFonts) {
				expect(fonts.some((f) => f.id === pf.id)).toBe(false);
			}
		} finally {
			(document as any).fonts = original;
		}
	});
});

describe('MapState view state persistence', () => {
	it('accepts saved zoom and pan values', () => {
		const state: MapState = {
			mapId: 'test',
			markers: [],
			layers: [{ ...DEFAULT_LAYER }],
			distanceScale: null,
			savedZoom: 150,
			savedPanX: 200,
			savedPanY: -100,
		};
		expect(state.savedZoom).toBe(150);
		expect(state.savedPanX).toBe(200);
		expect(state.savedPanY).toBe(-100);
	});

	it('defaults view state fields to undefined', () => {
		const state: MapState = {
			mapId: 'test',
			markers: [],
			layers: [{ ...DEFAULT_LAYER }],
			distanceScale: null,
		};
		expect(state.savedZoom).toBeUndefined();
		expect(state.savedPanX).toBeUndefined();
		expect(state.savedPanY).toBeUndefined();
	});
});

describe('MapState markerFont', () => {
	it('accepts per-map markerFont', () => {
		const state: MapState = {
			mapId: 'test',
			markers: [],
			layers: [{ ...DEFAULT_LAYER }],
			distanceScale: null,
			markerFont: 'serif',
		};
		expect(state.markerFont).toBe('serif');
	});

	it('defaults to undefined when not set', () => {
		const state: MapState = {
			mapId: 'test',
			markers: [],
			layers: [{ ...DEFAULT_LAYER }],
			distanceScale: null,
		};
		expect(state.markerFont).toBeUndefined();
	});
});

describe('TTRPGMapsSettings defaultMarkerFont', () => {
	it('is optional and undefined in DEFAULT_SETTINGS', () => {
		expect(DEFAULT_SETTINGS.defaultMarkerFont).toBeUndefined();
	});

	it('accepts a defaultMarkerFont value', () => {
		const settings: TTRPGMapsSettings = {
			...DEFAULT_SETTINGS,
			defaultMarkerFont: 'monospace',
		};
		expect(settings.defaultMarkerFont).toBe('monospace');
	});
});
