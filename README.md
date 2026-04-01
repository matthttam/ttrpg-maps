# TTRPG Maps

Render interactive TTRPG maps from code blocks with markers, templates, and distance measurement tools.

An [Obsidian](https://obsidian.md/) plugin for tabletop RPG game masters who want to embed interactive maps directly in their notes. Place markers, measure distances, and organize map data alongside your campaign notes.

<!-- TODO: Add a screenshot or GIF showing the plugin in action -->
<!-- ![TTRPG Maps screenshot](docs/screenshot.png) -->

## Features

- **Interactive maps** - Embed any image as a pannable, zoomable map inside a note
- **Markers with templates** - Create reusable marker templates with custom colors, icons, shapes, and labels. Place markers on maps with a right-click
- **Distance measurement** - Calibrate a distance scale, then measure distances along multi-point paths
- **Marker list panel** - Browse, search, and navigate to markers from a sidebar panel
- **2,000+ icons** - Choose from Font Awesome and Game Icons libraries for marker icons
- **Pin and circle shapes** - Markers can render as directional pins or circles, with or without a base shape
- **Per-map settings** - Configure zoom limits, dimensions, and more per map
- **Sidecar storage** - Map state (markers, scale) is stored separately from note content, keeping your markdown clean

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

## Usage

### Creating a map

Add a `ttrpgmap` code block to any note:

````markdown
```ttrpgmap
image: maps/dungeon-level-1.png
height: 600px
width: 100%
```
````

The `image` field is the path to your map image relative to the vault root. All other fields are optional.

### Code block reference

| Field | Description | Default |
|---|---|---|
| `image` | Path to the map image (required) | - |
| `id` | Unique map identifier | Auto-generated from image path |
| `height` | Container height (e.g., `600px`, `80%`) | Scales to aspect ratio |
| `width` | Container width (e.g., `800px`, `100%`) | Scales to aspect ratio |
| `zoommin` | Minimum zoom percentage | `50` |
| `zoommax` | Maximum zoom percentage | `200` |
| `zoomstep` | Zoom step percentage | `10` |

### Navigating the map

- **Pan**: Click and drag
- **Zoom**: Scroll wheel, or use the +/- buttons in the top-left corner
- **Reset view**: Click the center button in the top-left corner

### Placing markers

1. Right-click anywhere on the map
2. Select a marker template from the context menu
3. The marker is placed at the clicked location

Right-click a marker to edit its properties or delete it. Drag a marker to reposition it.

### Measuring distances

1. Click the ruler button in the toolbar to calibrate
2. Click two points on the map and enter the real-world distance between them (e.g., "100 feet")
3. Click the measure button to start measuring
4. Click points along a path to see segment and total distances
5. Press **Escape** to finish

### Marker templates

Open **Settings** > **TTRPG Maps** to manage marker templates. Each template defines:

- Name, color, and icon
- Shape (pin or circle) and direction
- Text label placement
- Optional linked note

Individual markers can override any template property. Use the reset button in the marker edit modal to restore template defaults.

<!-- TODO: Add screenshot of the settings panel -->
<!-- ![Settings panel](docs/settings.png) -->

## Third-party libraries

This plugin bundles icons from the following sources:

- **[Font Awesome Free](https://fontawesome.com)** - Icons: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), Fonts: [SIL OFL 1.1](https://scripts.sil.org/OFL), Code: [MIT](https://opensource.org/licenses/MIT)
- **[Game Icons](https://game-icons.net)** - Icons: [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) by various authors ([full credits](https://game-icons.net/about.html))

## License

[MIT](LICENSE)
