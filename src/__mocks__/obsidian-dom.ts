/**
 * Polyfills Obsidian's custom HTMLElement methods for JSDOM testing.
 * Obsidian extends HTMLElement with helpers like createDiv, createEl, empty, addClass, etc.
 */

// ResizeObserver is not available in jsdom
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

interface CreateElOpts {
  cls?: string;
  text?: string;
  attr?: Record<string, string>;
  type?: string;
  value?: string;
}

declare global {
  interface HTMLElement {
    createDiv(opts?: CreateElOpts | { cls: string }): HTMLDivElement;
    createEl<K extends keyof HTMLElementTagNameMap>(tag: K, opts?: CreateElOpts): HTMLElementTagNameMap[K];
    createSpan(opts?: CreateElOpts): HTMLSpanElement;
    empty(): void;
    addClass(...classes: string[]): void;
    removeClass(...classes: string[]): void;
    toggleClass(cls: string, value: boolean): void;
    hasClass(cls: string): boolean;
    setText(text: string): void;
  }
  interface Element {
    setText(text: string): void;
    addClass(...classes: string[]): void;
    removeClass(...classes: string[]): void;
    toggleClass(cls: string, value: boolean): void;
    hasClass(cls: string): boolean;
  }
}

if (typeof HTMLElement !== "undefined" && !HTMLElement.prototype.createDiv) {
  HTMLElement.prototype.createDiv = function (opts?: any): HTMLDivElement {
    return createEl.call(this, "div", opts) as HTMLDivElement;
  };

  HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    opts?: CreateElOpts
  ): HTMLElementTagNameMap[K] {
    return createEl.call(this, tag, opts);
  };

  HTMLElement.prototype.createSpan = function (opts?: any): HTMLSpanElement {
    return createEl.call(this, "span", opts) as HTMLSpanElement;
  };

  HTMLElement.prototype.empty = function (): void {
    this.innerHTML = "";
  };

  HTMLElement.prototype.addClass = function (...classes: string[]): void {
    this.classList.add(...classes);
  };

  HTMLElement.prototype.removeClass = function (...classes: string[]): void {
    this.classList.remove(...classes);
  };

  HTMLElement.prototype.toggleClass = function (cls: string, value: boolean): void {
    this.classList.toggle(cls, value);
  };

  HTMLElement.prototype.hasClass = function (cls: string): boolean {
    return this.classList.contains(cls);
  };

  HTMLElement.prototype.setText = function (text: string): void {
    this.textContent = text;
  };

  // Also on Element (for SVG elements etc.)
  Element.prototype.setText = function (text: string): void {
    this.textContent = text;
  };

  Element.prototype.addClass = function (...classes: string[]): void {
    this.classList.add(...classes);
  };

  Element.prototype.removeClass = function (...classes: string[]): void {
    this.classList.remove(...classes);
  };

  Element.prototype.toggleClass = function (cls: string, value: boolean): void {
    this.classList.toggle(cls, value);
  };

  Element.prototype.hasClass = function (cls: string): boolean {
    return this.classList.contains(cls);
  };
}

function createEl(this: HTMLElement, tag: string, opts?: CreateElOpts): HTMLElement {
  const el = document.createElement(tag);
  if (opts?.cls) {
    for (const c of opts.cls.split(" ")) {
      if (c) el.classList.add(c);
    }
  }
  if (opts?.text) el.textContent = opts.text;
  if (opts?.attr) {
    for (const [k, v] of Object.entries(opts.attr)) {
      el.setAttribute(k, v);
    }
  }
  if (opts?.type) (el as HTMLInputElement).type = opts.type;
  if (opts?.value) (el as HTMLInputElement).value = opts.value;
  this.appendChild(el);
  return el;
}

export {};
