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

The build has a required pre-step: `scripts/build-icons.mjs` extracts SVG paths from `fonts/font-awesome/svgs/solid/` into `src/generated/fa-icons.ts`. This file is gitignored and must be generated before building or testing.

## Architecture

This is an Obsidian plugin that renders interactive TTRPG maps from `ttrpgmap` markdown code blocks. The code block contains YAML-like config (image path, dimensions, zoom settings). Map state (markers, distance scale) is persisted separately in `.ttrpgmap/` sidecar JSON files.

### Two-layer persistence model

- **Code block YAML** (in the markdown file): static map config (image, height, width, zoom). Written back to the source file via `writeConfigToCodeBlock()` when settings change.
- **Sidecar JSON** (`.ttrpgmap/{mapId}.json`): mutable state (markers, distance scale). Debounced 300ms saves via `DataManager`. Map IDs are stable hashes of the image path.
- **Plugin data.json**: global settings (marker templates). Managed by Obsidian's `loadData`/`saveData`.

### Marker system

Markers reference a template by name. On creation, template values are copied directly onto the marker. The template link is kept so "Save & Apply to Markers" can re-apply template changes. Individual marker properties can override template defaults; the marker edit modal has reset-to-template buttons.

Markers can use a pin shape (FA `map-marker` SVG with an icon inside) or standalone mode (icon renders directly at full size). The `useBaseMarker` boolean controls this.

### Rendering approach

`MapRenderer` extends `MarkdownRenderChild`. The map image and SVG overlay (for distance lines) live inside a CSS-transformed container (`translate + scale`). Markers render in a **separate overlay div** outside the scaled container to stay crisp at all zoom levels. Marker positions are calculated in screen coordinates via `toScreenCoords()` and updated on every pan/zoom change.

### Font Awesome icons

Icons are bundled as a build-time TypeScript registry (not CSS webfonts). `scripts/build-icons.mjs` reads ~2000 SVG files and `metadata/icons.json` to produce `src/generated/fa-icons.ts` containing each icon's viewBox, path data, and search terms. Icons render as inline SVGs with `fill="currentColor"` for CSS color inheritance.

### Plugin refresh system

`TTRPGMapsPlugin` maintains a set of refresh callbacks. Active `MapRenderer` instances subscribe on load and unsubscribe on unload. When template changes are applied to markers, `triggerMapRefresh()` causes all active maps to reload state from disk and re-render.

### Test environment

Tests run in jsdom. `src/__mocks__/obsidian.ts` mocks the Obsidian API classes. `src/__mocks__/obsidian-dom.ts` polyfills Obsidian's custom HTMLElement methods (`createDiv`, `createEl`, `empty`, `addClass`, `setText`). Coverage is scoped to `src/utils/`, `src/map/`, `src/types.ts`, `src/distance.ts`, and `src/DataManager.ts`.

## Key conventions

- The Obsidian `setIcon()` API (Lucide icons) is only used for Obsidian UI elements (toolbar buttons, settings icons). All marker/map icons use the Font Awesome system via `setFAIcon()` / `createPinElement()`.
- Map coordinates are stored in **natural image pixel space**. `getImageScale()` provides the display-to-natural ratio for coordinate conversion.
- CSS class prefix is `ttrpgmap-`. Shared pin styling uses `.ttrpgmap-pin` base class with `.ttrpgmap-marker-pin` (map) and `.ttrpgmap-preview-pin` (settings) size variants.
- Standalone icon markers (no pin shape) use `.ttrpgmap-pin--standalone` and are excluded from direction-based CSS rotations via `:not(.ttrpgmap-pin--standalone)` selectors.
