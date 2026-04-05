# TTRPG Maps

Render interactive TTRPG maps from code blocks with markers, templates, and distance measurement tools.

An [Obsidian](https://obsidian.md/) plugin for tabletop RPG game masters who want to embed interactive maps directly in their notes. Place markers, measure distances, and organize map data alongside your campaign notes.

<!-- TODO: screenshot or GIF of a map with markers and measurement lines -->

## Features

- **Interactive maps** - Embed any image as a pannable, zoomable map inside a note
- **Customizable markers** - Place markers with custom colors, icons, shapes, and linked notes. Drag to reposition, right-click to edit or copy
- **Reusable templates** - Create marker templates so every tavern, dungeon entrance, or NPC gets a consistent style. Organize templates in folders
- **Distance measurement** - Calibrate a scale, then measure point-to-point or freehand distances with optional rounding
- **Visibility layers** - Assign markers to zoom-based layers so overview markers show when zoomed out and detail markers show when zoomed in
- **5,500+ icons** - Choose from Font Awesome (~1,400) and Game Icons (~4,100) with live search
- **Three marker shapes** - Pin (directional teardrop), circle, or hotspot (invisible until hovered)
- **Per-map and per-marker settings** - Override scale, zoom behavior, and label placement at every level
- **Marker list panel** - Browse, locate, and manage markers from a collapsible sidebar
- **Sidecar storage** - Marker state lives in `.ttrpgmap/` files, keeping your markdown clean

For a complete breakdown of every feature, see the **[detailed feature list](docs/features.md)**.

## Installation

### From Community Plugins (recommended)

1. Open **Settings** > **Community plugins** > **Browse**
2. Search for **TTRPG Maps**
3. Click **Install**, then **Enable**

### Manual installation

1. Download `main.js`, `manifest.json`, `styles.css`, and `gi-icons.json` from the [latest release](https://github.com/matthttam/ttrpg-maps/releases/latest)
2. Create a folder at `<your-vault>/.obsidian/plugins/ttrpg-maps/`
3. Place the downloaded files into that folder
4. Restart Obsidian and enable the plugin in **Settings** > **Community plugins**

## Quick start

### 1. Create a map

Add an empty `ttrpgmap` code block to any note:

````markdown
```ttrpgmap
```
````

The rendered block displays a **Configure Map** button. Click it to select your map image and set optional fields like dimensions and zoom range.

<!-- TODO: screenshot of the empty placeholder with the Configure Map button -->

Alternatively, you can set the fields directly as text in the code block:

````markdown
```ttrpgmap
image: maps/dungeon-level-1.png
height: 600px
width: 100%
zoommin: 30
zoommax: 300
zoomstep: 15
```
````

See the [code block reference](docs/features.md#code-block-reference) for all available fields.

### 2. Navigate the map

- **Pan** - Click and drag
- **Zoom** - Scroll wheel, or use the +/- buttons (top-left)
- **Reset view** - Click the center button (top-left)

<!-- TODO: screenshot of map with zoom controls highlighted -->

### 3. Place markers

1. Right-click anywhere on the map
2. Select a template from the context menu
3. Edit the marker's properties in the modal that opens
4. Click **Save**

Right-click a marker to edit, copy, resize, or delete it. Drag a marker to reposition it. Click a marker linked to a note to navigate there.

<!-- TODO: screenshot of marker context menu -->

### 4. Measure distances

1. Open the measurement panel (ruler icon, top-right)
2. **Calibrate**: Click two points and enter the real-world distance (e.g. "100 feet")
3. **Measure**: Click points along a path to see segment and total distances
4. **Freehand**: Click and drag to measure along curves
5. Press **Escape** or double-click to finish

Configure rounding in the measurement panel to snap distances to the nearest multiple.

<!-- TODO: screenshot of measurement in action -->

### 5. Manage templates

Open **Settings** > **TTRPG Maps** to create and organize marker templates. Templates define default values for color, icon, shape, direction, and more. Use **Save & Update Markers** to push template changes to all existing markers that use it.

<!-- TODO: screenshot of template settings -->

## How data is stored

| Data | Location | Managed by |
|---|---|---|
| Map config (image, zoom, dimensions) | Code block in your markdown file | Plugin writes back on settings change |
| Markers, scale, layers, rounding | `.ttrpgmap/{mapId}.json` sidecar files | Plugin (debounced 300ms saves) |
| Global settings and templates | `.obsidian/plugins/ttrpg-maps/data.json` | Obsidian `loadData`/`saveData` |

Sidecar files keep marker data separate from note content. You can safely commit them to version control or sync them across devices.

## Third-party libraries

This plugin bundles icons from the following sources:

- **[Font Awesome Free](https://fontawesome.com)** - Icons: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), Fonts: [SIL OFL 1.1](https://scripts.sil.org/OFL), Code: [MIT](https://opensource.org/licenses/MIT)
- **[Game Icons](https://game-icons.net)** - Icons: [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) by various authors ([full credits](https://game-icons.net/about.html))

## License

[MIT](LICENSE)
