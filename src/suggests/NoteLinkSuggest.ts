import { App, AbstractInputSuggest } from "obsidian";

export class NoteLinkSuggest extends AbstractInputSuggest<string> {
  private textInputEl: HTMLInputElement;
  private onChange: (value: string) => void;

  constructor(app: App, inputEl: HTMLInputElement, onChange: (value: string) => void) {
    super(app, inputEl);
    this.textInputEl = inputEl;
    this.onChange = onChange;
  }

  getSuggestions(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    const hashIdx = lowerQuery.indexOf("#");

    if (hashIdx >= 0) {
      const filePart = query.slice(0, hashIdx);
      const subQuery = query.slice(hashIdx + 1).toLowerCase();
      const file = this.app.metadataCache.getFirstLinkpathDest(filePart, "");
      if (!file) return [];

      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) return [];

      const results: string[] = [];

      if (cache.headings) {
        for (const h of cache.headings) {
          const link = `${filePart}#${h.heading}`;
          if (h.heading.toLowerCase().includes(subQuery)) {
            results.push(link);
          }
        }
      }

      if (cache.blocks && subQuery.startsWith("^")) {
        const blockQuery = subQuery.slice(1);
        for (const id of Object.keys(cache.blocks)) {
          const link = `${filePart}#^${id}`;
          if (id.toLowerCase().includes(blockQuery)) {
            results.push(link);
          }
        }
      }

      return results.slice(0, 20);
    }

    const files = this.app.vault.getMarkdownFiles();
    return files
      .filter((f) => {
        const name = f.basename.toLowerCase();
        const path = f.path.toLowerCase();
        return name.includes(lowerQuery) || path.includes(lowerQuery);
      })
      .sort((a, b) => {
        const aName = a.basename.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        const bName = b.basename.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        return aName - bName || a.basename.localeCompare(b.basename);
      })
      .map((f) => f.path.replace(/\.md$/, ""))
      .slice(0, 20);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  selectSuggestion(value: string): void {
    this.textInputEl.value = value;
    this.textInputEl.trigger("input");
    this.onChange(value);
    this.close();
  }
}
