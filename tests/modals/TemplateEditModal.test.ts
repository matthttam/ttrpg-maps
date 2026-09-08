import { describe, it, expect, vi } from 'vitest';
import { App } from 'obsidian';
import { TemplateEditModal } from '../../src/modals/TemplateEditModal';
import { MarkerTemplate, DEFAULT_SETTINGS } from '../../src/types';

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
