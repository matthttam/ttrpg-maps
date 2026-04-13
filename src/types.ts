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

/** Available font families for marker labels */
export type MarkerFont = 'default' | 'serif' | 'monospace' | 'handwritten' | 'fantasy' | 'system';

/** Font family CSS stacks keyed by MarkerFont */
export const MARKER_FONT_STACKS: Record<Exclude<MarkerFont, 'default'>, string> = {
	serif: "Georgia, 'Times New Roman', serif",
	monospace: "var(--font-monospace), 'Courier New', monospace",
	handwritten: "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive",
	fantasy: "'Copperplate', 'Papyrus', fantasy",
	system: 'system-ui, -apple-system, sans-serif',
};

/** Display labels for each font option */
export const MARKER_FONT_LABELS: Record<MarkerFont, string> = {
	default: 'Default',
	serif: 'Serif',
	monospace: 'Monospace',
	handwritten: 'Handwritten',
	fantasy: 'Fantasy',
	system: 'System',
};

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
