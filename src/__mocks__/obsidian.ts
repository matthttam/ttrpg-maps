// Minimal mocks for Obsidian API used in tests
export class MarkdownRenderChild {
  containerEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }
  onload() {}
  onunload() {}
}

export class App {}
export class Menu {
  addItem(cb: (item: any) => void) {
    return this;
  }
  showAtMouseEvent(e: MouseEvent) {}
}
export class Modal {
  app: App;
  contentEl: HTMLElement = document.createElement("div");
  constructor(app: App) {
    this.app = app;
  }
  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}
export class Setting {
  constructor(containerEl: HTMLElement) {}
  setName(name: string) { return this; }
  setDesc(desc: string) { return this; }
  addText(cb: (text: any) => void) { return this; }
  addDropdown(cb: (dropdown: any) => void) { return this; }
  addButton(cb: (btn: any) => void) { return this; }
  addToggle(cb: (toggle: any) => void) { return this; }
}
export class FuzzySuggestModal<T> {
  app: App;
  constructor(app: App) { this.app = app; }
  open() {}
  close() {}
  getItems(): T[] { return []; }
  getItemText(item: T): string { return ""; }
  onChooseItem(item: T): void {}
}
export class AbstractInputSuggest<T> {
  app: App;
  constructor(app: App, inputEl: HTMLInputElement) { this.app = app; }
  getSuggestions(query: string): T[] { return []; }
  renderSuggestion(value: T, el: HTMLElement): void {}
  selectSuggestion(value: T): void {}
  close(): void {}
}
export class TAbstractFile {
  path = "";
}
export class Notice {
  constructor(message: string) {}
}
export class TFile {
  path = "";
  extension = "";
}
export function setIcon(parent: HTMLElement, iconId: string): void {}
export function getIconIds(): string[] { return []; }
export class Plugin {
  app: App = new App();
  manifest: any = {};
  async loadData() { return {}; }
  async saveData(data: any) {}
}
export class PluginSettingTab {
  app: App;
  containerEl: HTMLElement = document.createElement("div");
  constructor(app: App, plugin: Plugin) { this.app = app; }
  display(): void {}
  hide(): void {}
}
