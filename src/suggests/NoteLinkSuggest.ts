import { App, AbstractInputSuggest, prepareFuzzySearch } from 'obsidian';

/**
 * Inline suggest for note links attached to a text input.
 * Supports Page, Page#Header, Page#^blockId, and Page|Alias syntax.
 */
export class NoteLinkSuggest extends AbstractInputSuggest<string> {
	private textInputEl: HTMLInputElement;
	private onChange: (value: string) => void;

	constructor(app: App, inputEl: HTMLInputElement, onChange: (value: string) => void) {
		super(app, inputEl);
		this.textInputEl = inputEl;
		this.onChange = onChange;
	}

	getSuggestions(query: string): string[] {
		// Strip alias for search purposes
		const pipeIdx = query.indexOf('|');
		const searchPart = pipeIdx >= 0 ? query.slice(0, pipeIdx) : query;
		const alias = pipeIdx >= 0 ? query.slice(pipeIdx) : ''; // includes the |

		const hashIdx = searchPart.indexOf('#');

		if (hashIdx >= 0) {
			return this.getSubpathSuggestions(searchPart, hashIdx, alias);
		}

		return this.getFileSuggestions(searchPart, alias);
	}

	private getFileSuggestions(query: string, aliasSuffix: string): string[] {
		if (!query) return [];
		const files = this.app.vault.getMarkdownFiles();
		const fuzzy = prepareFuzzySearch(query);
		const results: { text: string; score: number }[] = [];

		for (const file of files) {
			const match = fuzzy(file.basename) || fuzzy(file.path);
			if (!match) continue;

			const linkText = file.path.replace(/\.md$/, '');
			results.push({ text: linkText + aliasSuffix, score: match.score });
		}

		return results
			.sort((a, b) => b.score - a.score)
			.slice(0, 20)
			.map((r) => r.text);
	}

	private getSubpathSuggestions(searchPart: string, hashIdx: number, aliasSuffix: string): string[] {
		const filePart = searchPart.slice(0, hashIdx);
		const subQuery = searchPart.slice(hashIdx + 1).toLowerCase();
		const file = this.app.metadataCache.getFirstLinkpathDest(filePart, '');
		if (!file) return [];

		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return [];

		const results: string[] = [];

		// Headings
		if (cache.headings && !subQuery.startsWith('^')) {
			for (const h of cache.headings) {
				if (subQuery && !h.heading.toLowerCase().includes(subQuery)) continue;
				results.push(`${filePart}#${h.heading}${aliasSuffix}`);
			}
		}

		// Block IDs
		if (cache.blocks && (subQuery.startsWith('^') || !subQuery)) {
			const blockQuery = subQuery.startsWith('^') ? subQuery.slice(1) : subQuery;
			for (const id of Object.keys(cache.blocks)) {
				if (blockQuery && !id.toLowerCase().includes(blockQuery)) continue;
				results.push(`${filePart}#^${id}${aliasSuffix}`);
			}
		}

		return results.slice(0, 20);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		// Strip alias for display, show it separately
		const pipeIdx = value.indexOf('|');
		const display = pipeIdx >= 0 ? value.slice(0, pipeIdx) : value;
		const alias = pipeIdx >= 0 ? value.slice(pipeIdx + 1) : null;

		el.createDiv({ text: display });
		if (alias) {
			el.createDiv({ cls: 'ttrpgmap-note-suggest-alias', text: `→ ${alias}` });
		}
	}

	selectSuggestion(value: string): void {
		this.textInputEl.value = value;
		this.textInputEl.trigger('input');
		this.onChange(value);
		this.close();
	}
}
