import { App, AbstractInputSuggest, setIcon, getIconIds } from "obsidian";

export class IconSuggest extends AbstractInputSuggest<string> {
  private textInputEl: HTMLInputElement;
  private onChange: (value: string) => void;

  constructor(app: App, inputEl: HTMLInputElement, onChange: (value: string) => void) {
    super(app, inputEl);
    this.textInputEl = inputEl;
    this.onChange = onChange;
  }

  getSuggestions(query: string): string[] {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    return getIconIds()
      .filter((id) => id.toLowerCase().includes(lowerQuery))
      .sort((a, b) => {
        const aStart = a.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        const bStart = b.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        return aStart - bStart || a.localeCompare(b);
      })
      .slice(0, 30);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    const row = el.createDiv({ cls: "ttrpgmap-icon-suggest-row" });
    const iconEl = row.createDiv({ cls: "ttrpgmap-icon-suggest-icon" });
    setIcon(iconEl, value);
    row.createDiv({ cls: "ttrpgmap-icon-suggest-name", text: value });
  }

  selectSuggestion(value: string): void {
    this.textInputEl.value = value;
    this.textInputEl.trigger("input");
    this.onChange(value);
    this.close();
  }
}
