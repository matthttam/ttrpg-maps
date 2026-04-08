/** Extract display title from a note link. Uses alias if provided, otherwise extracts filename. */
export function displayTitle(noteLink: string, alias?: string | null): string {
	if (alias) return alias;
	// Safety net for un-migrated data with |alias syntax
	const pipeIdx = noteLink.indexOf('|');
	if (pipeIdx >= 0) return noteLink.slice(pipeIdx + 1);
	return noteLink.split('/').pop() ?? noteLink;
}

/** Extract the link path from a note link (strips alias). */
export function linkPath(noteLink: string): string {
	const pipeIdx = noteLink.indexOf('|');
	return pipeIdx >= 0 ? noteLink.slice(0, pipeIdx) : noteLink;
}

/** Build a marker label (title + description) into a container element. */
export function buildMarkerLabel(
	container: HTMLElement,
	note: string | null,
	alias: string | null,
	description: string | null,
	labelClass: string,
): void {
	if (!note && !description) return;

	const label = container.createDiv({ cls: labelClass });
	if (note) {
		label.createSpan({ cls: 'ttrpgmap-marker-title', text: displayTitle(note, alias) });
	}
	if (description) {
		label.createDiv({ cls: 'ttrpgmap-marker-desc', text: description });
	}
}
