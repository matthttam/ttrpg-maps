import { FA_ICONS, ALL_ICON_NAMES, GI_ICON_TERMS } from "../generated/fa-icons";

interface IconEntry {
  viewBox: string;
  path: string;
  terms: string[];
  set: "fa" | "gi";
}

const SVG_NS = "http://www.w3.org/2000/svg";

// Lazy-loaded Game Icons cache
let giIconsLoaded = false;
let giIcons: Record<string, IconEntry> = {};

/** Check if Game Icons have been loaded */
export function isGameIconsLoaded(): boolean {
  return giIconsLoaded;
}

/** Load Game Icons JSON. Accepts a read function for the given path. */
export async function loadGameIcons(path: string, readFile: (path: string) => Promise<string>): Promise<void> {
  if (giIconsLoaded) return;
  try {
    const json = await readFile(path);
    giIcons = JSON.parse(json);
    giIconsLoaded = true;
  } catch (e) {
    console.warn("[ttrpg-maps] Failed to load Game Icons from", path, e);
  }
}

/** Render an icon as inline SVG into a container */
export function setFAIcon(parent: HTMLElement, iconName: string): void {
  const icon = getFAIcon(iconName);
  if (!icon) return;

  parent.empty();
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", icon.viewBox);
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("class", "ttrpgmap-fa-icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", icon.path);
  svg.appendChild(path);
  parent.appendChild(svg);
}

/** Get icon data by name (FA inline, GI from lazy cache) */
export function getFAIcon(name: string): IconEntry | undefined {
  return FA_ICONS[name] ?? giIcons[name];
}

/** Search icons by name and search terms */
export function searchFAIcons(query: string, limit = 30): string[] {
  if (!query) return [];
  const lowerQuery = query.toLowerCase();

  const scored: { name: string; score: number }[] = [];

  for (const name of ALL_ICON_NAMES) {
    // For FA icons, get terms from the bundled data
    // For GI icons, get terms from the bundled terms index
    const icon = FA_ICONS[name];
    const terms = icon ? icon.terms : (GI_ICON_TERMS[name] || []);
    let score = -1;

    if (name === lowerQuery) score = 0;
    else if (name.startsWith(lowerQuery)) score = 1;
    else if (name.includes(lowerQuery)) score = 2;
    else if (terms.some((t) => t.toLowerCase().includes(lowerQuery))) score = 3;

    if (score >= 0) scored.push({ name, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((s) => s.name);
}

/** Get all icon names */
export function getFAIconNames(): string[] {
  return ALL_ICON_NAMES;
}
