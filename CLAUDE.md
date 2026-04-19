# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build        # Generate icons + type-check + bundle (production)
npm run dev          # Generate icons + watch mode (development)
npm run icons        # Regenerate Font Awesome icon registry only
npm test             # Run all tests once
npm run test:watch   # Run tests in watch mode

# Run a single test file
npx vitest run src/utils/configSerializer.test.ts

# Run tests with coverage
npx vitest run --coverage
```

The build has a required pre-step: `scripts/build-icons.mjs` reads icon data from the `@iconify-json/fa6-solid` and `@iconify-json/game-icons` npm packages and produces `src/generated/fa-icons.ts` (FA icons bundled inline + GI search index) and `gi-icons.json` (GI icon data loaded at runtime). These files are gitignored and must be generated before building or testing.

## Architecture

This is an Obsidian plugin that renders interactive TTRPG maps from `ttrpgmap` markdown code blocks. The code block contains YAML-like config (image path, dimensions, zoom settings). Map state (markers, distance scale) is persisted separately in `.ttrpgmap/` sidecar JSON files.

### Two-layer persistence model

- **Code block YAML** (in the markdown file): static map config (image, height, width, zoom). Written back to the source file via `writeConfigToCodeBlock()` when settings change.
- **Sidecar JSON** (`.ttrpgmap/{mapId}.json`): mutable state (markers, distance scale). Debounced 300ms saves via `DataManager`. Map IDs are stable hashes of the image path.
- **Plugin data.json**: global settings (marker templates). Managed by Obsidian's `loadData`/`saveData`.

### Marker system

Markers reference a template by name. On creation, template values are copied directly onto the marker. The template link is kept so "Save & Apply to Markers" can re-apply template changes. Individual marker properties can override template defaults; the marker edit modal has reset-to-template buttons.

Markers can use a pin shape (FA `location-dot` SVG with an icon inside) or standalone mode (icon renders directly at full size). The `useBaseMarker` boolean controls this.

### Rendering approach

`MapRenderer` extends `MarkdownRenderChild`. The map image and SVG overlay (for distance lines) live inside a CSS-transformed container (`translate + scale`). Markers render in a **separate overlay div** outside the scaled container to stay crisp at all zoom levels. Marker positions are calculated in screen coordinates via `toScreenCoords()` and updated on every pan/zoom change.

### Font Awesome & Game Icons

Icons are sourced from npm packages (`@iconify-json/fa6-solid`, `@iconify-json/game-icons`) rather than vendored SVG files. `scripts/build-icons.mjs` reads the Iconify JSON format, extracts viewBox and path data (including alias resolution), and produces `src/generated/fa-icons.ts` (~1,408 FA icons bundled inline) and `gi-icons.json` (~4,126 Game Icons loaded at runtime). Icons render as inline SVGs with `fill="currentColor"` for CSS color inheritance. The pin shape uses FA's `location-dot` icon.

### Plugin refresh system

`TTRPGMapsPlugin` maintains a set of refresh callbacks. Active `MapRenderer` instances subscribe on load and unsubscribe on unload. When template changes are applied to markers, `triggerMapRefresh()` causes all active maps to reload state from disk and re-render.

### Test environment

Tests live in `tests/` (outside `src/` so the Obsidian review bot doesn't scan them). Tests run in jsdom. `tests/__mocks__/obsidian.ts` mocks the Obsidian API classes. `tests/__mocks__/obsidian-dom.ts` polyfills Obsidian's custom HTMLElement methods (`createDiv`, `createEl`, `empty`, `addClass`, `setText`). Coverage is scoped to `src/utils/`, `src/map/`, `src/types.ts`, `src/distance.ts`, and `src/DataManager.ts`.

## Obsidian community plugin guidelines

This plugin is published to the Obsidian community directory. All code is scanned by an automated review bot using `eslint-plugin-obsidianmd` and `@typescript-eslint`. Run `npx eslint src/` locally before committing to catch issues early.

### UI text must use sentence case

All `.setName()`, `.setButtonText()`, `.setPlaceholder()`, `.setDesc()`, and heading text must use sentence case (first word capitalized, rest lowercase). Exceptions: proper nouns (TTRPG), acronyms (ID, SVG). Example: "Default marker scale", not "Default Marker Scale".

### No inline styles

Never use `element.style.X = ...` directly. Use CSS classes instead:

- Show/hide: `el.addClass("ttrpgmap-hidden")` / `el.removeClass("ttrpgmap-hidden")` (defined in styles.css)
- Cursors: `ttrpgmap-cursor-grab`, `ttrpgmap-cursor-crosshair`, `ttrpgmap-cursor-copy`
- Image rendering: `ttrpgmap-pixelated`
- For truly dynamic values (positions, transforms, CSS custom properties), use `// eslint-disable-next-line obsidianmd/no-static-styles-assignment`

### Headings use the Setting API

Use `new Setting(containerEl).setName("...").setHeading()` instead of `createEl("h2")` or `createEl("h3")`.

### No innerHTML writes

Use `parent.empty()` to clear content. Use `DOMParser` + `appendChild` for injecting SVG strings. Reading innerHTML in tests is OK.

### No browser confirm()

Use an Obsidian `Modal` with buttons that resolve a Promise instead of `confirm()`.

### No async lifecycle overrides

Don't declare `onload()`, `onOpen()`, etc. as `async`. Wrap the async body in `void (async () => { ... })()` inside a synchronous method.

### Promise handling

- Don't pass `async` callbacks to `.onChange()`, `.onClick()`, or `addEventListener`. Either remove async and prefix promise calls with `void`, or wrap in `void (async () => { ... })()`.
- Prefix fire-and-forget promise calls with `void` (e.g., `void plugin.dataManager.saveSettings(...)`).

### No explicit `any` in production code

Use proper types. For undocumented Obsidian APIs (e.g., `setSubmenu()`, `app.setting`), use `// eslint-disable-next-line @typescript-eslint/no-explicit-any`. In test/mock files, eslint-disable comments are acceptable for mock objects.

## Pre-push checklist

Before running `git push`, complete ALL of the following:

1. **Update CLAUDE.md** -- Add or update any sections that reflect new features, architectural changes, new files, or changed conventions from this branch. Future sessions must have accurate context.
2. **Update README.md** -- Add new features to the feature list, update usage instructions, and document any new settings or controls.
3. **Update docs/features.md** -- Update the comprehensive feature list with all new capabilities.
4. **Notify about screenshots** -- Tell the user which screenshots or images in the docs may need updating based on UI changes in this branch (e.g., new toolbar buttons, changed settings modals, new panels).

Do NOT push until all four steps are done. If the user explicitly asks to skip any step, that is acceptable.

## Key conventions

- The Obsidian `setIcon()` API (Lucide icons) is only used for Obsidian UI elements (toolbar buttons, settings icons). All marker/map icons use the Font Awesome system via `setFAIcon()` / `createPinElement()`.
- Map coordinates are stored in **natural image pixel space**. `getImageScale()` provides the display-to-natural ratio for coordinate conversion.
- CSS class prefix is `ttrpgmap-`. Shared pin styling uses `.ttrpgmap-pin` base class with `.ttrpgmap-marker-pin` (map) and `.ttrpgmap-preview-pin` (settings) size variants.
- Standalone icon markers (no pin shape) use `.ttrpgmap-pin--standalone` and are excluded from direction-based CSS rotations via `:not(.ttrpgmap-pin--standalone)` selectors.
