import { App, AbstractInputSuggest } from 'obsidian';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];

export class ImageSuggest extends AbstractInputSuggest<string> {
	private textInputEl: HTMLInputElement;
	private onChange: (value: string) => void;

	constructor(app: App, inputEl: HTMLInputElement, onChange: (value: string) => void) {
		super(app, inputEl);
		this.textInputEl = inputEl;
		this.onChange = onChange;
	}

	getSuggestions(query: string): string[] {
		const lowerQuery = query.toLowerCase();
		return this.app.vault
			.getFiles()
			.filter(
				(f) =>
					IMAGE_EXTENSIONS.includes(f.extension.toLowerCase()) &&
					(f.basename.toLowerCase().includes(lowerQuery) || f.path.toLowerCase().includes(lowerQuery)),
			)
			.sort((a, b) => {
				const aStart = a.basename.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
				const bStart = b.basename.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
				return aStart - bStart || a.basename.localeCompare(b.basename);
			})
			.map((f) => f.path)
			.slice(0, 20);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.textInputEl.value = value;
		this.textInputEl.trigger('input');
		this.onChange(value);
		this.close();
	}
}
