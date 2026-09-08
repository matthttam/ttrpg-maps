import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stand in for the real edit modal, which would build a whole settings UI.
// Opening it immediately "saves" the marker placeMarker built, unchanged --
// the same path a user takes by hitting Save without editing anything.
vi.mock('../../src/modals/MarkerEditModal', () => ({
	MarkerEditModal: class {
		private marker: unknown;
		private onSubmit: (marker: unknown) => void;
		constructor(
			_app: unknown,
			_plugin: unknown,
			marker: unknown,
			_layers: unknown,
			onSubmit: (marker: unknown) => void,
		) {
			this.marker = marker;
			this.onSubmit = onSubmit;
		}
		open(): void {
			this.onSubmit(this.marker);
		}
	},
}));

import { MapRenderer } from '../../src/map/MapRenderer';
import { MapConfig, MapState, MapMarker, MarkerTemplate, DEFAULT_SETTINGS, DEFAULT_LAYER } from '../../src/types';
import { App } from 'obsidian';

function createTemplate(overrides: Partial<MarkerTemplate> = {}): MarkerTemplate {
	return {
		id: 'tpl',
		name: 'Test template',
		folderId: null,
		note: null,
		description: null,
		direction: 'down',
		textPlacement: 'above',
		color: '#ffffff',
		transparency: 0,
		icon: null,
		iconColor: '#000000',
		iconRotation: 0,
		useBaseMarker: true,
		shape: 'pin',
		...overrides,
	};
}

function createMockPlugin(templates: MarkerTemplate[]) {
	const state: MapState = {
		mapId: 'test-map',
		markers: [],
		layers: [{ ...DEFAULT_LAYER }],
		distanceScale: null,
	};

	const app = new App();
	const fakeFile = { path: 'maps/test.png', basename: 'test', extension: 'png' };
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	app.vault.getFileByPath = () => fakeFile as any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	app.vault.getResourcePath = (file: any) => `app://local/${file.path}`;

	return {
		app,
		settings: { ...DEFAULT_SETTINGS, markerTemplates: templates },
		dataManager: {
			loadMapState: vi.fn().mockResolvedValue(state),
			saveMapState: vi.fn(),
			loadSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
			saveSettings: vi.fn(),
		},
		manifest: { id: 'ttrpg-maps' },
		onMapRefresh: vi.fn(),
		offMapRefresh: vi.fn(),
		triggerMapRefresh: vi.fn(),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

function createConfig(): MapConfig {
	return {
		id: 'test-map',
		image: 'maps/test.png',
		height: null,
		width: null,
		zoomMin: 50,
		zoomMax: 200,
		zoomStep: 10,
	};
}

/** Place a marker from `templateId` and return the marker that landed in state. */
async function placeFrom(templates: MarkerTemplate[], templateId: string): Promise<MapMarker> {
	const container = document.createElement('div');
	const plugin = createMockPlugin(templates);
	const renderer = new MapRenderer(container, plugin, createConfig(), 'test.md', null);
	await renderer.onload();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(renderer as any).placeMarker(10, 20, templateId);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const markers: MapMarker[] = (renderer as any).state.markers;
	expect(markers).toHaveLength(1);
	return markers[0];
}

describe('MapRenderer placeMarker template inheritance', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('places the marker at the given coordinates', async () => {
		const marker = await placeFrom([createTemplate()], 'tpl');

		expect(marker.x).toBe(10);
		expect(marker.y).toBe(20);
		expect(marker.templateId).toBe('tpl');
	});

	// Regression: transparency was the one templated field placeMarker forgot to
	// copy, so a template set to 60% produced fully opaque new markers.
	it('inherits pin transparency from the template', async () => {
		const marker = await placeFrom([createTemplate({ transparency: 60 })], 'tpl');

		expect(marker.transparency).toBe(60);
	});

	it('reads a template saved before transparency existed as fully opaque', async () => {
		const legacy = createTemplate();
		delete (legacy as Partial<MarkerTemplate>).transparency;

		const marker = await placeFrom([legacy], 'tpl');

		expect(marker.transparency).toBe(0);
	});

	it('falls back to opaque when the template is missing', async () => {
		const marker = await placeFrom([createTemplate()], 'no-such-template');

		expect(marker.transparency).toBe(0);
	});

	// Guards the next optional field someone adds to MarkerTemplate: every
	// templated field must be copied onto a newly placed marker.
	it('inherits every templated appearance field', async () => {
		const template = createTemplate({
			direction: 'left',
			textPlacement: 'right',
			color: '#123456',
			transparency: 25,
			icon: 'star',
			iconColor: '#abcdef',
			iconRotation: 90,
			useBaseMarker: false,
			shape: 'circle',
		});

		const marker = await placeFrom([template], 'tpl');

		expect(marker.direction).toBe('left');
		expect(marker.textPlacement).toBe('right');
		expect(marker.color).toBe('#123456');
		expect(marker.transparency).toBe(25);
		expect(marker.icon).toBe('star');
		expect(marker.iconColor).toBe('#abcdef');
		expect(marker.iconRotation).toBe(90);
		expect(marker.useBaseMarker).toBe(false);
		expect(marker.shape).toBe('circle');
	});
});
