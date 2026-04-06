import { App, AbstractInputSuggest, TFolder } from "obsidian";

export class FolderSuggest extends AbstractInputSuggest<string> {
  private textInputEl: HTMLInputElement;
  private onChange: (value: string) => void;

  constructor(app: App, inputEl: HTMLInputElement, onChange: (value: string) => void) {
    super(app, inputEl);
    this.textInputEl = inputEl;
    this.onChange = onChange;
  }

  getSuggestions(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    const folders: string[] = [];
    this.app.vault.getAllFolders().forEach((f: TFolder) => {
      if (f.path === "/") {
        folders.push("/");
      } else {
        folders.push(f.path);
      }
    });
    // Always include root
    if (!folders.includes("/")) folders.unshift("/");

    return folders
      .filter((p) => p.toLowerCase().includes(lowerQuery))
      .sort((a, b) => {
        const aStart = a.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        const bStart = b.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        return aStart - bStart || a.localeCompare(b);
      })
      .slice(0, 20);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value === "/" ? "/ (vault root)" : value);
  }

  selectSuggestion(value: string): void {
    this.textInputEl.value = value;
    this.textInputEl.trigger("input");
    this.onChange(value);
    this.close();
  }
}
