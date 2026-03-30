import { FA_ICONS, FA_ICON_NAMES } from "../generated/fa-icons";
import type { FAIcon } from "../generated/fa-icons";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Render a Font Awesome icon as inline SVG into a container */
export function setFAIcon(parent: HTMLElement, iconName: string): void {
  const icon = FA_ICONS[iconName];
  if (!icon) return;

  parent.innerHTML = "";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", icon.viewBox);
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("class", "ttrpgmap-fa-icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", icon.path);
  svg.appendChild(path);
  parent.appendChild(svg);
}

/** Get the FA icon data (viewBox + path) by name */
export function getFAIcon(name: string): FAIcon | undefined {
  return FA_ICONS[name];
}

/** Search FA icons by name and search terms */
export function searchFAIcons(query: string, limit = 30): string[] {
  if (!query) return [];
  const lowerQuery = query.toLowerCase();

  const scored: { name: string; score: number }[] = [];

  for (const name of FA_ICON_NAMES) {
    const icon = FA_ICONS[name];
    let score = -1;

    // Exact name match
    if (name === lowerQuery) {
      score = 0;
    }
    // Name starts with query
    else if (name.startsWith(lowerQuery)) {
      score = 1;
    }
    // Name contains query
    else if (name.includes(lowerQuery)) {
      score = 2;
    }
    // Search terms match
    else if (icon.terms.some((t) => t.toLowerCase().includes(lowerQuery))) {
      score = 3;
    }

    if (score >= 0) {
      scored.push({ name, score });
    }
  }

  return scored
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((s) => s.name);
}

/** Get all FA icon names */
export function getFAIconNames(): string[] {
  return FA_ICON_NAMES;
}
