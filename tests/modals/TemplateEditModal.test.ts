import { describe, it, expect, vi } from 'vitest';
import { App } from 'obsidian';
import { TemplateEditModal } from '../../src/modals/TemplateEditModal';
import { MapMarker, MapState, MarkerTemplate, DEFAULT_LAYER, DEFAULT_SETTINGS } from '../../src/types';

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

function createModal(template: MarkerTemplate) {
	const plugin = {
		settings: { ...DEFAULT_SETTINGS, markerTemplates: [template] },
		dataManager: { saveSettings: vi.fn() },
		triggerMapRefresh: vi.fn(),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;

	const modal = new TemplateEditModal(new App(), plugin, template, vi.fn());
	return {
		modal,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		draft: (modal as any).draft as MarkerTemplate,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		snapshot: (modal as any).snapshot as Partial<Record<keyof MarkerTemplate, unknown>>,
	};
}

describe('TemplateEditModal dirty tracking', () => {
	it('keeps an explicit transparency value', () => {
		const { draft, snapshot } = createModal(createTemplate({ transparency: 30 }));

		expect(draft.transparency).toBe(30);
		expect(snapshot.transparency).toBe(30);
	});

	// Regression: a template saved before transparency existed read as undefined,
	// while the slider writes a numeric 0. The dirty check compares with !==, so
	// `undefined !== 0` marked the Pin row changed forever -- even after the user
	// dragged the slider back to where it started.
	it('normalizes a missing transparency so it does not read as changed', () => {
		const legacy = createTemplate();
		delete (legacy as Partial<MarkerTemplate>).transparency;

		const { draft, snapshot } = createModal(legacy);

		expect(draft.transparency).toBe(0);
		expect(snapshot.transparency).toBe(0);
		// What the dirty check actually evaluates
		expect(snapshot.transparency !== draft.transparency).toBe(false);
	});

	it('stays clean after the slider round-trips back to its starting value', () => {
		const legacy = createTemplate();
		delete (legacy as Partial<MarkerTemplate>).transparency;

		const { draft, snapshot } = createModal(legacy);

		draft.transparency = 50;
		expect(snapshot.transparency !== draft.transparency).toBe(true);

		draft.transparency = 0;
		expect(snapshot.transparency !== draft.transparency).toBe(false);
	});

	it('snapshots every field that can be pushed to markers', () => {
		const { snapshot } = createModal(createTemplate({ color: '#123456', icon: 'star' }));

		expect(snapshot.color).toBe('#123456');
		expect(snapshot.icon).toBe('star');
		expect(snapshot.direction).toBe('down');
		expect(snapshot.shape).toBe('pin');
	});

	it('edits a copy, leaving the stored template untouched until save', () => {
		const template = createTemplate({ color: '#ffffff' });
		const { draft } = createModal(template);

		draft.color = '#ff0000';

		expect(template.color).toBe('#ffffff');
	});
});

// ── Applying a template to markers ──
//
// These cover the guard that keeps "Save & update markers" from destroying hot
// zones. A zone stores its own geometry and carries no template, so a template
// apply must never write to one -- it would overwrite the fill and, worse,
// rewrite `shape` and turn the polygon into a pin.

const TEMPLATE_ID = 'tpl';

function createMarker(overrides: Partial<MapMarker> = {}): MapMarker {
	return {
		id: 'm1',
		templateId: TEMPLATE_ID,
		x: 10,
		y: 20,
		layerId: null,
		note: null,
		alias: null,
		previewNote: null,
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
		scale: null,
		scaleToZoom: null,
		textScale: null,
		textScaleToZoom: null,
		font: null,
		textVisibility: null,
		...overrides,
	};
}

function createZone(overrides: Partial<MapMarker> = {}): MapMarker {
	return createMarker({
		id: 'z1',
		// Zones normally have no template; tests override this deliberately to
		// exercise the shape-based guard rather than the templateId filter.
		templateId: '',
		shape: 'area',
		color: '#ff0000',
		transparency: 40,
		points: [
			{ x: -10, y: -10 },
			{ x: 10, y: -10 },
			{ x: 10, y: 10 },
		],
		...overrides,
	});
}

/** A modal wired up with the dataManager surface that applyToMarkers needs. */
function createApplyHarness(markers: MapMarker[], template: MarkerTemplate) {
	const state: MapState = {
		mapId: 'test-map',
		markers,
		layers: [{ ...DEFAULT_LAYER }],
		distanceScale: null,
	};
	const plugin = {
		app: new App(),
		settings: { ...DEFAULT_SETTINGS, markerTemplates: [template] },
		dataManager: {
			saveSettings: vi.fn(),
			saveMapState: vi.fn(),
			flushSaves: vi.fn().mockResolvedValue(undefined),
			loadAllMapStates: vi.fn().mockResolvedValue([state]),
		},
		triggerMapRefresh: vi.fn(),
		manifest: { id: 'ttrpg-maps' },
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;

	const modal = new TemplateEditModal(plugin.app, plugin, template, vi.fn());
	return { modal, plugin, state };
}

/** Invoke the private apply and let its internal async IIFE settle. */
async function applyFields(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	modal: any,
	fields: (keyof MarkerTemplate)[],
): Promise<void> {
	modal.applyToMarkers(fields);
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe('TemplateEditModal: applying a template to markers', () => {
	it('updates a pin marker that uses the template', async () => {
		const template = createTemplate({ color: '#00ff00', transparency: 15 });
		const pin = createMarker();
		const { modal } = createApplyHarness([pin], template);

		await applyFields(modal, ['color', 'transparency']);

		expect(pin.color).toBe('#00ff00');
		expect(pin.transparency).toBe(15);
	});

	it('leaves markers belonging to a different template alone', async () => {
		const template = createTemplate({ color: '#00ff00' });
		const other = createMarker({ id: 'm2', templateId: 'tpl_other', color: '#123456' });
		const { modal } = createApplyHarness([other], template);

		await applyFields(modal, ['color']);

		expect(other.color).toBe('#123456');
	});

	it('never touches a hot zone, even when it shares the template id', async () => {
		const template = createTemplate({ color: '#00ff00', transparency: 15, shape: 'circle' });
		// The dangerous case: a zone that somehow acquired a real template id
		const zone = createZone({ templateId: TEMPLATE_ID });
		const { modal } = createApplyHarness([zone], template);

		await applyFields(modal, ['color', 'transparency', 'shape']);

		expect(zone.shape).toBe('area');
		expect(zone.color).toBe('#ff0000');
		expect(zone.transparency).toBe(40);
	});

	it('preserves zone geometry through a template apply', async () => {
		const template = createTemplate({ color: '#00ff00', shape: 'circle' });
		const zone = createZone({ templateId: TEMPLATE_ID });
		const originalPoints = zone.points!.map((p) => ({ ...p }));
		const { modal } = createApplyHarness([zone], template);

		await applyFields(modal, ['color', 'shape']);

		expect(zone.points).toEqual(originalPoints);
	});

	it('skips a zone with no template id via the templateId filter', async () => {
		const template = createTemplate({ color: '#00ff00' });
		const zone = createZone();
		const { modal } = createApplyHarness([zone], template);

		await applyFields(modal, ['color']);

		expect(zone.color).toBe('#ff0000');
		expect(zone.shape).toBe('area');
	});

	it('updates pins while leaving zones untouched in the same map', async () => {
		const template = createTemplate({ color: '#00ff00', shape: 'circle' });
		const pin = createMarker();
		const zone = createZone({ templateId: TEMPLATE_ID });
		const { modal } = createApplyHarness([pin, zone], template);

		await applyFields(modal, ['color', 'shape']);

		expect(pin.color).toBe('#00ff00');
		expect(pin.shape).toBe('circle');
		expect(zone.color).toBe('#ff0000');
		expect(zone.shape).toBe('area');
	});

	it('does not save a map whose only marker is a zone', async () => {
		const template = createTemplate({ color: '#00ff00' });
		const zone = createZone({ templateId: TEMPLATE_ID });
		const { modal, plugin } = createApplyHarness([zone], template);

		await applyFields(modal, ['color']);

		// Nothing changed, so there is nothing to persist
		expect(plugin.dataManager.saveMapState).not.toHaveBeenCalled();
	});

	it('saves the map when a pin was updated', async () => {
		const template = createTemplate({ color: '#00ff00' });
		const { modal, plugin } = createApplyHarness([createMarker()], template);

		await applyFields(modal, ['color']);

		expect(plugin.dataManager.saveMapState).toHaveBeenCalledTimes(1);
	});
});
