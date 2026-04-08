import { describe, it, expect } from 'vitest';
import { displayTitle, linkPath, buildMarkerLabel } from '../../src/utils/markerLabel';

describe('displayTitle', () => {
	it('returns a simple filename as-is', () => {
		expect(displayTitle('Tavern')).toBe('Tavern');
	});

	it('extracts the last segment from a path', () => {
		expect(displayTitle('Places/Tavern')).toBe('Tavern');
	});

	it('extracts the last segment from a deep path', () => {
		expect(displayTitle('World/Places/Tavern')).toBe('Tavern');
	});

	it('returns the alias when a pipe is present (legacy safety net)', () => {
		expect(displayTitle('Places/Tavern|The Red Dragon Inn')).toBe('The Red Dragon Inn');
	});

	it('preserves headings when there is no path separator', () => {
		expect(displayTitle('Page#heading')).toBe('Page#heading');
	});

	it('returns the alias when both a path with heading and alias are present', () => {
		expect(displayTitle('Places/Tavern#bar|The Bar')).toBe('The Bar');
	});

	it('returns an empty string for empty input', () => {
		expect(displayTitle('')).toBe('');
	});

	it('returns the explicit alias when provided', () => {
		expect(displayTitle('Places/Tavern', 'My Alias')).toBe('My Alias');
	});

	it('falls through to path extraction when alias is null', () => {
		expect(displayTitle('Places/Tavern', null)).toBe('Tavern');
	});

	it('falls through to path extraction when alias is empty string', () => {
		expect(displayTitle('Places/Tavern', '')).toBe('Tavern');
	});

	it('explicit alias takes precedence over pipe alias', () => {
		expect(displayTitle('Places/Tavern|Old Alias', 'New Alias')).toBe('New Alias');
	});
});

describe('linkPath', () => {
	it('returns a simple name as-is', () => {
		expect(linkPath('Tavern')).toBe('Tavern');
	});

	it('returns a full path as-is when no alias', () => {
		expect(linkPath('Places/Tavern')).toBe('Places/Tavern');
	});

	it('strips the alias and returns the path before the pipe', () => {
		expect(linkPath('Places/Tavern|Alias')).toBe('Places/Tavern');
	});

	it('returns an empty string for empty input', () => {
		expect(linkPath('')).toBe('');
	});
});

describe('buildMarkerLabel', () => {
	function makeContainer(): HTMLDivElement {
		return document.createElement('div');
	}

	it('does nothing when both note and description are null', () => {
		const container = makeContainer();
		buildMarkerLabel(container, null, null, null, 'label-cls');
		expect(container.children.length).toBe(0);
	});

	it('creates a label with a title span when only note is provided', () => {
		const container = makeContainer();
		buildMarkerLabel(container, 'Places/Tavern', null, null, 'label-cls');

		const label = container.querySelector('.label-cls');
		expect(label).not.toBeNull();

		const title = label!.querySelector('.ttrpgmap-marker-title');
		expect(title).not.toBeNull();
		expect(title!.textContent).toBe('Tavern');

		const desc = label!.querySelector('.ttrpgmap-marker-desc');
		expect(desc).toBeNull();
	});

	it('creates a label with a description div when only description is provided', () => {
		const container = makeContainer();
		buildMarkerLabel(container, null, null, 'A cozy inn', 'label-cls');

		const label = container.querySelector('.label-cls');
		expect(label).not.toBeNull();

		const title = label!.querySelector('.ttrpgmap-marker-title');
		expect(title).toBeNull();

		const desc = label!.querySelector('.ttrpgmap-marker-desc');
		expect(desc).not.toBeNull();
		expect(desc!.textContent).toBe('A cozy inn');
	});

	it('creates a label with both title and description when both are provided', () => {
		const container = makeContainer();
		buildMarkerLabel(container, 'Places/Tavern', null, 'A cozy inn', 'label-cls');

		const label = container.querySelector('.label-cls');
		expect(label).not.toBeNull();

		const title = label!.querySelector('.ttrpgmap-marker-title');
		expect(title).not.toBeNull();
		expect(title!.textContent).toBe('Tavern');

		const desc = label!.querySelector('.ttrpgmap-marker-desc');
		expect(desc).not.toBeNull();
		expect(desc!.textContent).toBe('A cozy inn');
	});

	it('applies the provided label class to the label element', () => {
		const container = makeContainer();
		buildMarkerLabel(container, 'Note', null, null, 'my-custom-class');

		const label = container.firstElementChild as HTMLElement;
		expect(label.classList.contains('my-custom-class')).toBe(true);
	});

	it('uses displayTitle to strip the path from the note for the title text', () => {
		const container = makeContainer();
		buildMarkerLabel(container, 'World/Places/Tavern|The Red Dragon Inn', null, null, 'label-cls');

		const title = container.querySelector('.ttrpgmap-marker-title');
		expect(title!.textContent).toBe('The Red Dragon Inn');
	});

	it('uses alias for the title when provided', () => {
		const container = makeContainer();
		buildMarkerLabel(container, 'Places/Tavern', 'My Tavern', null, 'label-cls');

		const title = container.querySelector('.ttrpgmap-marker-title');
		expect(title!.textContent).toBe('My Tavern');
	});
});
