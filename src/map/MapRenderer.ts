import { MarkdownRenderChild, Menu, Notice, setIcon } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MapConfig, MapState, MapMarker, MapPoint, RoundingMode, DEFAULT_LAYER_ID, DEFAULT_MARKER_SCALE, DEFAULT_MARKER_TEXT_SCALE } from "../types";
import { MapSettingsModal } from "../modals/MapSettingsModal";
import { MarkerEditModal } from "../modals/MarkerEditModal";
import { ScaleCalibrationModal } from "../modals/ScaleCalibrationModal";
import { serializeMapConfig, writeConfigToCodeBlock } from "../utils/configSerializer";
import { createPinElement } from "../utils/markerPin";
import { buildMarkerLabel, linkPath, displayTitle } from "../utils/markerLabel";
import { setFAIcon } from "../utils/faIcon";
import { pixelDistance, pixelsToUnits, polylineUnitsDistance, applyRounding } from "../distance";
import { generateMarkerId } from "../utils/mapId";
import { NO_ZOOM_SVG, NO_PAN_SVG } from "../icons/lockIcons";

type InteractionMode = "pan" | "calibrate" | "measure" | "freehand";

const FREEHAND_MIN_DISTANCE = 5;
const RESIZE_SCALE_SENSITIVITY = 0.005;
const MIN_MARKER_SCALE = 0.1;
const MAX_MARKER_SCALE = 5.0;
const SCROLL_SCALE_STEP = 0.05;
const RESIZE_SAVE_DEBOUNCE_MS = 300;
const DRAG_THRESHOLD_PX = 3;
const DEFAULT_ROUNDING_MULTIPLE = 5;

export class MapRenderer extends MarkdownRenderChild {
  private plugin: TTRPGMapsPlugin;
  private config: MapConfig;
  private state: MapState | null = null;
  private sourcePath: string;
  private sectionInfo: { lineStart: number; lineEnd: number } | null;

  // DOM elements
  private wrapper!: HTMLDivElement;
  private mapContainer!: HTMLDivElement;
  private markerOverlay!: HTMLDivElement;
  private imageEl!: HTMLImageElement;
  private svgOverlay!: SVGSVGElement;
  private toolbar!: HTMLDivElement;
  private markerListScroll: HTMLElement | null = null;

  // Measurement drawer elements
  private drawerWrapper!: HTMLDivElement;
  private drawerContent!: HTMLDivElement;
  private totalDisplay: HTMLDivElement | null = null;

  // Pan/zoom state
  private zoom = 100;
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private zoomLocked = false;
  private panLocked = false;

  // Marker drag state
  private draggingMarker: MapMarker | null = null;
  private dragMarkerEl: HTMLElement | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOrigX = 0;
  private dragOrigY = 0;
  private hasDragged = false;

  // Drawing mode state
  private mode: InteractionMode = "pan";
  private drawingPoints: MapPoint[] = [];
  private activeSvgElements: SVGElement[] = [];

  // Measure preview (rubber-band line from last point to cursor)
  private measurePreviewLine: SVGLineElement | null = null;
  private measurePreviewLabel: SVGTextElement | null = null;
  private measurePreviewCircle: SVGCircleElement | null = null;

  // Freehand state
  private isDrawingFreehand = false;
  private freehandStrokes: MapPoint[][] = [];
  private currentFreehandPolyline: SVGPolylineElement | null = null;
  private freehandMinDistance = FREEHAND_MIN_DISTANCE;

  // Resize mode state
  private resizingMarker: MapMarker | null = null;
  private resizeMarkerEl: HTMLElement | null = null;
  private resizeHandleEl: HTMLElement | null = null;
  private resizeStartX = 0;
  private resizeStartScale = 1;
  private resizeTarget: "marker" | "text" = "marker";
  private resizeHandleSide: "left" | "right" = "right";
  private isDraggingHandle = false;
  private _resizeSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  // Copy-marker state
  private pendingCopy: MapMarker | null = null;
  private _cancelCopy: (() => void) | null = null;

  // Container resize handling
  private resizeObserver: ResizeObserver | null = null;
  private _resizeDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(containerEl: HTMLElement, plugin: TTRPGMapsPlugin, config: MapConfig, sourcePath: string, sectionInfo: { lineStart: number; lineEnd: number } | null) {
    super(containerEl);
    this.plugin = plugin;
    this.config = config;
    this.sourcePath = sourcePath;
    this.sectionInfo = sectionInfo;
  }

  private refreshCallback = async () => {
    this.state = await this.plugin.dataManager.loadMapState(this.config.id);
    this.renderMarkers();
    this.refreshMarkerList();
  };

  async onload(): Promise<void> {
    this.state = await this.plugin.dataManager.loadMapState(this.config.id);
    this.plugin.onMapRefresh(this.refreshCallback);
    this.buildDOM();
  }

  onunload(): void {
    this.plugin.offMapRefresh(this.refreshCallback);
    if (this._cancelCopy) { this._cancelCopy(); this._cancelCopy = null; }
    if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
    if (this._resizeDebounce) { clearTimeout(this._resizeDebounce); this._resizeDebounce = null; }
  }

  // ──────────────────── DOM Setup ────────────────────

  private buildDOM(): void {
    const el = this.containerEl;
    el.empty();
    el.addClass("ttrpgmap-root");

    this.wrapper = el.createDiv({ cls: "ttrpgmap-wrapper" });
    this.applyWrapperSize();

    this.mapContainer = this.wrapper.createDiv({ cls: "ttrpgmap-container" });

    this.imageEl = this.mapContainer.createEl("img", { cls: "ttrpgmap-image" });
    this.loadImage();

    this.svgOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svgOverlay.addClass("ttrpgmap-svg-overlay");
    this.mapContainer.appendChild(this.svgOverlay);

    // Marker overlay sits outside the scaled container for crisp rendering
    this.markerOverlay = this.wrapper.createDiv({ cls: "ttrpgmap-marker-overlay" });

    this.imageEl.addEventListener("load", () => {
      this.svgOverlay.setAttribute("width", String(this.imageEl.naturalWidth));
      this.svgOverlay.setAttribute("height", String(this.imageEl.naturalHeight));
      this.applyWrapperSize();
      this.renderMarkers();
    });

    this.buildZoomControls();
    this.buildMeasureDrawer();
    this.buildSettingsButton();
    this.buildMarkerListPanel();
    this.buildTotalDisplay();
    this.bindEvents();
    this.renderMarkers();

    // Throttle layout during resize: hide overlays and pause image rendering
    this.resizeObserver = new ResizeObserver(() => {
      if (!this._resizeDebounce) {
        this.markerOverlay.style.visibility = "hidden";
        this.svgOverlay.style.display = "none";
        this.imageEl.style.imageRendering = "pixelated";
      } else {
        clearTimeout(this._resizeDebounce);
      }
      this._resizeDebounce = setTimeout(() => {
        this._resizeDebounce = null;
        this.imageEl.style.imageRendering = "";
        this.svgOverlay.style.display = "";
        this.updateMarkerPositions();
        this.markerOverlay.style.visibility = "";
      }, 150);
    });
    this.resizeObserver.observe(this.wrapper);
  }

  private loadImage(): void {
    const file = this.plugin.app.vault.getFileByPath(this.config.image);
    if (!file) {
      this.wrapper.empty();
      this.wrapper.createDiv({ cls: "ttrpgmap-error", text: `Image not found: ${this.config.image}` });
      return;
    }
    this.imageEl.src = this.plugin.app.vault.getResourcePath(file);
    this.imageEl.draggable = false;
  }

  private buildZoomControls(): void {
    const controls = this.wrapper.createDiv({ cls: "ttrpgmap-zoom-controls" });

    const zoomInBtn = controls.createDiv({ cls: "ttrpgmap-zoom-btn", text: "+" });
    zoomInBtn.addEventListener("click", () => this.adjustZoom(this.config.zoomStep));

    controls.createDiv({ cls: "ttrpgmap-zoom-label" }).setText(`${this.zoom}%`);

    const zoomOutBtn = controls.createDiv({ cls: "ttrpgmap-zoom-btn", text: "−" });
    zoomOutBtn.addEventListener("click", () => this.adjustZoom(-this.config.zoomStep));

    controls.createDiv({ cls: "ttrpgmap-zoom-btn ttrpgmap-center-btn", text: "◎" })
      .addEventListener("click", () => this.centerMap());

    const fitBtn = controls.createDiv({ cls: "ttrpgmap-zoom-btn", attr: { "aria-label": "Fit to Screen" } });
    setIcon(fitBtn, "maximize");
    fitBtn.addEventListener("click", () => this.fitToScreen());

    // Lock toggles (inside zoom controls strip)
    this.zoomLocked = this.state?.zoomLocked ?? false;
    this.panLocked = this.state?.panLocked ?? false;

    const zoomLockBtn = controls.createDiv({ cls: "ttrpgmap-zoom-btn ttrpgmap-lock-btn", attr: { "aria-label": "Lock Zoom" } });
    zoomLockBtn.innerHTML = NO_ZOOM_SVG;
    if (this.zoomLocked) {
      zoomLockBtn.addClass("is-active");
      zoomInBtn.addClass("ttrpgmap-btn-disabled");
      zoomOutBtn.addClass("ttrpgmap-btn-disabled");
    }
    zoomLockBtn.addEventListener("click", () => {
      this.zoomLocked = !this.zoomLocked;
      zoomLockBtn.toggleClass("is-active", this.zoomLocked);
      zoomInBtn.toggleClass("ttrpgmap-btn-disabled", this.zoomLocked);
      zoomOutBtn.toggleClass("ttrpgmap-btn-disabled", this.zoomLocked);
      if (this.state) { this.state.zoomLocked = this.zoomLocked; this.plugin.dataManager.saveMapState(this.config.id, this.state); }
    });

    const panLockBtn = controls.createDiv({ cls: "ttrpgmap-zoom-btn ttrpgmap-lock-btn", attr: { "aria-label": "Lock Pan" } });
    panLockBtn.innerHTML = NO_PAN_SVG;
    if (this.panLocked) panLockBtn.addClass("is-active");
    panLockBtn.addEventListener("click", () => {
      this.panLocked = !this.panLocked;
      panLockBtn.toggleClass("is-active", this.panLocked);
      if (this.state) { this.state.panLocked = this.panLocked; this.plugin.dataManager.saveMapState(this.config.id, this.state); }
    });
  }

  private buildMeasureDrawer(): void {
    const panel = this.wrapper.createDiv({ cls: "ttrpgmap-measure-panel" });

    // Toggle button (always visible)
    const toggleBtn = panel.createDiv({ cls: "ttrpgmap-measure-toggle" });
    setIcon(toggleBtn, "ruler");
    toggleBtn.setAttribute("aria-label", "Measurement Tools");

    // Drawer content (hidden by default)
    this.drawerWrapper = panel.createDiv({ cls: "ttrpgmap-measure-drawer" });
    this.drawerWrapper.style.display = "none";

    // Tool buttons row
    const toolRow = this.drawerWrapper.createDiv({ cls: "ttrpgmap-measure-tools" });

    const calibrateBtn = toolRow.createDiv({
      cls: "ttrpgmap-toolbar-btn",
      attr: { "aria-label": "Set Distance Scale" },
    });
    setIcon(calibrateBtn, "scaling");
    calibrateBtn.addEventListener("click", (e) => { e.stopPropagation(); this.setMode("calibrate"); });

    const measureBtn = toolRow.createDiv({
      cls: "ttrpgmap-toolbar-btn",
      attr: { "aria-label": "Measure Distance" },
    });
    setIcon(measureBtn, "route");
    measureBtn.addEventListener("click", (e) => { e.stopPropagation(); this.setMode("measure"); });

    const freehandBtn = toolRow.createDiv({
      cls: "ttrpgmap-toolbar-btn",
      attr: { "aria-label": "Freehand Measure" },
    });
    setIcon(freehandBtn, "pencil");
    freehandBtn.addEventListener("click", (e) => { e.stopPropagation(); this.setMode("freehand"); });

    // Store toolbar reference for updateToolbarState
    this.toolbar = toolRow;

    // Rounding settings section
    const roundingSection = this.drawerWrapper.createDiv({ cls: "ttrpgmap-measure-rounding" });
    roundingSection.createDiv({ cls: "ttrpgmap-measure-rounding-label", text: "Rounding" });

    const roundingRow = roundingSection.createDiv({ cls: "ttrpgmap-measure-rounding-row" });

    // Mode dropdown
    const modeSelect = roundingRow.createEl("select", { cls: "ttrpgmap-measure-rounding-select" });
    const modeNone = modeSelect.createEl("option", { text: "None", value: "none" });
    const modeClosest = modeSelect.createEl("option", { text: "Closest", value: "closest" });
    const modeUp = modeSelect.createEl("option", { text: "Up to", value: "up" });
    const modeDown = modeSelect.createEl("option", { text: "Down to", value: "down" });

    const currentMode = this.state?.roundingMode ?? "none";
    modeNone.selected = currentMode === "none";
    modeClosest.selected = currentMode === "closest";
    modeUp.selected = currentMode === "up";
    modeDown.selected = currentMode === "down";

    // "multiple of" label
    const multipleLabel = roundingRow.createEl("span", { cls: "ttrpgmap-measure-rounding-of", text: "multiple of" });

    // Multiple input
    const multipleInput = roundingRow.createEl("input", {
      cls: "ttrpgmap-measure-rounding-input",
      type: "number",
      attr: { min: "0", step: "any" },
      value: String(this.state?.roundingMultiple ?? DEFAULT_ROUNDING_MULTIPLE),
    });

    // "Include raw value" checkbox
    const rawLabel = roundingRow.createEl("label", { cls: "ttrpgmap-measure-rounding-raw" });
    const rawCheckbox = rawLabel.createEl("input", { type: "checkbox" });
    rawCheckbox.checked = this.state?.showRawDistance ?? false;
    rawLabel.append("Raw");

    // Show/hide rounding controls based on mode
    const updateMultipleVisibility = () => {
      const isNone = modeSelect.value === "none";
      multipleLabel.style.display = isNone ? "none" : "";
      multipleInput.style.display = isNone ? "none" : "";
      rawLabel.style.display = isNone ? "none" : "";
    };
    updateMultipleVisibility();

    modeSelect.addEventListener("change", () => {
      if (!this.state) return;
      this.state.roundingMode = modeSelect.value as RoundingMode;
      this.plugin.dataManager.saveMapState(this.config.id, this.state);
      updateMultipleVisibility();
    });

    multipleInput.addEventListener("change", () => {
      if (!this.state) return;
      const val = parseFloat(multipleInput.value);
      if (!isNaN(val) && val > 0) {
        this.state.roundingMultiple = val;
        this.plugin.dataManager.saveMapState(this.config.id, this.state);
      }
    });

    rawCheckbox.addEventListener("change", () => {
      if (!this.state) return;
      this.state.showRawDistance = rawCheckbox.checked;
      this.plugin.dataManager.saveMapState(this.config.id, this.state);
    });

    // Decimal places row
    const decimalsRow = roundingSection.createDiv({ cls: "ttrpgmap-measure-rounding-row" });
    decimalsRow.createEl("span", { cls: "ttrpgmap-measure-rounding-of", text: "Decimal places" });
    const decimalsInput = decimalsRow.createEl("input", {
      cls: "ttrpgmap-measure-rounding-input",
      type: "number",
      attr: { min: "0", max: "6", step: "1" },
      value: String(this.state?.distanceDecimals ?? 0),
    });
    decimalsInput.addEventListener("change", () => {
      if (!this.state) return;
      const val = parseInt(decimalsInput.value, 10);
      if (!isNaN(val) && val >= 0 && val <= 6) {
        this.state.distanceDecimals = val;
        this.plugin.dataManager.saveMapState(this.config.id, this.state);
      }
    });

    // Drawer content ref for updateToolbarState
    this.drawerContent = this.drawerWrapper;

    // Toggle drawer
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = this.drawerWrapper.style.display !== "none";
      this.drawerWrapper.style.display = isOpen ? "none" : "flex";
    });
  }

  private buildTotalDisplay(): void {
    this.totalDisplay = this.wrapper.createDiv({ cls: "ttrpgmap-measure-total" });
    this.totalDisplay.style.display = "none";
  }

  private buildSettingsButton(): void {
    const btn = this.wrapper.createDiv({ cls: "ttrpgmap-settings-btn" });
    btn.setText("⚙");
    btn.setAttribute("aria-label", "Map Settings");
    btn.addEventListener("click", () => this.openSettings());
  }

  private buildMarkerListPanel(): void {
    const panel = this.wrapper.createDiv({ cls: "ttrpgmap-marker-list-panel" });
    let pinned = false;

    // Wrapper for pin tab + list (sits above toggle)
    const listWrapper = panel.createDiv({ cls: "ttrpgmap-marker-list-wrapper" });
    listWrapper.style.display = "none";

    // Pin tab attached to top-left of list
    const pinBtn = listWrapper.createDiv({ cls: "ttrpgmap-marker-list-pin-tab" });
    setIcon(pinBtn, "pin-off");
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      pinned = !pinned;
      pinBtn.empty();
      setIcon(pinBtn, pinned ? "pin" : "pin-off");
      panel.toggleClass("ttrpgmap-marker-list-pinned", pinned);
      listWrapper.toggleClass("ttrpgmap-marker-list-wrapper-pinned", pinned);
    });

    // List container
    const listContainer = listWrapper.createDiv({ cls: "ttrpgmap-marker-list-container" });

    // Scrollable list area
    const listScroll = listContainer.createDiv({ cls: "ttrpgmap-marker-list-scroll" });
    this.markerListScroll = listScroll;

    // Prevent scroll from zooming the map when the list is scrollable
    listScroll.addEventListener("wheel", (e) => {
      const atTop = listScroll.scrollTop === 0;
      const atBottom = listScroll.scrollTop + listScroll.clientHeight >= listScroll.scrollHeight;
      const scrollingUp = e.deltaY < 0;
      // Only let it through if fully scrolled in that direction
      if ((scrollingUp && atTop) || (!scrollingUp && atBottom)) return;
      e.stopPropagation();
    });

    // Toggle button at the bottom
    const toggleBtn = panel.createDiv({ cls: "ttrpgmap-marker-list-toggle" });
    setIcon(toggleBtn, "list");
    toggleBtn.setAttribute("aria-label", "Marker List");

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = listWrapper.style.display !== "none";
      if (isOpen && !pinned) {
        listWrapper.style.display = "none";
      } else {
        listWrapper.style.display = "flex";
        this.renderMarkerList(listScroll);
      }
    });
  }

  /** Refresh the marker list if it's currently visible */
  private refreshMarkerList(): void {
    if (this.markerListScroll) {
      const wrapper = this.markerListScroll.closest(".ttrpgmap-marker-list-wrapper") as HTMLElement | null;
      if (wrapper && wrapper.style.display !== "none") {
        this.renderMarkerList(this.markerListScroll);
      }
    }
  }

  private renderMarkerList(container: HTMLElement): void {
    container.empty();
    if (!this.state || this.state.markers.length === 0) {
      container.createDiv({ cls: "ttrpgmap-marker-list-empty", text: "No markers" });
      return;
    }

    const sorted = [...this.state.markers].sort((a, b) => {
      const nameA = a.note ? displayTitle(a.note, a.alias) : "";
      const nameB = b.note ? displayTitle(b.note, b.alias) : "";
      return nameA.localeCompare(nameB);
    });

    for (const marker of sorted) {
      const visible = this.isMarkerVisible(marker);
      const row = container.createDiv({ cls: "ttrpgmap-marker-list-row" });
      if (!visible) row.addClass("ttrpgmap-marker-list-row--hidden");

      // Mini icon preview
      const preview = row.createDiv({ cls: "ttrpgmap-marker-list-preview" });
      const shape = marker.shape ?? "pin";
      createPinElement(preview, {
        pinClass: "ttrpgmap-marker-list-pin",
        svgClass: "ttrpgmap-pin-svg",
        color: marker.color ?? "#ffffff",
        icon: marker.icon,
        iconColor: marker.iconColor ?? "#000000",
        iconRotation: marker.iconRotation ?? 0,
        iconClass: "ttrpgmap-marker-list-icon",
        useBaseMarker: marker.useBaseMarker ?? true,
        shape,
      });

      // Name
      const name = marker.note ? displayTitle(marker.note, marker.alias) : "Unnamed";
      row.createDiv({ cls: "ttrpgmap-marker-list-name", text: name });

      // Hidden indicator
      if (!visible) {
        const hiddenIcon = row.createDiv({ cls: "ttrpgmap-marker-list-hidden-icon" });
        setIcon(hiddenIcon, "eye-off");
      }

      // Highlight map marker on hover
      row.addEventListener("mouseenter", () => {
        const el = this.markerOverlay.querySelector<HTMLElement>(`[data-marker-id="${marker.id}"]`);
        if (el) el.addClass("ttrpgmap-marker-bounce");
      });
      row.addEventListener("mouseleave", () => {
        const el = this.markerOverlay.querySelector<HTMLElement>(`[data-marker-id="${marker.id}"]`);
        if (el) el.removeClass("ttrpgmap-marker-bounce");
      });

      // Description tooltip on hover
      if (marker.description) {
        row.setAttribute("aria-label", marker.description);
        row.addClass("ttrpgmap-marker-list-has-desc");
      }

      // Edit button
      const editBtn = row.createDiv({ cls: "ttrpgmap-marker-list-action", attr: { "aria-label": "Edit" } });
      setIcon(editBtn, "pencil");
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.editMarker(marker);
      });

      // Delete button
      const deleteBtn = row.createDiv({ cls: "ttrpgmap-marker-list-action ttrpgmap-marker-list-delete", attr: { "aria-label": "Delete" } });
      setIcon(deleteBtn, "trash-2");
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.deleteMarker(marker);
        this.renderMarkerList(container);
      });

      // Click row to pan to marker
      row.addEventListener("click", () => {
        const { x, y } = this.toScreenCoords(marker.x, marker.y);
        const rect = this.wrapper.getBoundingClientRect();
        this.panX += rect.width / 2 - x;
        this.panY += rect.height / 2 - y;
        this.applyTransform();
      });
    }
  }

  private bindEvents(): void {
    this.wrapper.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.wrapper.addEventListener("mousemove", this.onMouseMove.bind(this));
    this.wrapper.addEventListener("mouseup", this.onMouseUp.bind(this));
    this.wrapper.addEventListener("mouseleave", this.onMouseUp.bind(this));
    this.wrapper.addEventListener("click", this.onMapClick.bind(this));
    this.wrapper.addEventListener("wheel", this.onWheel.bind(this), { passive: false });
    this.wrapper.addEventListener("contextmenu", this.onContextMenu.bind(this));
    this.wrapper.setAttribute("tabindex", "0");
    this.wrapper.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.resizingMarker) { this.cancelResize(); return; }
        if (this.mode !== "pan") this.cancelDrawing();
      }
    });
    this.wrapper.addEventListener("dblclick", (e) => {
      if ((this.mode === "measure" || this.mode === "freehand") && this.getMeasurePointCount() >= 2) {
        e.preventDefault();
        this.finishMeasuring();
      }
    });
  }

  // ──────────────────── Sizing ────────────────────

  private parseDimension(value: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/[a-z%]/i.test(trimmed)) return trimmed;
    return `${trimmed}px`;
  }

  private applyWrapperSize(): void {
    const height = this.parseDimension(this.config.height);
    const width = this.parseDimension(this.config.width);
    const natW = this.imageEl?.naturalWidth || 0;
    const natH = this.imageEl?.naturalHeight || 0;
    const ratio = natW && natH ? natW / natH : 0;

    if (height && width) {
      this.wrapper.style.width = width;
      this.wrapper.style.height = height;
      if (this.imageEl) { this.imageEl.style.width = "100%"; this.imageEl.style.height = "100%"; }
    } else if (height && !width) {
      this.wrapper.style.height = height;
      if (this.imageEl) { this.imageEl.style.height = "100%"; this.imageEl.style.width = "auto"; }
      const px = parseFloat(height);
      this.wrapper.style.width = (ratio && !height.includes("%")) ? `${Math.round(px * ratio)}px` : "auto";
    } else if (!height && width) {
      this.wrapper.style.width = width;
      if (this.imageEl) { this.imageEl.style.width = "100%"; this.imageEl.style.height = "auto"; }
      const px = parseFloat(width);
      this.wrapper.style.height = (ratio && !width.includes("%")) ? `${Math.round(px / ratio)}px` : "auto";
    } else {
      this.wrapper.style.width = "100%";
      this.wrapper.style.height = "auto";
      if (this.imageEl) { this.imageEl.style.width = "100%"; this.imageEl.style.height = "auto"; }
    }
  }

  // ──────────────────── Pan / Zoom ────────────────────

  private applyTransform(): void {
    const scale = this.zoom / 100;
    this.mapContainer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${scale})`;
    this.updateMarkerPositions();
  }

  private getImageScale(): { sx: number; sy: number } {
    if (!this.imageEl || !this.imageEl.naturalWidth || !this.imageEl.naturalHeight) return { sx: 1, sy: 1 };
    return { sx: this.imageEl.clientWidth / this.imageEl.naturalWidth, sy: this.imageEl.clientHeight / this.imageEl.naturalHeight };
  }

  private adjustZoom(delta: number): void {
    if (this.zoomLocked) return;
    const newZoom = Math.max(this.config.zoomMin, Math.min(this.config.zoomMax, this.zoom + delta));
    if (newZoom === this.zoom) return;
    this.zoom = newZoom;
    this.applyTransform();
    this.updateMarkerScalesAndVisibility();
    const label = this.wrapper.querySelector(".ttrpgmap-zoom-label");
    if (label) label.setText(`${this.zoom}%`);
  }

  private centerMap(): void {
    const rect = this.wrapper.getBoundingClientRect();
    const scale = this.zoom / 100;
    this.panX = (rect.width - (this.imageEl?.clientWidth || 0) * scale) / 2;
    this.panY = (rect.height - (this.imageEl?.clientHeight || 0) * scale) / 2;
    this.applyTransform();
  }

  private fitToScreen(): void {
    const imgW = this.imageEl?.clientWidth || 0;
    const imgH = this.imageEl?.clientHeight || 0;
    if (!imgW || !imgH) return;
    const rect = this.wrapper.getBoundingClientRect();
    const fitZoom = Math.min(rect.width / imgW, rect.height / imgH) * 100;
    const clamped = Math.max(this.config.zoomMin, Math.min(this.config.zoomMax, Math.round(fitZoom)));
    this.zoom = clamped;
    const scale = this.zoom / 100;
    this.panX = (rect.width - imgW * scale) / 2;
    this.panY = (rect.height - imgH * scale) / 2;
    this.applyTransform();
    this.updateMarkerScalesAndVisibility();
    const label = this.wrapper.querySelector(".ttrpgmap-zoom-label");
    if (label) label.setText(`${this.zoom}%`);
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;

    // Resize mode: only start drag if clicking the handle
    if (this.resizingMarker && this.resizeHandleEl) {
      const handle = (e.target as HTMLElement).closest(".ttrpgmap-resize-handle");
      if (handle) {
        e.preventDefault();
        e.stopPropagation();
        this.isDraggingHandle = true;
        this.resizeStartX = e.clientX;
        this.resizeStartScale = this.resizeTarget === "marker"
          ? this.resizingMarker.scale!
          : this.resizingMarker.textScale!;
      } else {
        // Clicked outside handle: commit resize
        this.commitResize();
      }
      return;
    }

    // Freehand mode: start drawing
    if (this.mode === "freehand") {
      this.startFreehand(e);
      return;
    }

    if (this.mode !== "pan") return;

    // Copy mode: place copied marker at click location
    if (this.pendingCopy) {
      e.preventDefault();
      e.stopPropagation();
      const rect = this.mapContainer.getBoundingClientRect();
      const scale = this.zoom / 100;
      const { sx, sy } = this.getImageScale();
      const mapX = (e.clientX - rect.left) / scale / sx;
      const mapY = (e.clientY - rect.top) / scale / sy;
      this.completeCopy(mapX, mapY);
      return;
    }

    if (this.panLocked) return;
    this.isPanning = true;
    this.panStartX = e.clientX - this.panX;
    this.panStartY = e.clientY - this.panY;
    this.wrapper.addClass("ttrpgmap-panning");
  }

  private onMouseMove(e: MouseEvent): void {
    // Marker hover proximity for measurement modes
    if (this.mode !== "pan") {
      this.updateMarkerMeasureHover(e);
    }

    // Measure preview: rubber-band line from last committed point to cursor
    if (this.mode === "measure" && this.drawingPoints.length >= 1) {
      this.updateMeasurePreview(e);
    }

    // Resize drag (only when actively dragging the handle)
    if (this.isDraggingHandle && this.resizingMarker && this.resizeMarkerEl) {
      const rawDx = e.clientX - this.resizeStartX;
      // Dragging away from the marker = bigger (invert when handle is on the left)
      const dx = this.resizeHandleSide === "left" ? -rawDx : rawDx;
      const newScale = Math.max(MIN_MARKER_SCALE, Math.min(MAX_MARKER_SCALE, this.resizeStartScale + dx * RESIZE_SCALE_SENSITIVITY));
      if (this.resizeTarget === "marker") {
        this.resizingMarker.scale = newScale;
        const stz = this.resizingMarker.scaleToZoom ?? this.getMarkerScaleToZoom();
        this.resizeMarkerEl.style.setProperty("--marker-scale", String(this.computeEffectiveScale(newScale, stz)));
      } else {
        this.resizingMarker.textScale = newScale;
        const stz = this.resizingMarker.textScaleToZoom ?? this.getTextScaleToZoom();
        this.resizeMarkerEl.style.setProperty("--marker-text-scale", String(this.computeEffectiveScale(newScale, stz)));
      }
      this.updateResizeLabel(newScale);
      return;
    }

    // Freehand drawing
    if (this.isDrawingFreehand) {
      this.continueFreehand(e);
      return;
    }

    if (this.draggingMarker && this.dragMarkerEl) {
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) this.hasDragged = true;
      const scale = this.zoom / 100;
      const { sx, sy } = this.getImageScale();
      // Update natural coords
      this.draggingMarker.x = this.dragOrigX + dx / scale / sx;
      this.draggingMarker.y = this.dragOrigY + dy / scale / sy;
      // Position in screen coords (marker is in the overlay, not the scaled container)
      const screen = this.toScreenCoords(this.draggingMarker.x, this.draggingMarker.y);
      this.dragMarkerEl.style.left = `${screen.x}px`;
      this.dragMarkerEl.style.top = `${screen.y}px`;
      return;
    }
    if (!this.isPanning) return;
    this.panX = e.clientX - this.panStartX;
    this.panY = e.clientY - this.panStartY;
    this.applyTransform();
  }

  private onMouseUp(e: MouseEvent): void {
    // Resize: end handle drag (but stay in resize mode)
    if (this.isDraggingHandle) {
      this.isDraggingHandle = false;
      // Suppress the click event that fires after mouseup so it doesn't navigate
      this.hasDragged = true;
      return;
    }

    // Freehand: finish current stroke
    if (this.isDrawingFreehand) {
      this.endFreehand();
      return;
    }

    if (this.draggingMarker) {
      this.dragMarkerEl?.removeClass("ttrpgmap-marker-dragging");
      // Suppress navigation if the mouse moved at all from the start position.
      // hasDragged may already be true from onMouseMove (beyond threshold),
      // but even sub-threshold movement means the user tried to reposition.
      if (e.clientX !== this.dragStartX || e.clientY !== this.dragStartY) {
        this.hasDragged = true;
      }
      if (this.hasDragged && this.state) this.plugin.dataManager.saveMapState(this.config.id, this.state);
      this.draggingMarker = null;
      this.dragMarkerEl = null;
      return;
    }
    this.isPanning = false;
    this.wrapper.removeClass("ttrpgmap-panning");
  }

  private onWheel(e: WheelEvent): void {
    // Alt+scroll on a marker: resize it (always allowed even when zoom locked)
    if (e.altKey && this.state) {
      e.preventDefault();
      const markerEl = (e.target as HTMLElement).closest<HTMLElement>(".ttrpgmap-marker");
      if (markerEl) {
        const markerId = markerEl.dataset.markerId;
        const marker = this.state.markers.find((m) => m.id === markerId);
        if (marker) {
          // Materialize inherited scale if null
          if (marker.scale === null) marker.scale = this.getMarkerBaseScale(marker);
          const scaleDelta = e.deltaY < 0 ? SCROLL_SCALE_STEP : -SCROLL_SCALE_STEP;
          marker.scale = Math.max(MIN_MARKER_SCALE, Math.min(MAX_MARKER_SCALE, marker.scale + scaleDelta));
          // Update CSS variable in-place
          const stz = marker.scaleToZoom ?? this.getMarkerScaleToZoom();
          markerEl.style.setProperty("--marker-scale", String(this.computeEffectiveScale(marker.scale, stz)));
          // Show hotspot markers visibly while resizing
          markerEl.addClass("ttrpgmap-marker-resizing");
          // Debounced save + remove resizing class
          if (this._resizeSaveTimeout) clearTimeout(this._resizeSaveTimeout);
          this._resizeSaveTimeout = setTimeout(() => {
            markerEl.removeClass("ttrpgmap-marker-resizing");
            if (this.state) this.plugin.dataManager.saveMapState(this.config.id, this.state);
          }, RESIZE_SAVE_DEBOUNCE_MS);
          return;
        }
      }
    }

    if (this.zoomLocked) return;
    e.preventDefault();

    const delta = e.deltaY < 0 ? this.config.zoomStep : -this.config.zoomStep;
    const newZoom = Math.max(this.config.zoomMin, Math.min(this.config.zoomMax, this.zoom + delta));
    if (newZoom === this.zoom) return;

    const oldScale = this.zoom / 100;
    const newScale = newZoom / 100;
    const rect = this.wrapper.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const mapX = (cursorX - this.panX) / oldScale;
    const mapY = (cursorY - this.panY) / oldScale;

    this.panX = cursorX - mapX * newScale;
    this.panY = cursorY - mapY * newScale;
    this.zoom = newZoom;
    this.applyTransform();
    this.updateMarkerScalesAndVisibility();

    const label = this.wrapper.querySelector(".ttrpgmap-zoom-label");
    if (label) label.setText(`${this.zoom}%`);
  }

  // ──────────────────── Markers ────────────────────

  /** Check if a marker is visible at the current zoom level based on its layer */
  private isMarkerVisible(marker: MapMarker): boolean {
    if (!this.state) return false;
    const layerId = marker.layerId ?? DEFAULT_LAYER_ID;
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (!layer) return true; // orphaned layer ref = show marker
    const min = layer.zoomMin ?? 0;
    const max = layer.zoomMax ?? Infinity;
    return this.zoom >= min && this.zoom <= max;
  }

  /** Resolve the effective base scale for a marker (walking the 3-tier hierarchy) */
  private getMarkerBaseScale(marker: MapMarker): number {
    return marker.scale ?? this.state?.markerScale ?? this.plugin.settings.defaultMarkerScale ?? DEFAULT_MARKER_SCALE;
  }

  /** Resolve the effective base text scale for a marker */
  private getTextBaseScale(marker: MapMarker): number {
    return marker.textScale ?? this.state?.markerTextScale ?? this.plugin.settings.defaultMarkerTextScale ?? DEFAULT_MARKER_TEXT_SCALE;
  }

  /** Resolve whether a marker scales to zoom */
  private getMarkerScaleToZoom(): boolean {
    return this.state?.scaleMarkersToZoom ?? this.plugin.settings.defaultScaleMarkersToZoom ?? true;
  }

  /** Resolve whether a marker's text scales to zoom */
  private getTextScaleToZoom(): boolean {
    return this.state?.scaleMarkerTextToZoom ?? this.plugin.settings.defaultScaleMarkerTextToZoom ?? true;
  }

  /** Compute effective scale (accounting for zoom if fixed-to-map) */
  private computeEffectiveScale(baseScale: number, scaleToZoom: boolean): number {
    return scaleToZoom ? baseScale : baseScale * (this.zoom / 100);
  }

  /** Convert natural image coords to screen coords within the wrapper */
  private toScreenCoords(natX: number, natY: number): { x: number; y: number } {
    const { sx, sy } = this.getImageScale();
    const scale = this.zoom / 100;
    return {
      x: natX * sx * scale + this.panX,
      y: natY * sy * scale + this.panY,
    };
  }

  /** Reposition all marker elements to current pan/zoom without re-creating them */
  private updateMarkerPositions(): void {
    if (!this.state) return;
    const markerMap = new Map(this.state.markers.map((m) => [m.id, m]));
    const els = this.markerOverlay.querySelectorAll<HTMLElement>(".ttrpgmap-marker");
    els.forEach((el) => {
      const id = el.dataset.markerId;
      if (!id) return;
      const marker = markerMap.get(id);
      if (!marker) return;
      const { x, y } = this.toScreenCoords(marker.x, marker.y);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    });
  }

  /** Update scale CSS vars and visibility on existing marker elements (no DOM rebuild) */
  private updateMarkerScalesAndVisibility(): void {
    if (!this.state) return;
    const markerMap = new Map(this.state.markers.map((m) => [m.id, m]));
    const mapScaleToZoom = this.getMarkerScaleToZoom();
    const mapTextScaleToZoom = this.getTextScaleToZoom();
    const els = this.markerOverlay.querySelectorAll<HTMLElement>(".ttrpgmap-marker");
    let needsFullRender = false;

    els.forEach((el) => {
      const id = el.dataset.markerId;
      if (!id) return;
      const marker = markerMap.get(id);
      if (!marker) return;

      // Update visibility
      const visible = this.isMarkerVisible(marker);
      el.style.display = visible ? "" : "none";

      // Update scales
      const markerBaseScale = this.getMarkerBaseScale(marker);
      const markerScaleToZoom = marker.scaleToZoom ?? mapScaleToZoom;
      el.style.setProperty("--marker-scale", String(this.computeEffectiveScale(markerBaseScale, markerScaleToZoom)));

      const textBaseScale = this.getTextBaseScale(marker);
      const textScaleToZoom = marker.textScaleToZoom ?? mapTextScaleToZoom;
      el.style.setProperty("--marker-text-scale", String(this.computeEffectiveScale(textBaseScale, textScaleToZoom)));
    });

    // Check if any markers became visible/hidden that weren't rendered
    const renderedIds = new Set<string>();
    els.forEach((el) => { if (el.dataset.markerId) renderedIds.add(el.dataset.markerId); });
    for (const marker of this.state.markers) {
      if (this.isMarkerVisible(marker) && !renderedIds.has(marker.id)) {
        needsFullRender = true;
        break;
      }
    }
    if (needsFullRender) this.renderMarkers();
  }

  /** Update marker hover state during measurement modes */
  private updateMarkerMeasureHover(e: MouseEvent): void {
    const els = this.markerOverlay.querySelectorAll<HTMLElement>(".ttrpgmap-marker");
    const mx = e.clientX;
    const my = e.clientY;
    els.forEach((el) => {
      const rect = el.getBoundingClientRect();
      // Expand hit area slightly for easier detection
      const pad = 5;
      const isNear = mx >= rect.left - pad && mx <= rect.right + pad &&
                     my >= rect.top - pad && my <= rect.bottom + pad;
      el.toggleClass("ttrpgmap-marker-measure-hover", isNear);
    });
  }

  private renderMarkers(): void {
    if (!this.state) return;
    // Null out handle ref before DOM wipe (the element itself is removed with the markers)
    this.resizeHandleEl = null;
    this.isDraggingHandle = false;
    this.markerOverlay.querySelectorAll(".ttrpgmap-marker").forEach((el) => el.remove());

    const mapScaleToZoom = this.getMarkerScaleToZoom();
    const mapTextScaleToZoom = this.getTextScaleToZoom();

    const isMeasuring = this.mode !== "pan";

    for (const marker of this.state.markers) {
      if (!this.isMarkerVisible(marker)) continue;
      const markerEl = this.createMarkerElement(marker, mapScaleToZoom, mapTextScaleToZoom, isMeasuring);
      if (!isMeasuring) this.attachMarkerEvents(marker, markerEl);
    }

    this.recoverResizeMode();
  }

  private createMarkerElement(marker: MapMarker, mapScaleToZoom: boolean, mapTextScaleToZoom: boolean, isMeasuring: boolean): HTMLElement {
    const color = marker.color ?? "#ffffff";
    const iconColor = marker.iconColor ?? "#000000";
    const direction = marker.direction ?? "down";
    const textPlacement = marker.textPlacement ?? "above";

    const { x, y } = this.toScreenCoords(marker.x, marker.y);
    const markerEl = this.markerOverlay.createDiv({ cls: "ttrpgmap-marker" });
    markerEl.style.left = `${x}px`;
    markerEl.style.top = `${y}px`;
    markerEl.style.setProperty("--marker-color", color);
    markerEl.style.setProperty("--marker-icon-color", iconColor);
    markerEl.dataset.direction = direction;
    markerEl.dataset.textPlacement = textPlacement;
    markerEl.dataset.markerId = marker.id;

    // Compute effective scale for marker pin/icon
    const markerBaseScale = this.getMarkerBaseScale(marker);
    const markerScaleToZoom = marker.scaleToZoom ?? mapScaleToZoom;
    markerEl.style.setProperty("--marker-scale", String(this.computeEffectiveScale(markerBaseScale, markerScaleToZoom)));

    // Compute effective scale for text label
    const textBaseScale = this.getTextBaseScale(marker);
    const textScaleToZoom = marker.textScaleToZoom ?? mapTextScaleToZoom;
    markerEl.style.setProperty("--marker-text-scale", String(this.computeEffectiveScale(textBaseScale, textScaleToZoom)));

    if (isMeasuring) {
      markerEl.addClass("ttrpgmap-marker-measuring");
    }

    createPinElement(markerEl, {
      pinClass: "ttrpgmap-marker-pin",
      svgClass: "ttrpgmap-pin-svg",
      color,
      icon: marker.icon,
      iconColor,
      iconRotation: marker.iconRotation ?? 0,
      iconClass: "ttrpgmap-marker-icon",
      useBaseMarker: marker.useBaseMarker ?? true,
      shape: marker.shape ?? "pin",
    });

    buildMarkerLabel(markerEl, marker.note, marker.alias, marker.description, "ttrpgmap-marker-label");

    return markerEl;
  }

  private attachMarkerEvents(marker: MapMarker, markerEl: HTMLElement): void {
    // Click to navigate
    if (marker.note) {
      const navPath = linkPath(marker.note);
      markerEl.addEventListener("click", (e) => {
        if (this.hasDragged) { this.hasDragged = false; return; }
        e.stopPropagation();
        const newTab = this.state?.openLinksInNewTab ?? this.plugin.settings.openLinksInNewTab ?? true;
        this.plugin.app.workspace.openLinkText(navPath, "", newTab);
      });
    }

    // Hover preview
    markerEl.addEventListener("mouseenter", (e) => {
      if (this.draggingMarker) return;
      const showPreview = this.state?.showHoverPreview ?? this.plugin.settings.showHoverPreview ?? false;
      if (!showPreview) return;
      const previewPath = marker.previewNote
        ? linkPath(marker.previewNote)
        : (marker.note ? linkPath(marker.note) : null);
      if (!previewPath) return;
      this.plugin.app.workspace.trigger("hover-link", {
        event: e,
        source: "ttrpg-maps",
        hoverParent: { hoverPopover: null },
        targetEl: markerEl,
        linktext: previewPath,
        sourcePath: "",
      });
    });

    // Drag to reposition
    markerEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (this.resizingMarker) return;
      e.stopPropagation();
      this.draggingMarker = marker;
      this.dragMarkerEl = markerEl;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragOrigX = marker.x;
      this.dragOrigY = marker.y;
      this.hasDragged = false;
      markerEl.addClass("ttrpgmap-marker-dragging");
    });

    // Right-click menu
    markerEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.resizingMarker) this.commitResize();
      const menu = new Menu();
      menu.addItem((item) => { item.setTitle("Edit"); item.setIcon("pencil"); item.onClick(() => this.editMarker(marker)); });
      menu.addItem((item) => { item.setTitle("Copy Marker"); item.setIcon("copy"); item.onClick(() => this.startCopyMarker(marker)); });
      menu.addItem((item) => { item.setTitle("Resize Marker"); item.setIcon("maximize-2"); item.onClick(() => this.enterResizeMode(marker, markerEl, "marker")); });
      menu.addItem((item) => { item.setTitle("Resize Text"); item.setIcon("a-large-small"); item.onClick(() => this.enterResizeMode(marker, markerEl, "text")); });
      menu.addItem((item) => { item.setTitle("Delete"); item.setIcon("trash-2"); item.onClick(() => this.deleteMarker(marker)); });
      menu.showAtMouseEvent(e);
    });
  }

  private recoverResizeMode(): void {
    if (!this.resizingMarker) return;
    const el = this.markerOverlay.querySelector<HTMLElement>(`[data-marker-id="${this.resizingMarker.id}"]`);
    if (el) {
      const marker = this.resizingMarker;
      const target = this.resizeTarget;
      const startScale = this.resizeStartScale;
      this.cleanupResizeHandle();
      this.resizeMarkerEl = null;
      this.resizingMarker = null;
      this.enterResizeMode(marker, el, target);
      this.resizeStartScale = startScale;
    } else {
      this.cancelResize();
    }
  }

  private placeMarker(x: number, y: number, templateId: string, layerId: string | null = null): void {
    if (!this.state) return;
    const template = this.plugin.settings.markerTemplates.find((t) => t.id === templateId);

    const marker: MapMarker = {
      id: generateMarkerId(),
      templateId, x, y,
      layerId,
      note: null, alias: null, previewNote: null, description: null,
      direction: template?.direction ?? "down",
      textPlacement: template?.textPlacement ?? "above",
      color: template?.color ?? "#ffffff",
      icon: template?.icon ?? null,
      iconColor: template?.iconColor ?? "#000000",
      iconRotation: template?.iconRotation ?? 0,
      useBaseMarker: template?.useBaseMarker ?? true,
      shape: template?.shape ?? "pin",
      scale: null,
      scaleToZoom: null,
      textScale: null,
      textScaleToZoom: null,
    };

    new MarkerEditModal(this.plugin.app, this.plugin, marker, this.state.layers, (updated) => {
      if (!this.state) return;
      Object.assign(marker, updated);
      this.state.markers.push(marker);
      this.plugin.dataManager.saveMapState(this.config.id, this.state);
      this.renderMarkers();
      this.refreshMarkerList();
    }).open();
  }

  private editMarker(marker: MapMarker): void {
    if (this.resizingMarker) this.commitResize();
    new MarkerEditModal(this.plugin.app, this.plugin, marker, this.state?.layers ?? [], (updated) => {
      if (!this.state) return;
      Object.assign(marker, updated);
      this.plugin.dataManager.saveMapState(this.config.id, this.state);
      this.renderMarkers();
      this.refreshMarkerList();
    }).open();
  }

  private startCopyMarker(source: MapMarker): void {
    this.pendingCopy = source;
    this.wrapper.style.cursor = "copy";
    this.wrapper.addClass("ttrpgmap-copy-mode");

    // Create ghost preview fixed to the viewport
    const ghost = activeWindow.document.body.createDiv({ cls: "ttrpgmap-marker ttrpgmap-copy-ghost" });
    ghost.style.setProperty("--marker-color", source.color ?? "#ffffff");
    ghost.style.setProperty("--marker-icon-color", source.iconColor ?? "#000000");
    const markerBaseScale = this.getMarkerBaseScale(source);
    const markerScaleToZoom = source.scaleToZoom ?? this.getMarkerScaleToZoom();
    ghost.style.setProperty("--marker-scale", String(this.computeEffectiveScale(markerBaseScale, markerScaleToZoom)));
    const textBaseScale = this.getTextBaseScale(source);
    const textScaleToZoom = source.textScaleToZoom ?? this.getTextScaleToZoom();
    ghost.style.setProperty("--marker-text-scale", String(this.computeEffectiveScale(textBaseScale, textScaleToZoom)));
    ghost.dataset.direction = source.direction ?? "down";
    ghost.dataset.textPlacement = source.textPlacement ?? "above";
    createPinElement(ghost, {
      pinClass: "ttrpgmap-marker-pin",
      svgClass: "ttrpgmap-pin-svg",
      color: source.color ?? "#ffffff",
      icon: source.icon,
      iconColor: source.iconColor ?? "#000000",
      iconRotation: source.iconRotation ?? 0,
      iconClass: "ttrpgmap-marker-icon",
      useBaseMarker: source.useBaseMarker ?? true,
      shape: source.shape ?? "pin",
    });
    buildMarkerLabel(ghost, source.note, source.alias, source.description, "ttrpgmap-marker-label");

    const onMove = (e: MouseEvent) => {
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
    };
    this.wrapper.addEventListener("mousemove", onMove);

    const cancel = () => {
      this.pendingCopy = null;
      this.wrapper.style.cursor = "grab";
      this.wrapper.removeClass("ttrpgmap-copy-mode");
      ghost.remove();
      this.wrapper.removeEventListener("mousemove", onMove);
      this.wrapper.removeEventListener("contextmenu", onCancel, true);
      activeWindow.removeEventListener("keydown", onCancel, true);
      activeWindow.removeEventListener("blur", onCancel);
    };
    const onCancel = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    };

    // Cancel on right-click or any keypress
    this.wrapper.addEventListener("contextmenu", onCancel, true);
    activeWindow.addEventListener("keydown", onCancel, true);
    activeWindow.addEventListener("blur", onCancel);

    // Store cancel so mousedown handler can call it after placing
    this._cancelCopy = cancel;
  }

  private completeCopy(x: number, y: number): void {
    if (!this.pendingCopy || !this.state) return;
    const source = this.pendingCopy;

    const marker: MapMarker = {
      ...source,
      id: generateMarkerId(),
      x,
      y,
    };

    this.state.markers.push(marker);
    this.plugin.dataManager.saveMapState(this.config.id, this.state);
    this.renderMarkers();
    this.refreshMarkerList();

    // Clean up copy mode
    if (this._cancelCopy) {
      this._cancelCopy();
      this._cancelCopy = null;
    }
  }

  private deleteMarker(marker: MapMarker): void {
    if (!this.state) return;
    this.state.markers = this.state.markers.filter((m) => m.id !== marker.id);
    this.plugin.dataManager.saveMapState(this.config.id, this.state);
    this.renderMarkers();
    this.refreshMarkerList();
  }

  // ──────────────────── Resize Mode ────────────────────

  private enterResizeMode(marker: MapMarker, markerEl: HTMLElement, target: "marker" | "text"): void {
    // Ensure only one resize handle exists at a time
    if (this.resizingMarker) this.commitResize();
    // Materialize inherited scale so we have a concrete value to adjust
    if (target === "marker") {
      if (marker.scale === null) marker.scale = this.getMarkerBaseScale(marker);
    } else {
      if (marker.textScale === null) marker.textScale = this.getTextBaseScale(marker);
    }
    this.resizingMarker = marker;
    this.resizeMarkerEl = markerEl;
    this.resizeTarget = target;
    this.resizeStartScale = target === "marker" ? marker.scale! : marker.textScale!;
    markerEl.addClass("ttrpgmap-marker-resizing");

    // Determine which side to place the handle to avoid text overlap
    const textPlacement = markerEl.dataset.textPlacement ?? "above";
    let handleSide: "left" | "right";
    if (target === "marker") {
      // Marker handle goes opposite text when text is left/right
      handleSide = textPlacement === "right" ? "left" : "right";
    } else {
      // Text handle goes opposite marker handle: same side as text, or left by default
      handleSide = textPlacement === "right" ? "right" : "left";
    }

    // Build the drag handle
    const handle = markerEl.createDiv({ cls: "ttrpgmap-resize-handle" });
    handle.dataset.side = handleSide;
    this.resizeHandleSide = handleSide;

    const grip = handle.createDiv({ cls: "ttrpgmap-resize-grip" });
    setIcon(grip, "grip-vertical");

    const label = handle.createDiv({ cls: "ttrpgmap-resize-label" });
    label.setText(`${this.resizeStartScale.toFixed(2)}x`);

    const tag = handle.createDiv({ cls: "ttrpgmap-resize-tag" });
    tag.setText(target === "marker" ? "Marker" : "Text");

    this.resizeHandleEl = handle;
  }

  private updateResizeLabel(scale: number): void {
    const label = this.resizeHandleEl?.querySelector(".ttrpgmap-resize-label");
    if (label) label.setText(`${scale.toFixed(2)}x`);
  }

  private cleanupResizeHandle(): void {
    // Remove all resize handles in the overlay (defensive: ensures singleton)
    this.markerOverlay?.querySelectorAll(".ttrpgmap-resize-handle").forEach((el) => el.remove());
    this.resizeHandleEl = null;
    this.isDraggingHandle = false;
    if (this.resizeMarkerEl) {
      this.resizeMarkerEl.removeClass("ttrpgmap-marker-resizing");
    }
  }

  private commitResize(): void {
    this.cleanupResizeHandle();
    if (this.state) this.plugin.dataManager.saveMapState(this.config.id, this.state);
    this.resizingMarker = null;
    this.resizeMarkerEl = null;
  }

  private cancelResize(): void {
    if (this.resizingMarker && this.resizeMarkerEl) {
      // Revert to original scale
      if (this.resizeTarget === "marker") {
        this.resizingMarker.scale = this.resizeStartScale;
        const stz = this.resizingMarker.scaleToZoom ?? this.getMarkerScaleToZoom();
        this.resizeMarkerEl.style.setProperty("--marker-scale", String(this.computeEffectiveScale(this.resizeStartScale, stz)));
      } else {
        this.resizingMarker.textScale = this.resizeStartScale;
        const stz = this.resizingMarker.textScaleToZoom ?? this.getTextScaleToZoom();
        this.resizeMarkerEl.style.setProperty("--marker-text-scale", String(this.computeEffectiveScale(this.resizeStartScale, stz)));
      }
    }
    this.cleanupResizeHandle();
    this.resizingMarker = null;
    this.resizeMarkerEl = null;
  }

  // ──────────────────── Context Menu ────────────────────

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();

    // Close any active resize handle when opening map context menu
    if (this.resizingMarker) this.commitResize();

    if ((this.mode === "measure" || this.mode === "freehand") && this.getMeasurePointCount() >= 2) { this.finishMeasuring(); return; }
    if (this.mode !== "pan") { this.cancelDrawing(); return; }
    if (!this.state) return;

    const rect = this.mapContainer.getBoundingClientRect();
    const scale = this.zoom / 100;
    const { sx, sy } = this.getImageScale();
    const mapX = (e.clientX - rect.left) / scale / sx;
    const mapY = (e.clientY - rect.top) / scale / sy;

    const menu = new Menu();
    const templates = this.plugin.settings.markerTemplates;
    const layers = this.state.layers;
    const hasMultipleLayers = layers.length > 1;
    const defaultTemplate = templates.find((t) => t.id === "default") ?? templates[0];

    if (defaultTemplate) {
      menu.addItem((item) => {
        item.setTitle("Place Marker");
        item.setIcon("map-pin");
        if (hasMultipleLayers) {
          const sub = (item as any).setSubmenu();
          for (const layer of layers) {
            sub.addItem((subItem: any) => {
              subItem.setTitle(layer.name);
              subItem.onClick(() => this.placeMarker(mapX, mapY, defaultTemplate.id, layer.id === DEFAULT_LAYER_ID ? null : layer.id));
            });
          }
        } else {
          item.onClick(() => this.placeMarker(mapX, mapY, defaultTemplate.id));
        }
      });
    }
    if (templates.length > 1) {
      menu.addSeparator();

      const sortByName = <T extends { name: string }>(items: T[]): T[] =>
        [...items].sort((a, b) => a.name.localeCompare(b.name));

      const folders = this.plugin.settings.templateFolders;
      const topLevel = sortByName(templates.filter((t) => !t.folderId));
      const addTemplateToMenu = (m: any, template: any) => {
        m.addItem((item: any) => {
          item.setTitle(template.name);
          item.setIcon(template.shape === "hotspot" ? "circle-dashed" : "map-pin");
          if (hasMultipleLayers) {
            const sub = item.setSubmenu();
            for (const layer of layers) {
              sub.addItem((subItem: any) => {
                subItem.setTitle(layer.name);
                subItem.onClick(() => this.placeMarker(mapX, mapY, template.id, layer.id === DEFAULT_LAYER_ID ? null : layer.id));
              });
            }
          } else {
            item.onClick(() => this.placeMarker(mapX, mapY, template.id));
          }
        });
      };

      for (const template of topLevel) {
        addTemplateToMenu(menu, template);
      }

      for (const folder of sortByName(folders)) {
        const folderTemplates = sortByName(templates.filter((t) => t.folderId === folder.id));
        if (folderTemplates.length === 0) continue;
        menu.addItem((item: any) => {
          item.setTitle(folder.name);
          item.setIcon("folder");
          const sub = item.setSubmenu();
          for (const template of folderTemplates) {
            addTemplateToMenu(sub, template);
          }
        });
      }
    }

    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("Edit Templates");
      item.setIcon("settings");
      item.onClick(() => {
        const setting = (this.plugin.app as any).setting;
        setting.open();
        setting.openTabById(this.plugin.manifest.id);
      });
    });

    menu.showAtMouseEvent(e);
  }

  // ──────────────────── Drawing (Calibrate / Measure / Freehand) ────────────────────

  private setMode(mode: InteractionMode): void {
    if (this._cancelCopy) { this._cancelCopy(); this._cancelCopy = null; }
    if (this.mode === mode) { this.cancelDrawing(); return; }
    if ((mode === "measure" || mode === "freehand") && !this.state?.distanceScale) {
      new Notice("Set a distance scale first before measuring.");
      return;
    }
    this.mode = mode;
    this.drawingPoints = [];
    this.freehandStrokes = [];
    this.clearActiveSvg();
    this.updateToolbarState();
    this.updateMeasureMode();
    this.wrapper.style.cursor = this.mode === "pan" ? "grab" : "crosshair";
  }

  private cancelDrawing(): void {
    this.mode = "pan";
    this.drawingPoints = [];
    this.freehandStrokes = [];
    this.isDrawingFreehand = false;
    this.currentFreehandPolyline = null;
    this.clearMeasurePreview();
    this.clearActiveSvg();
    this.updateToolbarState();
    this.updateMeasureMode();
    this.hideTotalDisplay();
    this.wrapper.style.cursor = "grab";
    this.wrapper.removeClass("ttrpgmap-panning");
  }

  /** Update markers and wrapper class when entering/leaving measurement modes */
  private updateMeasureMode(): void {
    const isMeasuring = this.mode !== "pan";
    this.wrapper.toggleClass("ttrpgmap-measuring", isMeasuring);
    // Re-render markers to add/remove measurement class
    this.renderMarkers();
  }

  private updateToolbarState(): void {
    const buttons = this.toolbar.querySelectorAll(".ttrpgmap-toolbar-btn");
    buttons.forEach((btn) => btn.removeClass("ttrpgmap-toolbar-btn-active"));
    if (this.mode === "calibrate") buttons[0]?.addClass("ttrpgmap-toolbar-btn-active");
    else if (this.mode === "measure") buttons[1]?.addClass("ttrpgmap-toolbar-btn-active");
    else if (this.mode === "freehand") buttons[2]?.addClass("ttrpgmap-toolbar-btn-active");
  }

  private onMapClick(e: MouseEvent): void {
    if (this.mode === "pan" || this.mode === "freehand") return;
    const rect = this.mapContainer.getBoundingClientRect();
    const scale = this.zoom / 100;
    const point: MapPoint = { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };

    this.drawingPoints.push(point);
    this.drawSvgCircle(point, 4, "ttrpgmap-draw-point");

    if (this.mode === "calibrate") this.handleCalibrateClick();
    else if (this.mode === "measure") this.handleMeasureClick();
  }

  private handleCalibrateClick(): void {
    if (this.drawingPoints.length !== 2) return;
    const [a, b] = this.drawingPoints;
    if (pixelDistance(a, b) === 0) {
      new Notice("Calibration line must have some length. Click two different points.");
      this.drawingPoints.pop();
      return;
    }
    this.drawSvgLine(a, b, "ttrpgmap-draw-line ttrpgmap-calibrate-line");

    new ScaleCalibrationModal(this.plugin.app, (units, unitLabel) => {
      if (!this.state) return;
      this.state.distanceScale = { pointA: a, pointB: b, units, unitLabel };
      this.plugin.dataManager.saveMapState(this.config.id, this.state);
      new Notice(`Scale set: ${units} ${unitLabel}`);
      this.cancelDrawing();
    }).open();
  }

  private handleMeasureClick(): void {
    if (this.drawingPoints.length < 2) return;
    this.clearMeasurePreview();
    const prev = this.drawingPoints[this.drawingPoints.length - 2];
    const curr = this.drawingPoints[this.drawingPoints.length - 1];
    this.drawSvgLine(prev, curr, "ttrpgmap-draw-line ttrpgmap-measure-line");

    if (this.state?.distanceScale) {
      const segDist = pixelsToUnits(pixelDistance(prev, curr), this.state.distanceScale);
      if (segDist !== null) {
        const mid: MapPoint = { x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2 };
        this.drawSvgText(mid, this.formatDistance(segDist), "ttrpgmap-draw-label");
      }
    }
    this.updateTotalDisplay();
  }

  private updateMeasurePreview(e: MouseEvent): void {
    const last = this.drawingPoints[this.drawingPoints.length - 1];
    const rect = this.mapContainer.getBoundingClientRect();
    const scale = this.zoom / 100;
    const cursor: MapPoint = { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };

    // Create or update preview line
    if (!this.measurePreviewLine) {
      this.measurePreviewLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      this.measurePreviewLine.setAttribute("class", "ttrpgmap-draw-line ttrpgmap-measure-line ttrpgmap-measure-preview");
      this.svgOverlay.appendChild(this.measurePreviewLine);
    }
    this.measurePreviewLine.setAttribute("x1", String(last.x));
    this.measurePreviewLine.setAttribute("y1", String(last.y));
    this.measurePreviewLine.setAttribute("x2", String(cursor.x));
    this.measurePreviewLine.setAttribute("y2", String(cursor.y));

    // Create or update preview circle at cursor
    if (!this.measurePreviewCircle) {
      this.measurePreviewCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      this.measurePreviewCircle.setAttribute("r", "4");
      this.measurePreviewCircle.setAttribute("class", "ttrpgmap-draw-point ttrpgmap-measure-preview");
      this.svgOverlay.appendChild(this.measurePreviewCircle);
    }
    this.measurePreviewCircle.setAttribute("cx", String(cursor.x));
    this.measurePreviewCircle.setAttribute("cy", String(cursor.y));

    // Create or update preview label
    if (this.state?.distanceScale) {
      const segDist = pixelsToUnits(pixelDistance(last, cursor), this.state.distanceScale);
      if (segDist !== null) {
        const mid: MapPoint = { x: (last.x + cursor.x) / 2, y: (last.y + cursor.y) / 2 };
        if (!this.measurePreviewLabel) {
          this.measurePreviewLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
          this.measurePreviewLabel.setAttribute("class", "ttrpgmap-draw-label ttrpgmap-measure-preview");
          this.svgOverlay.appendChild(this.measurePreviewLabel);
        }
        this.measurePreviewLabel.setAttribute("x", String(mid.x));
        this.measurePreviewLabel.setAttribute("y", String(mid.y - 10));
        this.measurePreviewLabel.textContent = this.formatDistance(segDist);
      }
    }
  }

  private clearMeasurePreview(): void {
    this.measurePreviewLine?.remove();
    this.measurePreviewLine = null;
    this.measurePreviewLabel?.remove();
    this.measurePreviewLabel = null;
    this.measurePreviewCircle?.remove();
    this.measurePreviewCircle = null;
  }

  // ──────────────────── Freehand Drawing ────────────────────

  private screenToMap(e: MouseEvent): MapPoint {
    const rect = this.mapContainer.getBoundingClientRect();
    const scale = this.zoom / 100;
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  }

  private startFreehand(e: MouseEvent): void {
    // Don't start on UI elements
    const target = e.target as HTMLElement;
    if (target.closest(".ttrpgmap-measure-panel") || target.closest(".ttrpgmap-zoom-controls") ||
        target.closest(".ttrpgmap-settings-btn") || target.closest(".ttrpgmap-marker-list-panel")) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    this.isDrawingFreehand = true;

    const point = this.screenToMap(e);
    const stroke: MapPoint[] = [point];
    this.freehandStrokes.push(stroke);

    // Create SVG polyline for this stroke
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("class", "ttrpgmap-draw-line ttrpgmap-freehand-line");
    polyline.setAttribute("points", `${point.x},${point.y}`);
    polyline.setAttribute("fill", "none");
    this.svgOverlay.appendChild(polyline);
    this.activeSvgElements.push(polyline);
    this.currentFreehandPolyline = polyline;

    // Draw start circle
    this.drawSvgCircle(point, 4, "ttrpgmap-draw-point");
  }

  private continueFreehand(e: MouseEvent): void {
    if (!this.isDrawingFreehand || !this.currentFreehandPolyline) return;
    const currentStroke = this.freehandStrokes[this.freehandStrokes.length - 1];
    if (!currentStroke || currentStroke.length === 0) return;

    const point = this.screenToMap(e);
    const last = currentStroke[currentStroke.length - 1];
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.freehandMinDistance) return;

    currentStroke.push(point);

    // Update polyline points attribute
    const pointsStr = currentStroke.map((p) => `${p.x},${p.y}`).join(" ");
    this.currentFreehandPolyline.setAttribute("points", pointsStr);

    this.updateTotalDisplay();
  }

  private endFreehand(): void {
    this.isDrawingFreehand = false;

    const currentStroke = this.freehandStrokes[this.freehandStrokes.length - 1];
    if (currentStroke && currentStroke.length > 0) {
      // Draw end circle
      this.drawSvgCircle(currentStroke[currentStroke.length - 1], 4, "ttrpgmap-draw-point");

      // Show segment distance label at midpoint of stroke
      if (this.state?.distanceScale && currentStroke.length >= 2) {
        const strokeDist = polylineUnitsDistance(currentStroke, this.state.distanceScale);
        if (strokeDist !== null) {
          const midIdx = Math.floor(currentStroke.length / 2);
          const mid = currentStroke[midIdx];
          this.drawSvgText(mid, this.formatDistance(strokeDist), "ttrpgmap-draw-label");
        }
      }
    }

    this.currentFreehandPolyline = null;
    this.updateTotalDisplay();
  }

  // ──────────────────── Measurement Helpers ────────────────────

  /** Get total point count across measure mode and freehand strokes */
  private getMeasurePointCount(): number {
    if (this.mode === "freehand") {
      let total = 0;
      for (const stroke of this.freehandStrokes) total += stroke.length;
      return total;
    }
    return this.drawingPoints.length;
  }

  /** Calculate the total measured distance in map units */
  private calculateTotalDistance(): number | null {
    if (!this.state?.distanceScale) return null;
    if (this.mode === "freehand") {
      let total = 0;
      for (const stroke of this.freehandStrokes) {
        if (stroke.length >= 2) {
          const d = polylineUnitsDistance(stroke, this.state.distanceScale);
          if (d !== null) total += d;
        }
      }
      return total > 0 ? total : null;
    }
    if (this.drawingPoints.length >= 2) {
      return polylineUnitsDistance(this.drawingPoints, this.state.distanceScale);
    }
    return null;
  }

  /** Apply rounding settings to a distance value */
  private roundDistance(value: number): number {
    const mode = this.state?.roundingMode ?? "none";
    const multiple = this.state?.roundingMultiple ?? 5;
    return applyRounding(value, mode, multiple);
  }

  /** Format a number to the configured decimal places */
  private formatNumber(value: number): string {
    const decimals = this.state?.distanceDecimals ?? 0;
    return value.toFixed(decimals);
  }

  /** Format a distance for display, applying rounding and optional raw value */
  private formatDistance(value: number): string {
    const rounded = this.roundDistance(value);
    const label = this.state?.distanceScale?.unitLabel ?? "";
    const display = this.formatNumber(rounded);
    const isRounding = (this.state?.roundingMode ?? "none") !== "none" && (this.state?.roundingMultiple ?? 0) > 0;
    if (isRounding && this.state?.showRawDistance && rounded !== value) {
      const rawDisplay = this.formatNumber(value);
      return `${display} (${rawDisplay}) ${label}`;
    }
    return `${display} ${label}`;
  }

  private updateTotalDisplay(): void {
    if (!this.totalDisplay) return;
    const total = this.calculateTotalDistance();
    if (total === null || total === 0) {
      this.totalDisplay.style.display = "none";
      return;
    }
    this.totalDisplay.style.display = "block";
    this.totalDisplay.textContent = `Total Distance: ${this.formatDistance(total)}`;
  }

  private hideTotalDisplay(): void {
    if (this.totalDisplay) this.totalDisplay.style.display = "none";
  }

  private finishMeasuring(): void {
    if (!this.state?.distanceScale) { this.cancelDrawing(); return; }
    const total = this.calculateTotalDistance();
    if (total !== null) {
      new Notice(`Total Distance: ${this.formatDistance(total)}`);
    }
    this.cancelDrawing();
  }

  // ──────────────────── SVG Helpers ────────────────────

  private clearActiveSvg(): void {
    for (const el of this.activeSvgElements) el.remove();
    this.activeSvgElements = [];
  }

  private drawSvgLine(a: MapPoint, b: MapPoint, cls: string): SVGLineElement {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(a.x)); line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x)); line.setAttribute("y2", String(b.y));
    line.setAttribute("class", cls);
    this.svgOverlay.appendChild(line);
    this.activeSvgElements.push(line);
    return line;
  }

  private drawSvgCircle(p: MapPoint, r: number, cls: string): SVGCircleElement {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(p.x)); circle.setAttribute("cy", String(p.y));
    circle.setAttribute("r", String(r)); circle.setAttribute("class", cls);
    this.svgOverlay.appendChild(circle);
    this.activeSvgElements.push(circle);
    return circle;
  }

  private drawSvgText(p: MapPoint, text: string, cls: string): SVGTextElement {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
    el.setAttribute("x", String(p.x)); el.setAttribute("y", String(p.y - 10));
    el.setAttribute("class", cls); el.textContent = text;
    this.svgOverlay.appendChild(el);
    this.activeSvgElements.push(el);
    return el;
  }

  // ──────────────────── Settings Persistence ────────────────────

  private openSettings(): void {
    if (!this.state) return;
    new MapSettingsModal(
      this.plugin.app,
      this.plugin,
      this.config,
      this.state,
      (updated) => {
        this.config = updated;
        this.applyWrapperSize();
        if (this.sectionInfo) {
          writeConfigToCodeBlock(this.plugin.app, this.sourcePath, this.sectionInfo, serializeMapConfig(this.config));
        }
      },
      (updatedState) => {
        this.state = updatedState;
        this.plugin.dataManager.saveMapState(this.config.id, this.state);
        this.renderMarkers();
        this.refreshMarkerList();
      },
    ).open();
  }
}
