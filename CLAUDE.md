# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build        # Generate icons + type-check + bundle (production)
npm run dev          # Generate icons + watch mode (development)
npm run icons        # Regenerate Font Awesome icon registry only
npm run deploy       # Build, then copy the plugin into a vault
npm run deploy:only  # Copy without rebuilding
npm test             # Run all tests once
npm run test:watch   # Run tests in watch mode

# Run a single test file
npx vitest run src/utils/configSerializer.test.ts

# Run tests with coverage
npx vitest run --coverage
```

The build has a required pre-step: `scripts/build-icons.mjs` reads icon data from the `@iconify-json/fa6-solid` and `@iconify-json/game-icons` npm packages and produces `src/generated/fa-icons.ts` (FA icons bundled inline + GI search index) and `gi-icons.json` (GI icon data loaded at runtime). These files are gitignored and must be generated before building or testing.

**The build does not install the plugin anywhere** -- it only writes `main.js` to the repo root. Obsidian loads the copy inside a vault's `.obsidian/plugins/ttrpg-maps/`, so a rebuild alone changes nothing in the app. `scripts/deploy.mjs` copies the four files Obsidian actually needs (`main.js`, `manifest.json`, `styles.css`, `gi-icons.json`) into one or more vault plugin folders, then the plugin must be reloaded (toggle it off/on, or Ctrl+R) -- Obsidian caches `styles.css` until reload, so CSS changes will appear stale otherwise. Deploy targets come from a gitignored `.deploy-target` file (one vault plugin folder per line) or the `VAULT_PLUGIN_DIR` env var, so no personal path is ever committed. Every target's *parent* must already exist before anything is copied: the plugin folder itself is created on a first deploy, but `mkdirSync(..., { recursive: true })` would otherwise build a whole tree from a mistyped vault path and report a successful deploy into a folder Obsidian never reads.

## Architecture

This is an Obsidian plugin that renders interactive TTRPG maps from `ttrpgmap` markdown code blocks. The code block contains YAML-like config (image path, dimensions, zoom settings). Map state (markers, distance scale) is persisted separately in `.ttrpgmap/` sidecar JSON files.

### Two-layer persistence model

- **Code block YAML** (in the markdown file): static map config (image, height, width, zoom). Written back to the source file via `writeConfigToCodeBlock()` when settings change.
- **Sidecar JSON** (`.ttrpgmap/{mapId}.json`): mutable state (markers, distance scale). Debounced 300ms saves via `DataManager`. Map IDs are stable hashes of the image path.
- **Plugin data.json**: global settings (marker templates). Managed by Obsidian's `loadData`/`saveData`.

### Marker system

Markers reference a template by name. On creation, template values are copied directly onto the marker. The template link is kept so "Save & Apply to Markers" can re-apply template changes. Individual marker properties can override template defaults; the marker edit modal has reset-to-template buttons.

Markers can use a pin shape (FA `location-dot` SVG with an icon inside) or standalone mode (icon renders directly at full size). The `useBaseMarker` boolean controls this.

An optional `transparency` field (0-100%, 0 = opaque) exists on both templates and markers. `createPinElement()` converts it to a `--pin-opacity` CSS custom property on the pin element, which `.ttrpgmap-pin .ttrpgmap-pin-svg` consumes. Because every render path goes through `createPinElement()`, setting it there covers map markers, both edit previews, the template list, the marker list, and the drag ghost at once. It fades the pin shape only -- the icon stays opaque.

Being optional means it reads as `0` via `?? 0` and needs no migration, but that also makes `undefined` and `0` two spellings of the same value, which two places must reconcile:

- `placeMarker()` copies every templated field onto a new marker by hand. Any field missing from that literal silently stops being inherited -- `transparency` was, and new markers ignored their template until it was added. `tests/map/MapRenderer.placeMarker.test.ts` asserts all nine fields to catch the next one.
- `TemplateEditModal`'s dirty tracking compares snapshot to draft with `!==`, so a legacy `undefined` against a slider-written `0` would read as changed forever. The constructor normalizes `transparency` into the draft *and* takes the snapshot from that normalized draft.

### Hot zones (area markers)

A hot zone is a marker with `shape: 'area'` plus a `points` array: a user-drawn polygon acting as one clickable region. Key decisions, all load-bearing:

- **Geometry lives on the marker, never a template.** `MarkerTemplate.shape` deliberately excludes `'area'` (the `MarkerShape` union is wider than the template's field), because a polygon is specific to one place on one map and there is nothing reusable to share. Zones are created with `templateId: ''`, and `applyToMarkers()` *also* skips `shape === 'area'`. Both guards matter: without the second, a zone that somehow acquired a real template id would have its fill overwritten and its `shape` rewritten into a pin, silently destroying the polygon. `tests/modals/TemplateEditModal.test.ts` covers both paths.
- **`points` are relative to the marker's `x`/`y` anchor** (its centroid at creation), in natural image pixels. That means moving a zone only updates the anchor rather than rewriting every vertex. `resolveZonePoints()` converts back to absolute; `anchorZonePoints()` splits absolute input into anchor + relative.
- **Zones render inside the transformed SVG overlay, not the marker overlay.** Pins sit in a separate screen-space overlay to stay crisp, and need `toScreenCoords()` bookkeeping on every pan/zoom. A zone is map geometry, so putting its polygon *and* its label in a `<g>` inside the zoom/pan transform means pan and zoom come free with zero position code. The tradeoff is that stroke width and label font-size must be divided by the zoom scale to stay a constant on-screen size, and `renderZones()` re-runs when zoom settles.
- **Overlap order is explicit.** SVG has no `z-index`, so paint order is document order. Zones sort largest-area-first each render, otherwise a zone nested inside a bigger one would be permanently unclickable. Hover promotes by re-appending the group, which is the SVG equivalent of the pin overlay's `z-index` bump.
- **The outline is derived, not stored.** `darkenHex()` darkens the fill; CSS hides it until `:hover` (or when the zone layer has `--show-all`). It ignores the fill's transparency so a fully transparent zone still outlines on hover.
- **Shared event helpers take `Element`, not `HTMLElement`.** `attachMarkerNavigation()` and `attachMarkerHoverPreview()` were widened, and z-promotion was extracted into an injected callback, so zone polygons get note links and Obsidian's hover preview without duplicating that logic.
- **Use standard DOM APIs on SVG nodes.** Obsidian's `addClass`/`removeClass`/`empty` are HTMLElement extensions and silently do not exist on SVG elements — use `classList` and manual child removal. Getting this wrong broke 34 unrelated tests, because `renderZones()` threw before markers rendered.
- **`createSvg` takes multiple classes as an array, never a space-separated string.** It passes `cls` straight to `classList.add`, which throws `InvalidCharacterError` on a token containing whitespace — unlike `createDiv`/`createEl`, which accept `"a b"` happily. So `cls: ['a', 'b']`, not `cls: 'a b'`. `MeasurementController` has a `splitClasses()` helper for call sites that receive a string. This crashed zone rendering in the real app while every test passed, because `tests/__mocks__/obsidian-dom.ts` used to split the string itself; the mock now mirrors the real behavior and throws, so this class of bug fails a test instead of only appearing in Obsidian. Keep the mock strict.

`ZoneDrawController` does click-to-place drawing under a `'drawing-zone'` interaction mode. `ZoneEditModal` is deliberately separate from `MarkerEditModal`: a zone has no pin shape, direction, icon, or scale overrides, so sharing that modal would mean hiding most of it. Geometry editing is redraw-only; dragging a whole zone is not wired up yet (drag is HTMLElement-bound), though the relative-points model is already ready for it.

Zone shapes must set `pointer-events: auto`. The SVG overlay sets `pointer-events: none` so measurement lines never block the map, and anything added to that overlay inherits it — which silently cost zones both click and hover handling.

**Zones persist only on save, like pins.** `createZone` builds the marker but does not push it; `commitZone` (the editor's onSave) pushes a new one or `Object.assign`s onto the existing one, matching by **id** rather than reference because a redraw hands over a detached copy. So Cancel on a new zone discards it, and Cancel on an edit reverts. Redraw carries the editor's working copy (pending field edits included) into `redrawZone`, which reopens the editor on a copy with the new geometry — again committing nothing until save. Do not go back to mutating the state marker eagerly in `createZone`/`redrawZone`; that was the original bug (a cancelled new zone stayed, and a redraw dropped pending edits).

Zone labels are centred by default (`labelOffset` absent) or custom-placed (`labelOffset` set, relative to the anchor in natural px, seeded from the centroid so switching doesn't jump). A custom label opts back into pointer events (`ttrpgmap-zone-label--draggable`) and is a drag handle: dragging it runs under the `dragging-zone-label` interaction mode and persists the offset on release — a direct map gesture like a pin drag, committed immediately, not through the editor's save. Text size is the per-zone `textScale` (label font-size is `14 * textScale / zoom`, constant on screen). Both live in the editor's collapsible "Additional options" alongside alias, preview note, description, font, and text visibility. `zoneGeometry` owns the shared pieces: `zoneLabelPosition`, `zoneCentroidOffset`, `zoneFillOpacity`, and `buildZonePreviewSvg` (used by both the marker-list swatch and the editor preview so they can't drift).

The polygon's mousedown still bubbles to the map and starts a pan (zones have no shape drag handler). Panning therefore sets `hasDragged` (reset on pan start, set on pan move) so the trailing click is ignored — otherwise panning by grabbing a large zone would open its linked note on release. Pins don't need this because their own mousedown starts a marker-drag instead of a pan.

Text visibility resolves through three levels for every marker, zones included: the marker's own value, then the per-map setting (`MapState.textVisibility`), then the global default. `MapRenderer.getTextVisibility()` is the single resolver — pins and zones must both use it. Zone labels once skipped the per-map level, so an "Inherit" zone silently ignored the map setting. The zone editor is passed the resolved value so its "Text visibility" description can show what "Inherit" currently means (the pin editor and map-settings modal do the same).

### Inert markers during map-wide drawing

Whenever a drawing mode owns the map surface, existing markers must not be able to swallow clicks meant for the drawing. `MapRenderer.markersInert` is the single source of truth (true while measuring **or** drawing a zone) and drives three things:

- Pins get `ttrpgmap-marker-inert` (dimmed, `pointer-events: none`) and, importantly, have **no events attached at all** — `pointer-events` alone is not relied on.
- Zones get the same via `ttrpgmap-zone-layer--inert` on the layer, and skip `attachZoneEvents`.
- `ZoneDrawController` calls an `onDrawStateChange` hook when drawing starts and stops; that re-render is what applies and releases the state, so a new drawing mode must fire it or markers will stay stuck dim.

The zone being redrawn is a special case: it is **excluded from the render entirely** (`redrawingZoneId`), not merely dimmed, because a visible old outline sits exactly where its replacement is being drawn. That id is cleared when drawing ends (cancel included) and is never set if `start()` was refused.

Note `MeasurementController.updateMeasureMode()` toggles the same `ttrpgmap-marker-inert` class directly as a fast path instead of re-rendering, so the class name is shared between the two files — rename it in both.

### Rendering approach

`MapRenderer` extends `MarkdownRenderChild`. The map image and SVG overlay (for distance lines) live inside a CSS-transformed container (`translate + scale`). Markers render in a **separate overlay div** outside the scaled container to stay crisp at all zoom levels. Marker positions are calculated in screen coordinates via `toScreenCoords()` and updated on every pan/zoom change.

### Font Awesome & Game Icons

Icons are sourced from npm packages (`@iconify-json/fa6-solid`, `@iconify-json/game-icons`) rather than vendored SVG files. `scripts/build-icons.mjs` reads the Iconify JSON format, extracts viewBox and path data (including alias resolution), and produces `src/generated/fa-icons.ts` (~1,408 FA icons bundled inline) and `gi-icons.json` (~4,126 Game Icons loaded at runtime). Icons render as inline SVGs with `fill="currentColor"` for CSS color inheritance. The pin shape uses FA's `location-dot` icon.

### Settings navigation

`src/utils/settingsNav.ts` jumps from a modal into the plugin's own settings tab and pulse-highlights a target with the shared `ttrpgmap-setting-highlight` animation. `openPluginSettingsSection()` finds a section by heading text; `openTemplateInSettings()` finds a template row by its `data-template-id` (set in `renderTemplateManager`) and expands the containing folder first by *clicking the folder header*, so the manager's own collapsed-folder `WeakMap` state stays in sync. Both are used by the marker edit modal.

`pulseHighlight()` is exported and is the single implementation -- `MapSettingsModal.scrollToSetting()` calls it too, rather than keeping its own copy. **It must not rely on `animationend` alone:** under `prefers-reduced-motion: reduce` styles.css sets `animation: none` on the highlight class, so that event never fires and the class (and the grey background it paints) would stick forever. It clears on whichever comes first, the animation ending or a fallback timer sized to `HIGHLIGHT_DURATION_MS`, keeping both in sync with the 2.4s animation in styles.css. jsdom runs no CSS animations either, so `tests/utils/settingsNav.test.ts` covers exactly the reduced-motion path.

### Plugin refresh system

`TTRPGMapsPlugin` maintains a set of refresh callbacks. Active `MapRenderer` instances subscribe on load and unsubscribe on unload. When template changes are applied to markers, `triggerMapRefresh()` causes all active maps to reload state from disk and re-render.

### Test environment

Tests live in `tests/` (outside `src/` so the Obsidian review bot doesn't scan them). Tests run in jsdom. `tests/__mocks__/obsidian.ts` mocks the Obsidian API classes. `tests/__mocks__/obsidian-dom.ts` polyfills Obsidian's custom HTMLElement methods (`createDiv`, `createEl`, `empty`, `addClass`, `setText`). Coverage is scoped to `src/utils/`, `src/map/`, `src/types.ts`, `src/distance.ts`, and `src/DataManager.ts`.

When adding tests for a guard, confirm they actually fail if the guard is removed. The hot zone suites were checked that way: deleting the `shape === 'area'` skip in `applyToMarkers` fails 3 tests, dropping the largest-first zone sort fails 1, and allowing under-three-point shapes fails 1.

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

### Color swatches (`<input type="color">`)

Both color pickers (pin color and icon color) go through `createColorPicker()` and share the single class `ttrpgmap-color-swatch`. Don't fork a second class for one of them -- they drifted before and had to be re-unified. Three non-obvious constraints:

- **Specificity.** Obsidian core styles `input[type="color"]` and `input[type="color"]::-webkit-color-swatch` with attribute-selector specificity, which beats a bare `.class`. Plugin rules must qualify as `input[type='color'].ttrpgmap-color-swatch` or they silently lose.
- **One ring, on the pseudo-element.** Core already applies its own hover ring via `::-webkit-color-swatch:hover`. Adding a ring to the host input as well produces *two* glows, and since core sizes the host wider than the swatch (`width: calc(var(--swatch-width) + 4px)`), a `border-radius: 50%` on the host renders as an oblong. All hover/focus styling belongs on `::-webkit-color-swatch`, overriding core's rather than stacking on it. Size and shape come from core's own `--swatch-width` / `--swatch-height` / `--swatch-radius` variables.
- **An `<input>` clips its own shadow DOM.** The ring cannot overflow the host, so ancestor `overflow: visible`, margin, and host padding are all powerless to stop clipping. Room must be reserved *inside* the input: give the host an explicit square size and pad `::-webkit-color-swatch-wrapper` (currently 32px host, 5px wrapper padding, 22px swatch, 3px ring).

### Warning buttons

`styles.css` is injected app-wide, so never restyle `.mod-warning` directly -- it would recolor core Obsidian's own dialogs and other plugins. Add `ttrpgmap-btn-warning` alongside `mod-warning` on this plugin's buttons instead, styled as `button.ttrpgmap-btn-warning` so it outranks `.mod-warning` regardless of stylesheet order (themes load after plugins).
