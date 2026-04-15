/** Direction a marker icon points */
export type MarkerDirection = 'up' | 'down' | 'left' | 'right';

/** Where text is placed relative to the marker icon */
export type TextPlacement = 'above' | 'below' | 'left' | 'right';

/** A visibility layer that controls marker show/hide based on zoom level */
export interface MarkerLayer {
	id: string;
	name: string;
	zoomMin: number | null; // null = no lower bound (treat as 0)
	zoomMax: number | null; // null = no upper bound (treat as Infinity)
}

export const DEFAULT_LAYER_ID = 'default';

export const DEFAULT_LAYER: MarkerLayer = {
	id: 'default',
	name: 'Default Layer',
	zoomMin: null,
	zoomMax: null,
};

/** A folder that groups marker templates in the settings UI and context menu */
export interface TemplateFolder {
	id: string;
	name: string;
}

/** A reusable preset for marker styling */
export interface MarkerTemplate {
	id: string;
	name: string;
	folderId: string | null;
	note: string | null;
	description: string | null;
	direction: MarkerDirection;
	textPlacement: TextPlacement;
	color: string;
	icon: string | null;
	iconColor: string;
	iconRotation: number;
	useBaseMarker: boolean;
	shape: 'pin' | 'circle' | 'hotspot';
}

/** A single marker placed on a map */
export interface MapMarker {
	id: string;
	templateId: string;
	x: number;
	y: number;
	layerId: string | null; // null = default layer
	/** Overrides from template. Only set fields override. */
	note: string | null;
	alias: string | null;
	previewNote: string | null;
	description: string | null;
	direction: MarkerDirection | null;
	textPlacement: TextPlacement | null;
	color: string | null;
	icon: string | null;
	iconColor: string | null;
	iconRotation: number | null;
	useBaseMarker: boolean | null;
	shape: 'pin' | 'circle' | 'hotspot' | null;
	scale: number | null;
	scaleToZoom: boolean | null;
	textScale: number | null;
	textScaleToZoom: boolean | null;
	font: MarkerFont | null;
}

/** Font ID stored in settings/state. Always a string key from MARKER_FONTS. */
export type MarkerFont =
	| 'default'
	| 'serif'
	| 'monospace'
	| 'system'
	| 'palatino'
	| 'garamond'
	| 'humanist'
	| 'trebuchet'
	| 'impact'
	| 'handwritten'
	| 'fantasy'
	| 'typewriter';

/** Definition of a selectable font */
export interface MarkerFontDef {
	id: string;
	label: string;
	stack: string;
	/** Primary font name to test for availability (null = always available) */
	testFont: string | null;
}

/** All available marker label fonts, in display order */
export const MARKER_FONTS: MarkerFontDef[] = [
	// Generic stacks (always available)
	{ id: 'serif', label: 'Serif', stack: "Georgia, 'Times New Roman', serif", testFont: null },
	{ id: 'monospace', label: 'Monospace', stack: "var(--font-monospace), 'Courier New', monospace", testFont: null },
	{ id: 'system', label: 'System', stack: 'system-ui, -apple-system, sans-serif', testFont: null },

	// Specific fonts (availability varies by platform)
	{
		id: 'palatino',
		label: 'Palatino',
		stack: "'Palatino Linotype', Palatino, 'Book Antiqua', serif",
		testFont: 'Palatino Linotype',
	},
	{
		id: 'garamond',
		label: 'Garamond',
		stack: "Garamond, 'EB Garamond', 'Times New Roman', serif",
		testFont: 'Garamond',
	},
	{ id: 'humanist', label: 'Humanist', stack: "'Gill Sans', 'Segoe UI', Tahoma, sans-serif", testFont: 'Gill Sans' },
	{
		id: 'trebuchet',
		label: 'Trebuchet',
		stack: "'Trebuchet MS', 'Lucida Grande', sans-serif",
		testFont: 'Trebuchet MS',
	},
	{ id: 'impact', label: 'Impact', stack: "Impact, 'Arial Black', sans-serif", testFont: 'Impact' },
	{
		id: 'handwritten',
		label: 'Handwritten',
		stack: "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive",
		testFont: 'Segoe Script',
	},
	{ id: 'fantasy', label: 'Fantasy', stack: "'Copperplate', 'Papyrus', fantasy", testFont: 'Copperplate' },
	{
		id: 'typewriter',
		label: 'Typewriter',
		stack: "'Courier New', 'Lucida Console', monospace",
		testFont: 'Courier New',
	},
];

/** Lookup a font definition by ID */
export function getMarkerFontDef(id: string): MarkerFontDef | undefined {
	return MARKER_FONTS.find((f) => f.id === id);
}

/** Get the CSS font-family stack for a font ID, or null for 'default' */
export function getMarkerFontStack(id: string): string | null {
	if (id === 'default') return null;
	return getMarkerFontDef(id)?.stack ?? null;
}

/** Test whether a font is available on the current system */
function isFontAvailable(name: string): boolean {
	if (typeof document === 'undefined') return true;
	return document.fonts.check(`16px "${name}"`);
}

/** Get only the fonts available on the current system (always includes generic stacks) */
export function getAvailableMarkerFonts(): MarkerFontDef[] {
	return MARKER_FONTS.filter((f) => f.testFont === null || isFontAvailable(f.testFont));
}

/** How measured distances should be rounded */
export type RoundingMode = 'none' | 'up' | 'down' | 'closest';

/** Default marker scale multiplier (1.0 = 100%) */
export const DEFAULT_MARKER_SCALE = 1.0;

/** Default marker text scale multiplier (1.0 = 100%) */
export const DEFAULT_MARKER_TEXT_SCALE = 1.0;

/** A point used in distance scale or measurement */
export interface MapPoint {
	x: number;
	y: number;
}

/** Calibration data for distance measurement */
export interface DistanceScale {
	pointA: MapPoint;
	pointB: MapPoint;
	units: number;
	unitLabel: string;
}

/** Static config parsed from the ttrpgmap code block (YAML) */
export interface MapConfig {
	id: string;
	image: string;
	height: string | null;
	width: string | null;
	zoomMin: number;
	zoomMax: number;
	zoomStep: number;
}

/** Mutable per-map state stored in .ttrpgmap/ sidecar file */
export interface MapState {
	mapId: string;
	markers: MapMarker[];
	layers: MarkerLayer[];
	distanceScale: DistanceScale | null;
	roundingMode?: RoundingMode;
	roundingMultiple?: number;
	showRawDistance?: boolean;
	distanceDecimals?: number;
	markerScale?: number;
	scaleMarkersToZoom?: boolean;
	markerTextScale?: number;
	scaleMarkerTextToZoom?: boolean;
	markerFont?: MarkerFont;
	controlOpacity?: number;
	openLinksInNewTab?: boolean;
	showHoverPreview?: boolean;
	zoomLocked?: boolean;
	panLocked?: boolean;
	markersLocked?: boolean;
	showMeasurementTools?: boolean;
	showZoomControls?: boolean;
	showMarkerList?: boolean;
	showLayerList?: boolean;
	showMapSettings?: boolean;
	/** Persisted view state (restored on re-render) */
	savedZoom?: number;
	savedPanX?: number;
	savedPanY?: number;
	/** Last known image path (set on render for identification) */
	lastImagePath?: string;
	/** Last known source file path (set on render for identification) */
	lastSourcePath?: string;
}

/** Plugin-wide settings stored in data.json */
export interface TTRPGMapsSettings {
	markerTemplates: MarkerTemplate[];
	templateFolders: TemplateFolder[];
	defaultMarkerScale?: number;
	defaultScaleMarkersToZoom?: boolean;
	defaultMarkerTextScale?: number;
	defaultScaleMarkerTextToZoom?: boolean;
	defaultMarkerFont?: MarkerFont;
	defaultControlOpacity?: number;
	openLinksInNewTab?: boolean;
	showHoverPreview?: boolean;
	showMeasurementTools?: boolean;
	showZoomControls?: boolean;
	showMarkerList?: boolean;
	showLayerList?: boolean;
	showMapSettings?: boolean;
}

/** IDs of predefined templates that cannot be renamed or deleted */
export const PREDEFINED_TEMPLATE_IDS = new Set(['default']);

/** Default plugin settings */
export const DEFAULT_SETTINGS: TTRPGMapsSettings = {
	markerTemplates: [
		{
			id: 'default',
			name: 'Default',
			folderId: null,
			note: null,
			description: null,
			direction: 'down',
			textPlacement: 'above',
			color: '#ffffff',
			icon: null,
			iconColor: '#000000',
			iconRotation: 0,
			useBaseMarker: true,
			shape: 'pin',
		},
	],
	templateFolders: [],
};

/** Manifest stored inside an exported map ZIP */
export interface MapExportManifest {
	pluginVersion: string;
	config: MapConfig;
	state: MapState;
	imageFilename: string;
}

/** Default values for map config when not specified */
export const DEFAULT_MAP_CONFIG: Omit<MapConfig, 'id' | 'image'> = {
	height: null,
	width: null,
	zoomMin: 50,
	zoomMax: 200,
	zoomStep: 10,
};
