# Detailed Feature List

A comprehensive reference for every feature in the TTRPG Maps plugin.

## Table of Contents

- [Map Rendering and Navigation](#map-rendering-and-navigation)
- [Markers](#markers)
  - [Placing Markers](#placing-markers)
  - [Editing Markers](#editing-markers)
  - [Marker Interactions on the Map](#marker-interactions-on-the-map)
  - [Hover Preview](#hover-preview)
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
  - [Import and Export Templates](#import-and-export-templates)
  - [Restore Default Templates](#restore-default-templates)
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
  - [Data Management](#data-management)
- [Code Block Reference](#code-block-reference)
- [Context Menus](#context-menus)
- [Keyboard and Mouse Reference](#keyboard-and-mouse-reference)
- [Import and Export](#import-and-export)
- [Data Storage](#data-storage)

---

## Map Rendering and Navigation

Maps are rendered from `ttrpgmap` code blocks in your notes. The code block specifies an image path and optional settings. The plugin renders the image inside an interactive container with pan and zoom.

![Marker Creation](https://github.com/user-attachments/assets/d919bc5f-b857-4d03-9383-3a66a5a1f295)


**Zoom controls** appear in the top-left corner:

- **+** button zooms in by the configured step
- **-** button zooms out by the configured step
- **Center** button resets pan and zoom to the initial view
- **Fit to Screen** button sets the zoom level so the entire map fits within the viewport and centers it
- **Lock Zoom** toggle - prevents zooming. When active, scroll wheel passes through to page scroll
- **Lock Pan** toggle - prevents panning by click-and-drag

Lock states persist across page reloads (saved per-map).

The current zoom level is displayed as a percentage between the buttons.

**Panning**: Click and drag anywhere on the map background to pan. The cursor changes from "grab" to "grabbing" while panning.

**Zooming**: Use the scroll wheel to zoom in and out. Zoom is constrained to the configured min/max range.

---

## Markers

### Placing Markers

Right-click anywhere on the map to open the context menu. Select a template to place a marker at that location.


- The **Default** template is always available
- Custom templates appear as additional menu items
- Templates organized in folders appear in submenus
- If the map has multiple layers, each template expands into a submenu to choose the target layer

After selecting a template, the **marker edit modal** opens so you can customize the marker before saving.

### Editing Markers

The marker edit modal lets you configure every aspect of a marker.

<img width="1456" height="1660" alt="image" src="https://github.com/user-attachments/assets/9211f13d-a721-4e09-9919-8a4092428e1e" />

| Field                       | Description                                                             |
| --------------------------- | ----------------------------------------------------------------------- |
| **Template**                | Which template this marker is based on                                  |
| **Note link**               | Link to a vault note (supports `#headings` and `#^block-ids`)           |
| **Alias**                   | Display name shown on the map instead of the note filename              |
| **Preview Note**            | Alternate note shown in hover preview (blank uses the linked note)      |
| **Description**             | Additional text shown in the marker label and list tooltip              |
| **Pin shape and direction** | Choose pin/circle/hotspot and which direction the pin points            |
| **Icon**                    | Search and select from 5,500+ icons                                     |
| **Icon rotation**           | Rotate the icon (slider 0-359 degrees)                                  |
| **Icon color**              | Color of the icon (independent of pin color)                            |
| **Pin color**               | Background color of the pin or circle shape                             |
| **Text placement**          | Where the label appears relative to the marker (above/below/left/right) |
| **Marker size**             | Override the map-level marker scale (toggle to enable, slider 25-300%)  |
| **Scale to zoom**           | Inherit / Screen-constant / Fixed to map                                |
| **Text size**               | Override the map-level text scale (toggle to enable, slider 25-300%)    |
| **Text scale to zoom**      | Inherit / Screen-constant / Fixed to map                                |
| **Layer**                   | Assign to a visibility layer (only shown if multiple layers exist)      |

Each visual field (icon, rotation, color, pin, text placement) has its own **reset button** that restores the value from the marker's template. Reset buttons are hidden when the marker's template no longer exists.

A **Reset to template** button resets all visual properties to the template defaults with a confirmation prompt. The reset is applied in the modal so you can review the changes before saving. This button is disabled when the marker's template no longer exists.

**Size overrides** (marker size, scale to zoom, text size, text scale to zoom) are in a collapsible section that defaults to collapsed. Click the chevron to expand. The expanded/collapsed state persists within the session.

A **live preview** in the modal shows how the marker will look as you change settings. Overlapping markers bump to the front on hover.

A marker must have either a pin shape or an icon. Saving is blocked if both are removed, and the preview shows a "No icon set" placeholder.

The modal layout is responsive - on narrow screens (below 880px), the preview moves below the settings instead of beside them.

### Marker Interactions on the Map

![Marker Dragging](https://github.com/user-attachments/assets/86303499-ede1-4408-b424-a876a32a396c)

| Action                                | Behavior                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| **Click** (marker with note link)     | Navigate to the linked note (new tab or current, configurable)                    |
| **Hover** (if hover preview enabled)  | Show Obsidian's page preview popover for the linked note (or custom preview note) |
| **Drag**                              | Reposition the marker. Position is saved on release                               |
| **Right-click**                       | Open the marker context menu (Edit, Copy, Resize Marker, Resize Text, Delete)     |
| **Alt + Scroll** (over pin)           | Quick-resize the marker's pin/icon scale                                          |
| **Alt + Scroll** (over label)         | Quick-resize the marker's text scale                                              |
| **Shift + Alt + Scroll** (over pin)   | Adjust the map-level marker scale for all markers                                 |
| **Shift + Alt + Scroll** (over label) | Adjust the map-level text scale for all markers                                   |

### Hover Preview

When enabled, hovering over a marker with a linked note shows Obsidian's built-in page preview popover.

- Controlled by a global toggle (Settings > TTRPG Maps > Navigation > Show Hover Preview) and a per-map override (Map Settings > Hover Preview)
- By default, the preview shows the marker's linked note
- The **Preview Note** field on a marker allows specifying a different note for the preview, including `#heading` and `#^block` references to show specific sections
- If the preview note file doesn't exist, the plugin falls back to the linked note
- The preview has a 300ms delay to avoid triggering during quick interactions
- Holding **Alt** suppresses the preview. Pressing Alt while a preview is shown dismisses it
- The preview is automatically dismissed when you start dragging or click-and-hold a marker
- The preview does not interfere with click-to-navigate or drag-to-reposition

### Copy Mode

Right-click a marker and choose **Copy Marker** to enter copy mode.

![Marker Copy](https://github.com/user-attachments/assets/085ef656-d198-4240-ae5e-56793c5c32d5)

- The cursor changes to a copy icon
- A ghost preview of the marker follows the cursor
- Click on the map to place the copy at that position
- The new marker has all the same properties as the original (except position and ID)
- Cancel with **Escape**, **right-click**, or any **keypress**

### Resize Mode

Right-click a marker and choose **Resize Marker** or **Resize Text** to enter resize mode.

![Marker Resize](https://github.com/user-attachments/assets/ea145bfd-c64f-4670-9e42-3d47a94287d1)

- A drag handle appears next to the marker with a grip icon, scale readout (e.g. "1.50x"), and a label ("Marker" or "Text")
- Drag the handle left or right to scale up or down (range 0.1x - 5.0x)
- The handle positions itself to avoid overlapping the marker label
- Click outside the handle to commit the new scale
- Press **Escape** to cancel and revert to the original size

---

## Marker Shapes and Visuals

### Pin Shapes

Markers support four base shapes:

![Marker Types](https://github.com/user-attachments/assets/40477128-4331-4af3-b5dc-56490a558126)

| Shape         | Description                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Pin**       | Traditional teardrop/location marker. Points in a configurable direction. Icon renders inside the pin             |
| **Circle**    | Circular background with centered anchor. Icon renders inside                                                     |
| **Hotspot**   | Invisible by default. Shows a dashed circle outline on hover. Useful for clickable regions without visual clutter |
| **Icon Only** | Turning off the marker uses the selected icon as the pin shape.                                                   |

Set `Use Pin Shape` to off in the marker edit modal to render the icon **standalone** (no pin or circle background). The icon renders at full size directly on the map.

### Icons

Over 5,500 icons are available:

- **~1,400 Font Awesome** icons (bundled inline for fast loading)
- **~4,100 Game Icons** (loaded at runtime)

![Icon Listing](https://github.com/user-attachments/assets/24898abe-a34c-460d-ad9c-63ac13c629a1)

Type in the icon field to search by name (up to 100 results). The dropdown shows a preview, the icon name, and the source library (FA or Game Icons). Icons render as inline SVGs with `fill="currentColor"` for CSS color inheritance.

Each icon can be **rotated** (0-359 degrees) via a slider and text input. Rotation is set per-marker or per-template and appears in all previews (map, marker list, template list, edit modal).

### Colors

Each marker has two independent color settings:

- **Pin/shape color** - The background color of the pin, circle, or hotspot outline
- **Icon color** - The color of the icon inside the shape

Both use a color picker.

### Labels

Markers can display a text label with a **title** (from the linked note name or alias) and a **description**.

<img width="313" height="303" alt="image" src="https://github.com/user-attachments/assets/224cb6ee-7083-4176-bddb-5d8f648d774e" />

Label placement options:

- **Above** - Label appears above the marker
- **Below** - Label appears below the marker
- **Left** - Label appears to the left
- **Right** - Label appears to the right

Labels have a dark semi-transparent background with white text. Titles use ellipsis for overflow; descriptions wrap to multiple lines.

### Direction

Pin-shaped markers can point in four directions:

| Direction          | Effect                                  |
| ------------------ | --------------------------------------- |
| **Down** (default) | Pin points downward                     |
| **Up**             | Pin rotates 180 degrees to point upward |
| **Left**           | Pin rotates 90 degrees to point left    |
| **Right**          | Pin rotates -90 degrees to point right  |

The icon inside the pin counter-rotates to stay upright. Standalone icons (no pin shape) are not affected by direction.

### Scale and Zoom Behavior

Marker and text size follow a three-tier hierarchy:

1. **Per-marker override** (set in marker edit modal)
2. **Per-map override** (set in map settings modal)
3. **Global default** (set in plugin settings)

Each level can also configure **zoom behavior**:

| Mode                | Behavior                                                         |
| ------------------- | ---------------------------------------------------------------- |
| **Screen-constant** | Marker stays the same size on screen regardless of zoom level    |
| **Fixed to map**    | Marker scales proportionally with the map as you zoom in and out |
| **Inherit**         | Uses the setting from the next level up                          |

---

## Marker Templates

### Managing Templates

Open **Settings** > **TTRPG Maps** to manage templates.

<img width="1185" height="868" alt="image" src="https://github.com/user-attachments/assets/0a69b4b0-e31e-4b12-ae6e-98806ba8f685" />

- **Add Template** - Opens the template edit modal immediately with the name field focused and selected. On save the template is created; on cancel nothing is added
- **Add Folder** - Creates a folder with inline rename
- **Duplicate** - Copy icon on each template row creates a copy with "(copy)" suffix
- Each template row shows its name and a colored preview icon (including rotation)
- Click a template to open its edit modal
- All templates, folders, and their contents are sorted alphabetically

The template edit modal has the same fields as the marker edit modal (pin shape, icon, colors, text placement, etc.). A **red asterisk** appears next to fields that have been changed since the last save.

A built-in **Default** template is always present and cannot be deleted (but can be edited or reset to factory settings).

### Template Folders

<img width="1185" height="868" alt="image" src="https://github.com/user-attachments/assets/a28ef3b1-1b94-4dcb-9d3f-d29e5b7057f0" />

Templates can be organized into folders:

- Drag templates into or out of folders
- Folders appear as submenus in the map right-click context menu (sorted alphabetically)
- Click a folder header or its chevron to collapse/expand it
- Rename folders inline by clicking the pencil icon
- Deleting a folder moves its templates to the top level

### Applying Template Changes

When editing a template, two save options are available:

- **Save** - Saves the template. Existing markers are not affected
- **Save & Update Markers** - Saves the template and pushes changes to all markers across all maps that use this template

A confirmation dialog lists the fields that will be updated and shows how many markers will be affected. After applying, a notice reports the number of updated markers (e.g. "Updated 12 markers").

Individual marker overrides are preserved. Only fields that match the old template value are updated.

### Import and Export Templates

The template manager header includes **Import** and **Export** buttons:

- **Export** - Downloads all templates and folders as a `ttrpg-maps-templates.json` file. The file includes the plugin version for future compatibility
- **Import** - Opens a file picker. Imported templates receive new IDs to avoid collisions. Duplicate template names get a numbered suffix (e.g. "Tavern (2)"). Duplicate folder names are skipped. The built-in Default template is not imported

### Restore Default Templates

A **Restore Defaults** button resets all templates and folders to the built-in defaults. A confirmation dialog warns that custom templates will be lost.

---

## Distance Measurement

The measurement panel is accessed via the **ruler icon** button in the top-right area of the map.

<img width="341" height="287" alt="image" src="https://github.com/user-attachments/assets/0fcb9f41-1a94-4b8c-95b8-b0f133016fca" />

### Calibration

Calibration sets the distance scale for the map.

1. Click the **Calibrate** button in the measurement panel
2. The cursor changes to a crosshair
3. Click two points on the map (a dashed orange line is drawn between them)
4. A modal asks how many units the line represents and what the unit label is (e.g. "100", "feet")
5. Click **Save Scale**

The scale is saved per-map and persists across sessions. You must calibrate before measuring. A zero-length calibration line (clicking the same point twice) is rejected with a notice. Clicking **Cancel** or closing the calibration modal clears the drawn line and returns to calibration mode.

<img width="849" height="642" alt="image" src="https://github.com/user-attachments/assets/a7ac6506-6ff6-4d9e-921a-b609d560d6b9" />

### Point-to-Point Measurement

1. Click the **Measure** button in the measurement panel
2. Click a point on the map to start
3. A **preview line** follows the cursor from the last point, showing the distance in real-time
4. Click to commit the point and start the next segment
5. Each committed segment displays its distance in the configured units
6. A **total distance** readout appears at the top of the map
7. Double-click, right-click, or press **Escape** to finish

The live preview is useful for finding a specific distance from a point before committing.

<img width="582" height="385" alt="image" src="https://github.com/user-attachments/assets/90b84ad6-1af2-4275-a51f-2f5fee6fc628" />

### Freehand Measurement

1. Click the **Freehand** button in the measurement panel
2. Click and drag to draw a curve on the map
3. Release to end a stroke (its distance label appears at the midpoint)
4. Start additional strokes by clicking and dragging again
5. The total distance readout updates with each stroke
6. Double-click, right-click, or press **Escape** to finish

![Measuring Free Hand](https://github.com/user-attachments/assets/abfbd0f7-a0aa-4a60-a444-36f87b373fa6)

### Rounding

The measurement panel includes rounding controls:

| Mode        | Behavior                            |
| ----------- | ----------------------------------- |
| **None**    | Distances shown as calculated       |
| **Closest** | Round to the nearest multiple       |
| **Up**      | Round up to the next multiple       |
| **Down**    | Round down to the previous multiple |

When a rounding mode is selected, a **multiple** input appears (e.g. "5" to round to the nearest 5 feet). A **Raw** checkbox also appears - when checked, all distance outputs always include the raw (unrounded) value in parentheses after the rounded value. For example: `40.00 (39.21) ft`.

Changing rounding settings, decimal places, or the raw checkbox immediately updates any displayed measurement total.

Rounding settings are saved per-map.

### Decimal Places

A **Decimal places** input (0-6, default 0) controls how many decimal places are shown in all distance outputs. This applies to both rounded and raw values, segment labels, the total display, and the finish notice.

Examples with 0 decimal places: `40 ft`. With 1: `40.0 ft`. With 3 and no rounding: `39.213 ft`.

### Measurement Behavior

During measurement, markers and their labels are dimmed and non-interactive. Hovering near a marker or its label while measuring highlights it for snapping. The cursor stays as a crosshair over markers during measurement mode.

---

## Visibility Layers

Layers control which markers are visible at different zoom levels.

<img width="1095" height="1795" alt="image" src="https://github.com/user-attachments/assets/29e17013-e557-4d74-a54c-5c616dd03602" />
<img width="845" height="535" alt="image" src="https://github.com/user-attachments/assets/ce5ca129-0dfd-4d96-9865-98237d42c4b9" />

Each layer defines a zoom range using a **dual-handle range slider**:

- The slider spans the map's configured zoom range (e.g., 50% to 200%)
- Drag the handles to set when markers on this layer are visible
- Editable number inputs allow precise values (validated on blur or Enter)
- A center display shows the current range or "Always visible"
- Labels indicate "Zoomed out" and "Zoomed in" for intuitive direction

Every map has a **Default Layer** that is always visible and cannot be deleted (but its zoom range can be changed or reset).

Markers **fade smoothly** over 0.5 seconds when crossing layer visibility thresholds, providing a polished transition rather than an abrupt disappearance.

### Use cases

- **Overview layer** (20%-60%): Show city/region markers when zoomed out
- **Detail layer** (80%-200%): Show building/room markers when zoomed in
- **Always-visible layer** (no limits): Important landmarks visible at all zoom levels

### Managing layers

- Add layers from the **Map Settings** modal (gear button)
- Edit a layer's zoom range with the pencil icon
- Delete custom layers with the trash icon (markers are moved to the default layer)
- Reset the default layer to "always visible" with the reset icon
- Validation ensures min zoom is less than max zoom and values are whole numbers

### Assigning markers to layers

The marker edit modal shows a **Layer** dropdown when the map has more than one layer. Markers on hidden layers appear dimmed in the marker list with an eye-off icon.

---

## Marker List Panel

The marker list is a collapsible panel in the bottom-left corner of the map.

<img width="371" height="486" alt="image" src="https://github.com/user-attachments/assets/d9c721ac-4619-4a74-98d5-873e2853da00" />

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

Changes are only saved when you click **Save**. Clicking **Cancel** or closing the modal with unsaved changes prompts you to Save, Discard, or go back and continue editing.

### Image

- **Image path** - Change the map image. Autocomplete searches vault files. The native image dimensions are displayed below the input
- **Map ID** - Unique identifier for this map's sidecar data. Auto-generated from the image path by default. The ID field is read-only; click the pencil icon to change it. Changing the ID opens a modal with four options:
  - **Migrate** - Move all data to the new ID, delete the old sidecar
  - **Copy** - Copy all data to the new ID, keep the old sidecar
  - **Orphan** - Start fresh with the new ID, keep the old data behind (can be cleaned up in Manage Map Data)
  - **Delete** - Start fresh with the new ID, permanently delete the old data

### Sizing

- **Height** - Display height (e.g. `600px`, `80%`). Blank for auto-scaling based on aspect ratio
- **Width** - Display width (e.g. `800px`, `100%`). Blank for auto-scaling based on aspect ratio

### Zoom

- **Min/Max zoom** - Constrains the zoom range (percentages)
- **Zoom step** - Increment per scroll or button click

### Navigation (per-map override)

- **Open Links in** - Inherit / New tab / Current tab. Controls whether clicking a marker's linked note opens in a new tab or the current one
- **Hover Preview** - Inherit / On / Off. Show Obsidian's page preview when hovering markers with linked notes

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

<img width="1644" height="1495" alt="image" src="https://github.com/user-attachments/assets/fdec983d-7832-4ace-9585-d47626475f41" />

### Markers section

- **Default Marker Scale** - Size of markers on all maps (slider, 25-300%, default 100%)
- **Scale Markers to Zoom** - Screen-constant or Fixed to map

### Text section

- **Default Text Scale** - Size of marker labels on all maps (slider, 25-300%, default 100%)
- **Scale Text to Zoom** - Screen-constant or Fixed to map

### Navigation section

- **Open Links in New Tab** - When clicking a marker's linked note, open in a new tab (default off - opens in current tab)
- **Show Hover Preview** - Show Obsidian's page preview when hovering markers with linked notes (default off)

### Marker Templates section

The full template manager (see [Marker Templates](#marker-templates)). Template folders default to collapsed.

### Data Management

- **Manage Map Data** - Opens a modal listing all stored map data files. Each entry shows:
  - The map ID
  - Marker and layer count
  - Last known image path and source file path (registered when the map renders)
  - A **Delete** button with confirmation prompt to permanently remove the data
- Useful for cleaning up orphaned data from deleted maps or changed IDs

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

| Field      | Required | Description                                                              | Default                        |
| ---------- | -------- | ------------------------------------------------------------------------ | ------------------------------ |
| `image`    | Yes      | Path to the map image relative to the vault root                         | -                              |
| `id`       | No       | Unique map identifier. Maps with different IDs have separate marker sets | Auto-generated from image path |
| `height`   | No       | Container height. Accepts `px` or `%` values                             | Auto-scales to aspect ratio    |
| `width`    | No       | Container width. Accepts `px` or `%` values                              | Auto-scales to aspect ratio    |
| `zoommin`  | No       | Minimum zoom percentage                                                  | `50`                           |
| `zoommax`  | No       | Maximum zoom percentage                                                  | `200`                          |
| `zoomstep` | No       | Zoom step per scroll or button click                                     | `10`                           |

Keys are case-insensitive. Lines starting with `#` are treated as comments. Changes made in the map settings modal are written back to the code block automatically.

---

## Context Menus

### Map background (right-click)

<img width="303" height="465" alt="image" src="https://github.com/user-attachments/assets/259f0b3c-b603-443f-b1b5-53659db68b97" />

| Item                       | Action                                        |
| -------------------------- | --------------------------------------------- |
| **Place Marker**           | Places a marker using the default template    |
| _Template name_            | Places a marker using that template           |
| _Folder name_ > _Template_ | Templates in folders appear as submenus       |
| **Edit Templates**         | Opens plugin settings to the template manager |

When the map has multiple layers, each template entry expands into a submenu to select the target layer. Templates and folders are sorted alphabetically.

### Marker (right-click)

<img width="321" height="296" alt="image" src="https://github.com/user-attachments/assets/9db56641-190c-4801-a65b-ef4fb87133ee" />

| Item              | Action                               |
| ----------------- | ------------------------------------ |
| **Edit**          | Open the marker edit modal           |
| **Copy Marker**   | Enter copy mode with a ghost preview |
| **Resize Marker** | Enter interactive marker resize mode |
| **Resize Text**   | Enter interactive text resize mode   |
| **Delete**        | Remove the marker immediately        |

---

## Keyboard and Mouse Reference

### Mouse

| Input                    | Context                            | Action                                           |
| ------------------------ | ---------------------------------- | ------------------------------------------------ |
| **Click + drag**         | Map background                     | Pan the map                                      |
| **Scroll wheel**         | Map                                | Zoom in/out                                      |
| **Right-click**          | Map background                     | Open map context menu                            |
| **Right-click**          | Marker                             | Open marker context menu                         |
| **Click**                | Marker with note                   | Navigate to the linked note (new tab or current) |
| **Hover**                | Marker with note (preview enabled) | Show Obsidian page preview popover               |
| **Click + drag**         | Marker                             | Reposition the marker                            |
| **Alt + Scroll**         | Over marker pin                    | Adjust per-marker pin/icon scale                 |
| **Alt + Scroll**         | Over marker label                  | Adjust per-marker text scale                     |
| **Shift + Alt + Scroll** | Over marker pin                    | Adjust map-level marker scale                    |
| **Shift + Alt + Scroll** | Over marker label                  | Adjust map-level text scale                      |
| **Click**                | During measurement                 | Place a measurement point                        |
| **Click + drag**         | During freehand                    | Draw a measurement stroke                        |
| **Double-click**         | During measurement/freehand        | Finish measuring and show total                  |
| **Right-click**          | During measurement                 | Finish measuring                                 |

### Keyboard

| Key         | Context           | Action                                     |
| ----------- | ----------------- | ------------------------------------------ |
| **Escape**  | Drawing/measuring | Cancel the current drawing or measurement  |
| **Escape**  | Resize mode       | Cancel resize and revert to original scale |
| **Escape**  | Copy mode         | Cancel copy mode                           |
| **Any key** | Copy mode         | Cancel copy mode                           |

---

## Import and Export

### Map Export

Maps can be exported as ZIP files from the **Map Settings** modal. The ZIP bundle includes:

- The map image file
- The map's sidecar state (markers, layers, scale, etc.)
- The code block configuration
- A manifest with the plugin version

### Map Import

Import a map ZIP via the **Import Map** button on unconfigured map blocks. The import:

- Prompts you to select a destination folder for the image
- Extracts the image into your vault (appending a number if the filename already exists)
- Creates the sidecar state file with all markers, layers, and settings
- Sets up the code block configuration with the new image path and map ID

### Template Import/Export

See [Import and Export Templates](#import-and-export-templates) in the Marker Templates section.

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
- Navigation and hover preview overrides
- Zoom and pan lock states
- Last known image path and source file path (for data management identification)

Saves are debounced (300ms) for performance. These files can be committed to version control or synced across devices.

### Plugin data (`data.json`)

Global settings managed by Obsidian's built-in persistence:

- Default marker and text scale
- Default zoom behavior
- Navigation and hover preview defaults
- All marker templates and template folders
