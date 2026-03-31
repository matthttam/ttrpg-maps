import { App, AbstractInputSuggest } from "obsidian";
import { setFAIcon, searchFAIcons, getFAIcon } from "../utils/faIcon";

export class IconSuggest extends AbstractInputSuggest<string> {
  private textInputEl: HTMLInputElement;
  private onChange: (value: string) => void;

  constructor(app: App, inputEl: HTMLInputElement, onChange: (value: string) => void) {
    super(app, inputEl);
    this.textInputEl = inputEl;
    this.onChange = onChange;
  }

  getSuggestions(query: string): string[] {
    return searchFAIcons(query, 30);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    const row = el.createDiv({ cls: "ttrpgmap-icon-suggest-row" });
    const iconEl = row.createDiv({ cls: "ttrpgmap-icon-suggest-icon" });
    setFAIcon(iconEl, value);
    row.createDiv({ cls: "ttrpgmap-icon-suggest-name", text: value });
    const icon = getFAIcon(value);
    if (icon) {
      row.createDiv({ cls: "ttrpgmap-icon-suggest-set", text: icon.set === "gi" ? "Game Icons" : "FA" });
    }
  }

  selectSuggestion(value: string): void {
    this.textInputEl.value = value;
    this.textInputEl.trigger("input");
    this.onChange(value);
    this.close();
  }
}
