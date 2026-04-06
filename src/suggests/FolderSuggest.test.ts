import { describe, it, expect, vi } from "vitest";
import { App, TFolder } from "obsidian";
import { FolderSuggest } from "./FolderSuggest";

function createSuggest(folderPaths: string[]): FolderSuggest {
  const app = new App();
  const folders = folderPaths.map((p) => {
    const f = new TFolder();
    f.path = p;
    f.name = p.split("/").pop() ?? p;
    return f;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app.vault as any).getAllFolders = () => folders;
  const inputEl = document.createElement("input");
  return new FolderSuggest(app, inputEl, vi.fn());
}

describe("FolderSuggest", () => {
  it("always includes root folder", () => {
    const suggest = createSuggest(["maps", "images"]);
    const results = suggest.getSuggestions("");
    expect(results).toContain("/");
  });

  it("returns folders matching the query", () => {
    const suggest = createSuggest(["maps", "images", "maps/dungeons"]);
    const results = suggest.getSuggestions("maps");
    expect(results).toContain("maps");
    expect(results).toContain("maps/dungeons");
    expect(results).not.toContain("images");
  });

  it("is case-insensitive", () => {
    const suggest = createSuggest(["Maps", "images"]);
    const results = suggest.getSuggestions("maps");
    expect(results).toContain("Maps");
  });

  it("sorts prefix matches before substring matches", () => {
    const suggest = createSuggest(["old-maps", "maps", "images"]);
    const results = suggest.getSuggestions("maps");
    // "maps" starts with query so it comes before "old-maps"
    const mapsIdx = results.indexOf("maps");
    const oldMapsIdx = results.indexOf("old-maps");
    expect(mapsIdx).toBeLessThan(oldMapsIdx);
  });

  it("limits results to 20", () => {
    const folders = Array.from({ length: 30 }, (_, i) => `folder-${i}`);
    const suggest = createSuggest(folders);
    const results = suggest.getSuggestions("");
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it("renders root folder with label", () => {
    const suggest = createSuggest([]);
    const el = document.createElement("div");
    suggest.renderSuggestion("/", el);
    expect(el.textContent).toBe("/ (vault root)");
  });

  it("renders non-root folders as their path", () => {
    const suggest = createSuggest([]);
    const el = document.createElement("div");
    suggest.renderSuggestion("maps/dungeons", el);
    expect(el.textContent).toBe("maps/dungeons");
  });
});
