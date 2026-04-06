# TTRPG Maps

[![Buy Me A Coffee](https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/matthttam)

Render interactive TTRPG maps from code blocks with markers, templates, and distance measurement tools.

An [Obsidian](https://obsidian.md/) plugin for tabletop RPG game masters who want to embed interactive maps directly in their notes. Place markers, measure distances, and organize map data alongside your campaign notes.

<img width="805" height="803" alt="image" src="https://github.com/user-attachments/assets/a915c5d3-41e5-46e0-b447-5577a4415174" />

## Features

- **Interactive maps** - Embed any image as a pannable, zoomable map inside a note with lock zoom/pan and fit-to-screen controls
- **Customizable markers** - Place markers with custom colors, icons (with rotation), shapes, and linked notes. Drag to reposition, right-click to edit, copy, or resize
- **Hover preview** - Hover a marker to see Obsidian's page preview of the linked note (or a custom preview note)
- **Reusable templates** - Create, duplicate, import, and export marker templates with collapsible folders. All sorted alphabetically
- **Distance measurement** - Calibrate a scale, then measure point-to-point (with live preview) or freehand distances with configurable rounding and decimal places
- **Visibility layers** - Assign markers to zoom-based layers so overview markers show when zoomed out and detail markers show when zoomed in
- **5,500+ icons** - Choose from Font Awesome (~1,400) and Game Icons (~4,100) with live search and rotation
- **Three marker shapes** - Pin (directional teardrop), circle, or hotspot (invisible until hovered)
- **Per-map and per-marker settings** - Override scale, zoom behavior, label placement, navigation mode, and hover preview at every level
- **Marker list panel** - Browse, locate, and manage markers from a collapsible sidebar
- **Import/export** - Export maps as ZIP bundles (with image) and import them on another vault. Import/export template sets
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

<img width="917" height="166" alt="image" src="https://github.com/user-attachments/assets/f9747481-3498-48c9-884d-b7b4e221eba0" />

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

<img width="87" height="255" alt="image" src="https://github.com/user-attachments/assets/128ba815-f5a6-474e-927a-c3931660e9a5" />

### 3. Place markers

1. Right-click anywhere on the map
2. Select a template from the context menu
3. Edit the marker's properties in the modal that opens
4. Click **Save**

Right-click a marker to edit, copy, resize, or delete it. Drag a marker to reposition it. Click a marker linked to a note to navigate there.

<img width="321" height="281" alt="image" src="https://github.com/user-attachments/assets/fd95d630-5796-497e-839c-34a875784f1f" />

### 4. Measure distances

1. Open the measurement panel (ruler icon, top-right)
2. **Calibrate**: Click two points and enter the real-world distance (e.g. "100 feet")
3. **Measure**: Click points along a path to see segment and total distances
4. **Freehand**: Click and drag to measure along curves
5. Press **Escape** or double-click to finish

Configure rounding in the measurement panel to snap distances to the nearest multiple.

<img width="240" height="194" alt="image" src="https://github.com/user-attachments/assets/658a3897-754b-4751-94eb-3edf5b98f189" />
<img width="803" height="624" alt="image" src="https://github.com/user-attachments/assets/5cfcdd20-8d77-4bbe-a943-4fe0faca4f65" />
<img width="800" height="793" alt="image" src="https://github.com/user-attachments/assets/cd25067e-1f9f-4c8d-8d4f-55f31f966307" />


### 5. Manage templates

Open **Settings** > **TTRPG Maps** to create and organize marker templates. Templates define default values for color, icon, shape, direction, and more. Use **Save & Update Markers** to push template changes to all existing markers that use it.

<img width="775" height="668" alt="image" src="https://github.com/user-attachments/assets/d29bc99d-f9e6-49d5-a4ba-531644bc2cfe" />
<img width="946" height="492" alt="image" src="https://github.com/user-attachments/assets/cacd2c91-8bad-4003-a683-7e775018a7f8" />

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

## Support

If you find this plugin useful, consider buying me a coffee!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/matthttam)

<img src="docs/qr-code.png" alt="Buy Me a Coffee QR Code" width="200" />

## License

[MIT](LICENSE)
