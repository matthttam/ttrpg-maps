// Minimal mocks for Obsidian API used in tests
// Obsidian exposes activeWindow as a global
(globalThis as any).activeWindow = globalThis.window ?? globalThis;
export class MarkdownRenderChild {
  containerEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }
  onload() {}
  onunload() {}
}

export class App {
  vault = {
    getFileByPath: (path: string) => null as TFile | null,
    getResourcePath: (file: TFile) => `app://local/${file.path}`,
    getFiles: () => [] as TFile[],
    getMarkdownFiles: () => [] as TFile[],
    read: async (file: TFile) => "",
    modify: async (file: TFile, content: string) => {},
  };
  workspace = {
    openLinkText: (linktext: string, sourcePath: string) => {},
    trigger: (name: string, ...data: unknown[]) => {},
  };
  metadataCache = {
    getFirstLinkpathDest: (linkpath: string, sourcePath: string) => null as TFile | null,
    getFileCache: (file: TFile) => null as any,
  };
}

export class Menu {
  private items: any[] = [];
  addItem(cb: (item: any) => void) {
    const item = {
      setTitle(t: string) { item._title = t; return item; },
      setIcon(i: string) { return item; },
      onClick(cb: () => void) { item._onClick = cb; return item; },
      _title: "",
      _onClick: () => {},
    };
    cb(item);
    this.items.push(item);
    return this;
  }
  addSeparator() { return this; }
  showAtMouseEvent(e: MouseEvent) {}
}

export class Modal {
  app: App;
  contentEl: HTMLElement = document.createElement("div");
  constructor(app: App) {
    this.app = app;
  }
  open() { this.onOpen(); }
  close() { this.onClose(); }
  onOpen() {}
  onClose() {}
}

export class Setting {
  controlEl: HTMLElement = document.createElement("div");
  nameEl: HTMLElement = document.createElement("div");
  constructor(containerEl: HTMLElement) {}
  setName(name: string) { return this; }
  setDesc(desc: string) { return this; }
  setClass(cls: string) { return this; }
  addText(cb: (text: any) => void) {
    const text = {
      inputEl: document.createElement("input"),
      setPlaceholder(p: string) { return text; },
      setValue(v: string) { return text; },
      setDisabled(d: boolean) { return text; },
      onChange(cb: (v: string) => void) { return text; },
    };
    cb(text);
    return this;
  }
  addDropdown(cb: (dropdown: any) => void) {
    const dd = {
      addOption(v: string, l: string) { return dd; },
      setValue(v: string) { return dd; },
      onChange(cb: (v: string) => void) { return dd; },
      setDisabled(d: boolean) { return dd; },
    };
    cb(dd);
    return this;
  }
  addButton(cb: (btn: any) => void) {
    const btn = {
      setButtonText(t: string) { return btn; },
      setCta() { return btn; },
      setWarning() { return btn; },
      onClick(cb: () => void) { return btn; },
    };
    cb(btn);
    return this;
  }
  addExtraButton(cb: (btn: any) => void) {
    const btn = {
      setIcon(i: string) { return btn; },
      setTooltip(t: string) { return btn; },
      onClick(cb: () => void) { return btn; },
    };
    cb(btn);
    return this;
  }
  addTextArea(cb: (textArea: any) => void) {
    const ta = {
      inputEl: document.createElement("textarea"),
      setValue(v: string) { return ta; },
      onChange(cb: (v: string) => void) { return ta; },
    };
    cb(ta);
    return this;
  }
  addToggle(cb: (toggle: any) => void) {
    const toggle = {
      setValue(v: boolean) { return toggle; },
      onChange(cb: (v: boolean) => void) { return toggle; },
    };
    cb(toggle);
    return this;
  }
  addSlider(cb: (slider: any) => void) {
    const slider = {
      setLimits(min: number, max: number, step: number) { return slider; },
      setValue(v: number) { return slider; },
      setDynamicTooltip() { return slider; },
      setDisabled(d: boolean) { return slider; },
      onChange(cb: (v: number) => void) { return slider; },
    };
    cb(slider);
    return this;
  }
}

export class SuggestModal<T> {
  app: App;
  inputEl: HTMLInputElement = document.createElement("input");
  resultContainerEl: HTMLElement = document.createElement("div");
  constructor(app: App) { this.app = app; }
  open() {}
  close() {}
  setPlaceholder(p: string) {}
  setInstructions(instructions: any[]) {}
  getSuggestions(query: string): T[] { return []; }
  renderSuggestion(item: T, el: HTMLElement): void {}
  onChooseSuggestion(item: T, evt: any): void {}
  selectSuggestion(item: T): void {}
}
export function prepareFuzzySearch(query: string): (text: string) => any { return () => null; }
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
  basename = "";
  extension = "";
}

export function setIcon(parent: HTMLElement, iconId: string): void {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-icon", iconId);
  parent.appendChild(svg);
}

export function getIconIds(): string[] {
  return ["sword", "shield", "map-pin", "star", "flag", "skull", "castle"];
}

export class Plugin {
  app: App = new App();
  manifest: any = { id: "ttrpg-maps", dir: ".obsidian/plugins/ttrpg-maps" };
  async loadData() { return {}; }
  async saveData(data: any) {}
  registerHoverLinkSource(id: string, info: any) {}
}

export class PluginSettingTab {
  app: App;
  containerEl: HTMLElement = document.createElement("div");
  constructor(app: App, plugin: Plugin) { this.app = app; }
  display(): void {}
  hide(): void {}
}
