# Detailed Feature List

A comprehensive reference for every feature in the TTRPG Maps plugin.

## Table of Contents

- [Map Rendering and Navigation](#map-rendering-and-navigation)
- [Markers](#markers)
  - [Placing Markers](#placing-markers)
  - [Editing Markers](#editing-markers)
  - [Marker Interactions on the Map](#marker-interactions-on-the-map)
  - [Copy Mode](#copy-mode)
  - [Resize Mode](#resize-mode)
- [Marker Shapes and Visuals](#marker-shapes-and-visuals)
  - [Pin Shapes](#pin-shapes)
  - [Icons](#icons)
  - [Colors](#colors)
  - [Labels](#labels)
  - [Direction](#direction)
  - [Scale and Zoom Behavior](#scale-and-zoom-behavior)
- [Marker Templates](#marker-templates)
  - [Managing Templates](#managing-templates)
  - [Template Folders](#template-folders)
  - [Applying Template Changes](#applying-template-changes)
- [Distance Measurement](#distance-measurement)
  - [Calibration](#calibration)
  - [Point-to-Point Measurement](#point-to-point-measurement)
  - [Freehand Measurement](#freehand-measurement)
  - [Rounding](#rounding)
  - [Decimal Places](#decimal-places)
- [Visibility Layers](#visibility-layers)
- [Marker List Panel](#marker-list-panel)
- [Map Settings](#map-settings)
- [Global Settings](#global-settings)
- [Code Block Reference](#code-block-reference)
- [Context Menus](#context-menus)
- [Keyboard and Mouse Reference](#keyboard-and-mouse-reference)
- [Data Storage](#data-storage)

---

## Map Rendering and Navigation

Maps are rendered from `ttrpgmap` code blocks in your notes. The code block specifies an image path and optional settings. The plugin renders the image inside an interactive container with pan and zoom.

<!-- TODO: screenshot of a rendered map with the zoom controls visible -->

**Zoom controls** appear in the top-left corner:
- **+** button zooms in by the configured step
- **-** button zooms out by the configured step
- **Center** button resets pan and zoom to the initial view

The current zoom level is displayed as a percentage between the buttons.

**Panning**: Click and drag anywhere on the map background to pan. The cursor changes from "grab" to "grabbing" while panning.

**Zooming**: Use the scroll wheel to zoom in and out. Zoom is constrained to the configured min/max range.

---

## Markers

### Placing Markers

Right-click anywhere on the map to open the context menu. Select a template to place a marker at that location.

<!-- TODO: screenshot of the right-click context menu showing template options -->

- The **Default** template is always available
- Custom templates appear as additional menu items
- Templates organized in folders appear in submenus
- If the map has multiple layers, each template expands into a submenu to choose the target layer

After selecting a template, the **marker edit modal** opens so you can customize the marker before saving.

### Editing Markers

The marker edit modal lets you configure every aspect of a marker.

<!-- TODO: screenshot of the marker edit modal -->

| Field | Description |
|---|---|
| **Template** | Which template this marker is based on |
| **Note link** | Link to a vault note (supports `#headings`, `#^block-ids`, and `\|aliases`) |
| **Description** | Additional text shown in the marker label and list tooltip |
| **Pin shape and direction** | Choose pin/circle/hotspot and which direction the pin points |
| **Icon** | Search and select from 5,500+ icons |
| **Icon color** | Color of the icon (independent of pin color) |
| **Pin color** | Background color of the pin or circle shape |
| **Text placement** | Where the label appears relative to the marker (above/below/left/right) |
| **Marker size** | Override the map-level marker scale (toggle to enable, slider 25-300%) |
| **Scale to zoom** | Inherit / Screen-constant / Fixed to map |
| **Text size** | Override the map-level text scale (toggle to enable, slider 25-300%) |
| **Text scale to zoom** | Inherit / Screen-constant / Fixed to map |
| **Layer** | Assign to a visibility layer (only shown if multiple layers exist) |

Each field has a **reset button** that restores the value from the marker's template.

A **live preview** in the modal shows how the marker will look as you change settings.

### Marker Interactions on the Map

<!-- TODO: screenshot showing a marker being dragged -->

| Action | Behavior |
|---|---|
| **Click** (marker with note link) | Navigate to the linked note |
| **Drag** | Reposition the marker. Position is saved on release |
| **Right-click** | Open the marker context menu (Edit, Copy, Resize Marker, Resize Text, Delete) |
| **Alt + Scroll** | Quick-resize the marker without opening resize mode |

### Copy Mode

Right-click a marker and choose **Copy Marker** to enter copy mode.

<!-- TODO: screenshot of copy mode with the ghost preview following the cursor -->

- The cursor changes to a copy icon
- A ghost preview of the marker follows the cursor
- Click on the map to place the copy at that position
- The new marker has all the same properties as the original (except position and ID)
- Cancel with **Escape**, **right-click**, or any **keypress**

### Resize Mode

Right-click a marker and choose **Resize Marker** or **Resize Text** to enter resize mode.

<!-- TODO: screenshot of resize mode showing the drag handle with scale label -->

- A drag handle appears next to the marker with a grip icon, scale readout (e.g. "1.50x"), and a label ("Marker" or "Text")
- Drag the handle left or right to scale up or down (range 0.1x - 5.0x)
- The handle positions itself to avoid overlapping the marker label
- Click outside the handle to commit the new scale
- Press **Escape** to cancel and revert to the original size

---

## Marker Shapes and Visuals

### Pin Shapes

Markers support three base shapes:

<!-- TODO: screenshot showing all three shapes side by side -->

| Shape | Description |
|---|---|
| **Pin** | Traditional teardrop/location marker. Points in a configurable direction. Icon renders inside the pin |
| **Circle** | Circular background with centered anchor. Icon renders inside |
| **Hotspot** | Invisible by default. Shows a dashed circle outline on hover. Useful for clickable regions without visual clutter |

Set `Use Pin Shape` to off in the marker edit modal to render the icon **standalone** (no pin or circle background). The icon renders at full size directly on the map.

### Icons

Over 5,500 icons are available:

- **~1,400 Font Awesome** icons (bundled inline for fast loading)
- **~4,100 Game Icons** (loaded at runtime)

<!-- TODO: screenshot of the icon search dropdown -->

Type in the icon field to search by name. The dropdown shows a preview, the icon name, and the source library (FA or Game Icons). Icons render as inline SVGs with `fill="currentColor"` for CSS color inheritance.

### Colors

Each marker has two independent color settings:

- **Pin/shape color** - The background color of the pin, circle, or hotspot outline
- **Icon color** - The color of the icon inside the shape

Both use a color picker.

### Labels

Markers can display a text label with a **title** (from the linked note name or alias) and a **description**.

<!-- TODO: screenshot of a marker with a label showing title and description -->

Label placement options:
- **Above** - Label appears above the marker
- **Below** - Label appears below the marker
- **Left** - Label appears to the left
- **Right** - Label appears to the right

Labels have a dark semi-transparent background with white text. Titles use ellipsis for overflow; descriptions wrap to multiple lines.

### Direction

Pin-shaped markers can point in four directions:

| Direction | Effect |
|---|---|
| **Down** (default) | Pin points downward |
| **Up** | Pin rotates 180 degrees to point upward |
| **Left** | Pin rotates 90 degrees to point left |
| **Right** | Pin rotates -90 degrees to point right |

The icon inside the pin counter-rotates to stay upright. Standalone icons (no pin shape) are not affected by direction.

### Scale and Zoom Behavior

Marker and text size follow a three-tier hierarchy:

1. **Per-marker override** (set in marker edit modal)
2. **Per-map override** (set in map settings modal)
3. **Global default** (set in plugin settings)

Each level can also configure **zoom behavior**:

| Mode | Behavior |
|---|---|
| **Screen-constant** | Marker stays the same size on screen regardless of zoom level |
| **Fixed to map** | Marker scales proportionally with the map as you zoom in and out |
| **Inherit** | Uses the setting from the next level up |

---

## Marker Templates

### Managing Templates

Open **Settings** > **TTRPG Maps** to manage templates.

<!-- TODO: screenshot of the template manager in settings -->

- **Add Template** - Creates a new template with default values
- **Add Folder** - Creates a folder to organize templates
- Each template row shows its name and a colored preview icon
- Click a template to open its edit modal

The template edit modal has the same fields as the marker edit modal (pin shape, icon, colors, text placement, etc.). A **red asterisk** appears next to fields that have been changed since the last save.

A built-in **Default** template is always present and cannot be deleted (but can be edited or reset to factory settings).

### Template Folders

<!-- TODO: screenshot of template folders in settings -->

Templates can be organized into folders:
- Drag templates into or out of folders
- Folders appear as submenus in the map right-click context menu
- Rename or delete folders from the template manager
- Deleting a folder moves its templates to the top level

### Applying Template Changes

When editing a template, two save options are available:

- **Save** - Saves the template. Existing markers are not affected
- **Save & Update Markers** - Saves the template and pushes changes to all markers across all maps that use this template

A confirmation dialog lists the fields that will be updated and shows how many markers will be affected. After applying, a notice reports the number of updated markers (e.g. "Updated 12 markers").

Individual marker overrides are preserved. Only fields that match the old template value are updated.

---

## Distance Measurement

The measurement panel is accessed via the **ruler icon** button in the top-right area of the map.

<!-- TODO: screenshot of the measurement panel expanded -->

### Calibration

Calibration sets the distance scale for the map.

1. Click the **Calibrate** button in the measurement panel
2. The cursor changes to a crosshair
3. Click two points on the map (a dashed orange line is drawn between them)
4. A modal asks how many units the line represents and what the unit label is (e.g. "100", "feet")
5. Click **Save Scale**

The scale is saved per-map and persists across sessions. You must calibrate before measuring.

<!-- TODO: screenshot of the calibration modal -->

### Point-to-Point Measurement

1. Click the **Measure** button in the measurement panel
2. Click a point on the map to start
3. A **preview line** follows the cursor from the last point, showing the distance in real-time
4. Click to commit the point and start the next segment
5. Each committed segment displays its distance in the configured units
6. A **total distance** readout appears at the top of the map
7. Double-click, right-click, or press **Escape** to finish

The live preview is useful for finding a specific distance from a point before committing.

<!-- TODO: screenshot showing a multi-point measurement path with segment labels -->

### Freehand Measurement

1. Click the **Freehand** button in the measurement panel
2. Click and drag to draw a curve on the map
3. Release to end a stroke (its distance label appears at the midpoint)
4. Start additional strokes by clicking and dragging again
5. The total distance readout updates with each stroke
6. Double-click, right-click, or press **Escape** to finish

<!-- TODO: screenshot showing a freehand measurement curve -->

### Rounding

The measurement panel includes rounding controls:

| Mode | Behavior |
|---|---|
| **None** | Distances shown as calculated |
| **Closest** | Round to the nearest multiple |
| **Up** | Round up to the next multiple |
| **Down** | Round down to the previous multiple |

When a rounding mode is selected, a **multiple** input appears (e.g. "5" to round to the nearest 5 feet). A **Raw** checkbox also appears - when checked, all distance outputs include the raw (unrounded) value in parentheses after the rounded value. For example: `40 (39) ft`.

Rounding settings are saved per-map.

### Decimal Places

A **Decimal places** input (0-6, default 0) controls how many decimal places are shown in all distance outputs. This applies to both rounded and raw values, segment labels, the total display, and the finish notice.

Examples with 0 decimal places: `40 ft`. With 1: `40.0 ft`. With 3 and no rounding: `39.213 ft`.

### Measurement Behavior

During measurement, markers are dimmed and non-interactive. Hovering near a marker while measuring highlights it for snapping.

---

## Visibility Layers

Layers control which markers are visible at different zoom levels.

<!-- TODO: screenshot of map settings showing the layers section -->

Each layer defines a zoom range:
- **Minimum zoom %** - Markers hidden below this zoom (blank for no lower limit)
- **Maximum zoom %** - Markers hidden above this zoom (blank for no upper limit)

Every map has a **Default Marker** layer that is always visible and cannot be deleted (but its zoom range can be changed or reset).

### Use cases

- **Overview layer** (20%-60%): Show city/region markers when zoomed out
- **Detail layer** (80%-200%): Show building/room markers when zoomed in
- **Always-visible layer** (no limits): Important landmarks visible at all zoom levels

### Managing layers

- Add layers from the **Map Settings** modal (gear button)
- Edit a layer's zoom range with the pencil icon
- Delete custom layers with the trash icon (markers are moved to the default layer)
- Reset the default layer to "always visible" with the reset icon

### Assigning markers to layers

The marker edit modal shows a **Layer** dropdown when the map has more than one layer. Markers on hidden layers appear dimmed in the marker list with an eye-off icon.

---

## Marker List Panel

The marker list is a collapsible panel in the bottom-left corner of the map.

<!-- TODO: screenshot of the marker list panel expanded -->

- **Toggle** - Click the list icon to show or hide the panel
- **Pin** - Click the pin icon to keep the panel visible (otherwise it hides when the mouse leaves)

Each row in the list shows:
- A **mini preview** of the marker's pin/icon
- The **marker name** (from the linked note, or "Unnamed")
- An **edit button** (pencil icon) to open the marker edit modal
- A **delete button** (trash icon) to remove the marker
- A **hidden indicator** (eye-off icon) if the marker is outside the current zoom range

Interactions:
- **Click a row** to pan the map and center on that marker
- **Hover a row** to highlight the corresponding marker on the map with a bounce animation
- **Hover the marker name** to see the full description in a tooltip

The list is sorted alphabetically and scrolls independently from the map (max height 250px).

---

## Map Settings

Access map settings via the **gear button** in the bottom-right corner of the map.

<!-- TODO: screenshot of the map settings modal -->

### Image

- **Image path** - Change the map image. Autocomplete searches vault files. The native image dimensions are displayed below the input
- **Map ID** - Unique identifier for this map's sidecar data. Auto-generated from the image path by default. Use different IDs to have separate marker sets on the same image

### Sizing

- **Height** - Display height (e.g. `600px`, `80%`). Blank for auto-scaling based on aspect ratio
- **Width** - Display width (e.g. `800px`, `100%`). Blank for auto-scaling based on aspect ratio

### Zoom

- **Min/Max zoom** - Constrains the zoom range (percentages)
- **Zoom step** - Increment per scroll or button click

### Marker scale (per-map override)

- **Toggle** to enable a map-level size override (when off, uses the global default)
- **Slider** to set the scale (25-300%)
- Description shows the effective value and the global default for comparison

### Scale to zoom (per-map override)

- **Inherit** - Use the global default
- **Screen-constant** - Markers stay the same screen size at all zoom levels
- **Fixed to map** - Markers scale proportionally with zoom

### Text scale and text scale to zoom

Same controls as marker scale, but for label text.

### Layers

- **Add Layer** button to create a new visibility layer
- Each layer shows its name, zoom range, and edit/delete buttons

---

## Global Settings

Access via **Settings** > **TTRPG Maps**.

<!-- TODO: screenshot of the global settings tab -->

### Markers section

- **Default Marker Scale** - Size of markers on all maps (slider, 25-300%, default 100%)
- **Scale Markers to Zoom** - Screen-constant or Fixed to map

### Text section

- **Default Text Scale** - Size of marker labels on all maps (slider, 25-300%, default 100%)
- **Scale Text to Zoom** - Screen-constant or Fixed to map

### Marker Templates section

The full template manager (see [Marker Templates](#marker-templates)).

---

## Code Block Reference

Maps are defined in fenced code blocks with the `ttrpgmap` language tag:

````markdown
```ttrpgmap
image: maps/world.png
id: world-map
height: 600px
width: 100%
zoommin: 30
zoommax: 300
zoomstep: 15
```
````

| Field | Required | Description | Default |
|---|---|---|---|
| `image` | Yes | Path to the map image relative to the vault root | - |
| `id` | No | Unique map identifier. Maps with different IDs have separate marker sets | Auto-generated from image path |
| `height` | No | Container height. Accepts `px` or `%` values | Auto-scales to aspect ratio |
| `width` | No | Container width. Accepts `px` or `%` values | Auto-scales to aspect ratio |
| `zoommin` | No | Minimum zoom percentage | `50` |
| `zoommax` | No | Maximum zoom percentage | `200` |
| `zoomstep` | No | Zoom step per scroll or button click | `10` |

Keys are case-insensitive. Lines starting with `#` are treated as comments. Changes made in the map settings modal are written back to the code block automatically.

---

## Context Menus

### Map background (right-click)

<!-- TODO: screenshot of map context menu -->

| Item | Action |
|---|---|
| **Place Marker** | Places a marker using the default template |
| *Template name* | Places a marker using that template |
| *Folder name* > *Template* | Templates in folders appear as submenus |
| **Edit Templates** | Opens plugin settings to the template manager |

When the map has multiple layers, each template entry expands into a submenu to select the target layer.

### Marker (right-click)

<!-- TODO: screenshot of marker context menu -->

| Item | Action |
|---|---|
| **Edit** | Open the marker edit modal |
| **Copy Marker** | Enter copy mode with a ghost preview |
| **Resize Marker** | Enter interactive marker resize mode |
| **Resize Text** | Enter interactive text resize mode |
| **Delete** | Remove the marker immediately |

---

## Keyboard and Mouse Reference

### Mouse

| Input | Context | Action |
|---|---|---|
| **Click + drag** | Map background | Pan the map |
| **Scroll wheel** | Map | Zoom in/out |
| **Right-click** | Map background | Open map context menu |
| **Right-click** | Marker | Open marker context menu |
| **Click** | Marker with note | Navigate to the linked note |
| **Click + drag** | Marker | Reposition the marker |
| **Alt + Scroll** | Over a marker | Quick-resize the marker |
| **Click** | During measurement | Place a measurement point |
| **Click + drag** | During freehand | Draw a measurement stroke |
| **Double-click** | During measurement/freehand | Finish measuring and show total |
| **Right-click** | During measurement | Finish measuring |

### Keyboard

| Key | Context | Action |
|---|---|---|
| **Escape** | Drawing/measuring | Cancel the current drawing or measurement |
| **Escape** | Resize mode | Cancel resize and revert to original scale |
| **Escape** | Copy mode | Cancel copy mode |
| **Any key** | Copy mode | Cancel copy mode |

---

## Data Storage

The plugin uses three storage locations:

### Code block (in your markdown file)

Static map configuration: image path, dimensions, zoom settings. The plugin writes changes back to the code block when you modify settings through the map settings modal.

### Sidecar files (`.ttrpgmap/{mapId}.json`)

Mutable per-map state, including:
- All marker positions and properties
- Distance scale calibration
- Rounding mode, multiple, raw toggle, and decimal places
- Per-map marker and text scale overrides
- Layer definitions and zoom ranges

Saves are debounced (300ms) for performance. These files can be committed to version control or synced across devices.

### Plugin data (`data.json`)

Global settings managed by Obsidian's built-in persistence:
- Default marker and text scale
- Default zoom behavior
- All marker templates and template folders
