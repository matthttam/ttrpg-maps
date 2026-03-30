import { MarkdownRenderChild, App, Menu, Notice, setIcon } from "obsidian";
import type TTRPGMapsPlugin from "./main";
import { MapConfig, MapState, MapMarker, MapPoint, DEFAULT_MAP_CONFIG } from "./types";
import { MapSettingsModal, MarkerEditModal, ConfigureMapModal, ScaleCalibrationModal } from "./SettingsModal";
import { pixelDistance, pixelsToUnits, segmentDistances, polylineUnitsDistance } from "./distance";

/** Interaction modes for the map */
type InteractionMode = "pan" | "calibrate" | "measure";

/** Parse YAML-like options from the code block source */
export function parseMapConfig(source: string): Partial<MapConfig> {
  const config: Record<string, string> = {};

  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (key && value) {
      config[key] = value;
    }
  }

  const result: Partial<MapConfig> = {};

  if (config.id) result.id = config.id;
  if (config.image) result.image = config.image;
  if (config.height) result.height = config.height;
  if (config.width) result.width = config.width;
  if (config.zoommin) result.zoomMin = parseInt(config.zoommin, 10);
  if (config.zoommax) result.zoomMax = parseInt(config.zoommax, 10);
  if (config.zoomstep) result.zoomStep = parseInt(config.zoomstep, 10);

  return result;
}

/** Resolve a full MapConfig with defaults applied */
function resolveConfig(partial: Partial<MapConfig>): MapConfig | null {
  if (!partial.image) return null;

  const id = partial.id || generateMapId(partial.image);

  return {
    id,
    image: partial.image,
    height: partial.height ?? DEFAULT_MAP_CONFIG.height,
    width: partial.width ?? DEFAULT_MAP_CONFIG.width,
    zoomMin: partial.zoomMin ?? DEFAULT_MAP_CONFIG.zoomMin,
    zoomMax: partial.zoomMax ?? DEFAULT_MAP_CONFIG.zoomMax,
    zoomStep: partial.zoomStep ?? DEFAULT_MAP_CONFIG.zoomStep,
  };
}

/** Generate a stable map ID from the image path */
function generateMapId(imagePath: string): string {
  let hash = 0;
  for (let i = 0; i < imagePath.length; i++) {
    const char = imagePath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return "map_" + Math.abs(hash).toString(36);
}

/**
 * Manages the lifecycle of a single rendered map instance within a note.
 * Created by the code block processor and destroyed when the block is removed/re-rendered.
 */
export class MapRenderer extends MarkdownRenderChild {
  private plugin: TTRPGMapsPlugin;
  private config: MapConfig;
  private state: MapState | null = null;
  private sourcePath: string;
  private sectionInfo: { lineStart: number; lineEnd: number } | null;

  // DOM elements
  private wrapper!: HTMLDivElement;
  private mapContainer!: HTMLDivElement;
  private imageEl!: HTMLImageElement;
  private svgOverlay!: SVGSVGElement;
  private toolbar!: HTMLDivElement;

  // Pan/zoom state
  private zoom = 100;
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;

  // Marker drag state
  private draggingMarker: MapMarker | null = null;
  private dragMarkerEl: HTMLElement | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOrigX = 0;
  private dragOrigY = 0;
  private hasDragged = false;

  // Interaction mode
  private mode: InteractionMode = "pan";
  private drawingPoints: MapPoint[] = [];
  private activeSvgElements: SVGElement[] = [];

  constructor(containerEl: HTMLElement, plugin: TTRPGMapsPlugin, config: MapConfig, sourcePath: string, sectionInfo: { lineStart: number; lineEnd: number } | null) {
    super(containerEl);
    this.plugin = plugin;
    this.config = config;
    this.sourcePath = sourcePath;
    this.sectionInfo = sectionInfo;
  }

  async onload(): Promise<void> {
    this.state = await this.plugin.dataManager.loadMapState(this.config.id);
    this.render();
  }

  onunload(): void {
    // Cleanup is handled by MarkdownRenderChild removing containerEl
  }

  private render(): void {
    const el = this.containerEl;
    el.empty();
    el.addClass("ttrpgmap-root");

    // Wrapper constrains the visible area
    this.wrapper = el.createDiv({ cls: "ttrpgmap-wrapper" });
    this.applyWrapperSize();

    // Map container holds the image and markers, transformed for pan/zoom
    this.mapContainer = this.wrapper.createDiv({ cls: "ttrpgmap-container" });

    // Load the map image
    this.imageEl = this.mapContainer.createEl("img", { cls: "ttrpgmap-image" });
    this.loadImage();

    // SVG overlay for drawing lines (calibration & measurement)
    this.svgOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svgOverlay.addClass("ttrpgmap-svg-overlay");
    this.mapContainer.appendChild(this.svgOverlay);
    // Once the image loads, size the SVG, apply wrapper sizing, and re-render markers
    this.imageEl.addEventListener("load", () => {
      this.svgOverlay.setAttribute("width", String(this.imageEl.naturalWidth));
      this.svgOverlay.setAttribute("height", String(this.imageEl.naturalHeight));
      this.applyWrapperSize();
      this.renderMarkers();
    });

    // Zoom controls
    this.renderZoomControls();

    // Toolbar (top-right) — calibrate & measure buttons
    this.renderToolbar();

    // Settings button (bottom-right)
    const settingsBtn = this.wrapper.createDiv({ cls: "ttrpgmap-settings-btn" });
    settingsBtn.setText("⚙");
    settingsBtn.setAttribute("aria-label", "Map Settings");
    settingsBtn.addEventListener("click", () => this.openSettings());

    // Event listeners for pan
    this.wrapper.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.wrapper.addEventListener("mousemove", this.onMouseMove.bind(this));
    this.wrapper.addEventListener("mouseup", this.onMouseUp.bind(this));
    this.wrapper.addEventListener("mouseleave", this.onMouseUp.bind(this));

    // Click handler for calibrate/measure modes
    this.wrapper.addEventListener("click", this.onMapClick.bind(this));

    // Event listener for zoom
    this.wrapper.addEventListener("wheel", this.onWheel.bind(this), { passive: false });

    // Right-click: context menu in pan mode, finish measuring in measure mode
    this.wrapper.addEventListener("contextmenu", this.onContextMenu.bind(this));

    // Escape key to cancel drawing
    this.wrapper.setAttribute("tabindex", "0");
    this.wrapper.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.mode !== "pan") {
        this.cancelDrawing();
      }
    });

    // Double-click to finish measuring
    this.wrapper.addEventListener("dblclick", (e) => {
      if (this.mode === "measure" && this.drawingPoints.length >= 2) {
        e.preventDefault();
        this.finishMeasuring();
      }
    });

    // Render existing markers
    this.renderMarkers();
  }

  private loadImage(): void {
    const file = this.plugin.app.vault.getFileByPath(this.config.image);
    if (!file) {
      this.wrapper.empty();
      this.wrapper.createDiv({ cls: "ttrpgmap-error", text: `Image not found: ${this.config.image}` });
      return;
    }

    const resourcePath = this.plugin.app.vault.getResourcePath(file);
    this.imageEl.src = resourcePath;
    this.imageEl.draggable = false;
  }

  /** Parse a dimension value, treating bare numbers as pixels */
  private parseDimension(value: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Already has units (%, px, em, etc.)
    if (/[a-z%]/i.test(trimmed)) return trimmed;
    // Bare number — treat as pixels
    return `${trimmed}px`;
  }

  private applyWrapperSize(): void {
    const height = this.parseDimension(this.config.height);
    const width = this.parseDimension(this.config.width);
    const natW = this.imageEl?.naturalWidth || 0;
    const natH = this.imageEl?.naturalHeight || 0;
    const ratio = natW && natH ? natW / natH : 0;

    if (height && width) {
      // Both set — use exact values
      this.wrapper.style.width = width;
      this.wrapper.style.height = height;
      if (this.imageEl) {
        this.imageEl.style.width = "100%";
        this.imageEl.style.height = "100%";
      }
    } else if (height && !width) {
      // Only height — compute width from aspect ratio if possible
      this.wrapper.style.height = height;
      if (this.imageEl) {
        this.imageEl.style.height = "100%";
        this.imageEl.style.width = "auto";
      }
      const pxHeight = parseFloat(height);
      if (ratio && !height.includes("%")) {
        this.wrapper.style.width = `${Math.round(pxHeight * ratio)}px`;
      } else {
        this.wrapper.style.width = "auto";
      }
    } else if (!height && width) {
      // Only width — compute height from aspect ratio if possible
      this.wrapper.style.width = width;
      if (this.imageEl) {
        this.imageEl.style.width = "100%";
        this.imageEl.style.height = "auto";
      }
      const pxWidth = parseFloat(width);
      if (ratio && !width.includes("%")) {
        this.wrapper.style.height = `${Math.round(pxWidth / ratio)}px`;
      } else {
        this.wrapper.style.height = "auto";
      }
    } else {
      // Neither set — 100% width, height from aspect ratio
      this.wrapper.style.width = "100%";
      this.wrapper.style.height = "auto";
      if (this.imageEl) {
        this.imageEl.style.width = "100%";
        this.imageEl.style.height = "auto";
      }
    }
  }

  private renderZoomControls(): void {
    const controls = this.wrapper.createDiv({ cls: "ttrpgmap-zoom-controls" });

    const zoomIn = controls.createDiv({ cls: "ttrpgmap-zoom-btn", text: "+" });
    zoomIn.addEventListener("click", () => this.adjustZoom(this.config.zoomStep));

    const zoomLabel = controls.createDiv({ cls: "ttrpgmap-zoom-label" });
    zoomLabel.setText(`${this.zoom}%`);

    const zoomOut = controls.createDiv({ cls: "ttrpgmap-zoom-btn", text: "−" });
    zoomOut.addEventListener("click", () => this.adjustZoom(-this.config.zoomStep));

    const centerBtn = controls.createDiv({ cls: "ttrpgmap-zoom-btn ttrpgmap-center-btn", text: "◎" });
    centerBtn.addEventListener("click", () => this.centerMap());
  }

  private centerMap(): void {
    const wrapperRect = this.wrapper.getBoundingClientRect();
    const scale = this.zoom / 100;
    const imgW = (this.imageEl?.clientWidth || 0) * scale;
    const imgH = (this.imageEl?.clientHeight || 0) * scale;

    this.panX = (wrapperRect.width - imgW) / 2;
    this.panY = (wrapperRect.height - imgH) / 2;
    this.applyTransform();
  }

  private adjustZoom(delta: number): void {
    const newZoom = Math.max(this.config.zoomMin, Math.min(this.config.zoomMax, this.zoom + delta));
    if (newZoom === this.zoom) return;
    this.zoom = newZoom;
    this.applyTransform();
    this.updateMarkerScales();

    const label = this.wrapper.querySelector(".ttrpgmap-zoom-label");
    if (label) label.setText(`${this.zoom}%`);
  }

  private applyTransform(): void {
    const scale = this.zoom / 100;
    this.mapContainer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${scale})`;
  }

  /** Ratio of displayed image size to natural image size (accounts for width/height config) */
  private getImageScale(): { sx: number; sy: number } {
    if (!this.imageEl || !this.imageEl.naturalWidth || !this.imageEl.naturalHeight) {
      return { sx: 1, sy: 1 };
    }
    return {
      sx: this.imageEl.clientWidth / this.imageEl.naturalWidth,
      sy: this.imageEl.clientHeight / this.imageEl.naturalHeight,
    };
  }

  // --- Pan handlers ---
  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // Left click only
    if (this.mode !== "pan") return; // Don't pan while drawing
    this.isPanning = true;
    this.panStartX = e.clientX - this.panX;
    this.panStartY = e.clientY - this.panY;
    this.wrapper.addClass("ttrpgmap-panning");
  }

  private onMouseMove(e: MouseEvent): void {
    // Marker dragging takes priority
    if (this.draggingMarker && this.dragMarkerEl) {
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.hasDragged = true;
      }
      const scale = this.zoom / 100;
      const { sx, sy } = this.getImageScale();
      // Store in natural image coords
      this.draggingMarker.x = this.dragOrigX + dx / scale / sx;
      this.draggingMarker.y = this.dragOrigY + dy / scale / sy;
      // Position element in display coords
      this.dragMarkerEl.style.left = `${this.draggingMarker.x * sx}px`;
      this.dragMarkerEl.style.top = `${this.draggingMarker.y * sy}px`;
      return;
    }

    if (!this.isPanning) return;
    this.panX = e.clientX - this.panStartX;
    this.panY = e.clientY - this.panStartY;
    this.applyTransform();
  }

  private onMouseUp(): void {
    if (this.draggingMarker) {
      if (this.dragMarkerEl) {
        this.dragMarkerEl.removeClass("ttrpgmap-marker-dragging");
      }
      if (this.hasDragged) {
        this.plugin.dataManager.saveMapState(this.config.id, this.state!);
      }
      this.draggingMarker = null;
      this.dragMarkerEl = null;
      return;
    }

    this.isPanning = false;
    this.wrapper.removeClass("ttrpgmap-panning");
  }

  // --- Zoom via scroll (toward cursor) ---
  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaY < 0 ? this.config.zoomStep : -this.config.zoomStep;
    const newZoom = Math.max(this.config.zoomMin, Math.min(this.config.zoomMax, this.zoom + delta));
    if (newZoom === this.zoom) return;

    const oldScale = this.zoom / 100;
    const newScale = newZoom / 100;

    // Map coordinates under the cursor
    const rect = this.wrapper.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const mapX = (cursorX - this.panX) / oldScale;
    const mapY = (cursorY - this.panY) / oldScale;

    // Adjust pan so the same map point stays under the cursor
    this.panX = cursorX - mapX * newScale;
    this.panY = cursorY - mapY * newScale;

    this.zoom = newZoom;
    this.applyTransform();
    this.updateMarkerScales();

    const label = this.wrapper.querySelector(".ttrpgmap-zoom-label");
    if (label) label.setText(`${this.zoom}%`);
  }

  // --- Context menu for placing markers ---
  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();

    // In measure mode, right-click finishes the measurement
    if (this.mode === "measure" && this.drawingPoints.length >= 2) {
      this.finishMeasuring();
      return;
    }

    // In any non-pan mode, right-click cancels
    if (this.mode !== "pan") {
      this.cancelDrawing();
      return;
    }

    if (!this.state) return;

    // Calculate position in natural image coordinates (accounting for pan/zoom and image display scale)
    const rect = this.mapContainer.getBoundingClientRect();
    const scale = this.zoom / 100;
    const { sx, sy } = this.getImageScale();
    const mapX = (e.clientX - rect.left) / scale / sx;
    const mapY = (e.clientY - rect.top) / scale / sy;

    const menu = new Menu();

    // Add an option for each marker template
    for (const template of this.plugin.settings.markerTemplates) {
      menu.addItem((item) => {
        item.setTitle(`Place: ${template.name}`);
        item.onClick(() => {
          this.placeMarker(mapX, mapY, template.name);
        });
      });
    }

    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("Edit Templates");
      item.setIcon("settings");
      item.onClick(() => {
        // Open the plugin settings tab
        const setting = (this.plugin.app as any).setting;
        setting.open();
        setting.openTabById(this.plugin.manifest.id);
      });
    });

    menu.showAtMouseEvent(e);
  }

  private placeMarker(x: number, y: number, templateName: string): void {
    if (!this.state) return;

    const template = this.plugin.settings.markerTemplates.find(
      (t) => t.name === templateName
    );

    const marker: MapMarker = {
      id: `marker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      templateName,
      x,
      y,
      note: null,
      description: null,
      direction: template?.direction ?? "down",
      textPlacement: template?.textPlacement ?? "above",
      color: template?.color ?? "#ffffff",
      icon: template?.icon ?? null,
      iconColor: template?.iconColor ?? "#000000",
    };

    // Open the edit modal immediately so the user can set properties
    new MarkerEditModal(this.plugin.app, this.plugin, marker, (updated) => {
      Object.assign(marker, updated);
      this.state!.markers.push(marker);
      this.plugin.dataManager.saveMapState(this.config.id, this.state!);
      this.renderMarkers();
    }).open();
  }

  private editMarker(marker: MapMarker): void {
    new MarkerEditModal(this.plugin.app, this.plugin, marker, (updated) => {
      Object.assign(marker, updated);
      this.plugin.dataManager.saveMapState(this.config.id, this.state!);
      this.renderMarkers();
    }).open();
  }

  private deleteMarker(marker: MapMarker): void {
    if (!this.state) return;
    this.state.markers = this.state.markers.filter((m) => m.id !== marker.id);
    this.plugin.dataManager.saveMapState(this.config.id, this.state);
    this.renderMarkers();
  }

  private updateMarkerScales(): void {
    const inverseScale = 100 / this.zoom;
    this.mapContainer.querySelectorAll<HTMLElement>(".ttrpgmap-marker").forEach((el) => {
      el.style.setProperty("--marker-scale", String(inverseScale));
    });
  }

  // --- Render markers ---
  private renderMarkers(): void {
    if (!this.state) return;

    // Remove existing marker elements
    this.mapContainer.querySelectorAll(".ttrpgmap-marker").forEach((el) => el.remove());

    const { sx, sy } = this.getImageScale();

    for (const marker of this.state.markers) {
      const markerEl = this.mapContainer.createDiv({ cls: "ttrpgmap-marker" });
      markerEl.style.left = `${marker.x * sx}px`;
      markerEl.style.top = `${marker.y * sy}px`;

      // Use marker values directly (template defaults applied at creation)
      const color = marker.color ?? "#ffffff";
      const iconColor = marker.iconColor ?? "#000000";
      const direction = marker.direction ?? "down";
      const textPlacement = marker.textPlacement ?? "above";

      markerEl.style.setProperty("--marker-color", color);
      markerEl.style.setProperty("--marker-icon-color", iconColor);
      markerEl.style.setProperty("--marker-scale", String(100 / this.zoom));
      markerEl.dataset.direction = direction;
      markerEl.dataset.textPlacement = textPlacement;
      markerEl.dataset.markerId = marker.id;

      // Marker pin shape (single SVG teardrop) with optional icon overlay
      const pin = markerEl.createDiv({ cls: "ttrpgmap-marker-pin" });
      const svgNs = "http://www.w3.org/2000/svg";
      const pinSvg = document.createElementNS(svgNs, "svg");
      pinSvg.setAttribute("viewBox", "0 0 640 640");
      pinSvg.setAttribute("class", "ttrpgmap-pin-svg");
      const pinPath = document.createElementNS(svgNs, "path");
      pinPath.setAttribute("d", "M320 64C214 64 128 148.4 128 252.6C128 371.9 248.2 514.9 298.4 569.4C310.2 582.2 329.8 582.2 341.6 569.4C391.8 514.9 512 371.9 512 252.6C512 148.4 426 64 320 64z");
      pinPath.setAttribute("fill", color);
      pinPath.setAttribute("stroke", "#000000");
      pinPath.setAttribute("stroke-width", "16");
      pinSvg.appendChild(pinPath);
      pin.appendChild(pinSvg);

      const markerIcon = marker.icon;
      if (markerIcon) {
        const iconEl = pin.createDiv({ cls: "ttrpgmap-marker-icon" });
        setIcon(iconEl, markerIcon);
      }

      // Label
      const label = markerEl.createDiv({ cls: "ttrpgmap-marker-label" });
      const noteName = marker.note;
      if (noteName) {
        label.createSpan({ cls: "ttrpgmap-marker-title", text: noteName.split("/").pop() ?? noteName });
      }
      const desc = marker.description;
      if (desc) {
        label.createSpan({ cls: "ttrpgmap-marker-desc", text: desc });
      }

      // Click to navigate (only if not dragging)
      if (noteName) {
        markerEl.addEventListener("click", (e) => {
          if (this.hasDragged) return;
          e.stopPropagation();
          this.plugin.app.workspace.openLinkText(noteName, "");
        });
      }

      // Drag to reposition
      markerEl.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
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

      // Right-click context menu on marker: Edit / Delete
      markerEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const menu = new Menu();
        menu.addItem((item) => {
          item.setTitle("Edit");
          item.onClick(() => this.editMarker(marker));
        });
        menu.addItem((item) => {
          item.setTitle("Delete");
          item.onClick(() => this.deleteMarker(marker));
        });
        menu.showAtMouseEvent(e);
      });
    }
  }

  // --- Toolbar ---
  private renderToolbar(): void {
    this.toolbar = this.wrapper.createDiv({ cls: "ttrpgmap-toolbar" });

    const calibrateBtn = this.toolbar.createDiv({
      cls: "ttrpgmap-toolbar-btn",
      attr: { "aria-label": "Set Distance Scale" },
    });
    calibrateBtn.setText("📏");
    calibrateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setMode("calibrate");
    });

    const measureBtn = this.toolbar.createDiv({
      cls: "ttrpgmap-toolbar-btn",
      attr: { "aria-label": "Measure Distance" },
    });
    measureBtn.setText("📐");
    measureBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setMode("measure");
    });
  }

  // --- Mode management ---
  private setMode(mode: InteractionMode): void {
    // If clicking the same mode, toggle back to pan
    if (this.mode === mode) {
      this.cancelDrawing();
      return;
    }

    if (mode === "measure" && !this.state?.distanceScale) {
      new Notice("Set a distance scale first (📏) before measuring.");
      return;
    }

    this.mode = mode;
    this.drawingPoints = [];
    this.clearActiveSvg();
    this.updateToolbarState();
    this.updateCursor();
  }

  private cancelDrawing(): void {
    this.mode = "pan";
    this.drawingPoints = [];
    this.clearActiveSvg();
    this.updateToolbarState();
    this.updateCursor();
  }

  private updateToolbarState(): void {
    const buttons = this.toolbar.querySelectorAll(".ttrpgmap-toolbar-btn");
    buttons.forEach((btn) => btn.removeClass("ttrpgmap-toolbar-btn-active"));

    if (this.mode === "calibrate") {
      buttons[0]?.addClass("ttrpgmap-toolbar-btn-active");
    } else if (this.mode === "measure") {
      buttons[1]?.addClass("ttrpgmap-toolbar-btn-active");
    }
  }

  private updateCursor(): void {
    this.wrapper.removeClass("ttrpgmap-panning");
    this.wrapper.style.cursor = this.mode === "pan" ? "grab" : "crosshair";
  }

  // --- SVG drawing helpers ---
  private clearActiveSvg(): void {
    for (const el of this.activeSvgElements) {
      el.remove();
    }
    this.activeSvgElements = [];
  }

  private drawSvgLine(a: MapPoint, b: MapPoint, cls: string): SVGLineElement {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("class", cls);
    this.svgOverlay.appendChild(line);
    this.activeSvgElements.push(line);
    return line;
  }

  private drawSvgCircle(p: MapPoint, r: number, cls: string): SVGCircleElement {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(p.x));
    circle.setAttribute("cy", String(p.y));
    circle.setAttribute("r", String(r));
    circle.setAttribute("class", cls);
    this.svgOverlay.appendChild(circle);
    this.activeSvgElements.push(circle);
    return circle;
  }

  private drawSvgText(p: MapPoint, text: string, cls: string): SVGTextElement {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
    el.setAttribute("x", String(p.x));
    el.setAttribute("y", String(p.y - 10));
    el.setAttribute("class", cls);
    el.textContent = text;
    this.svgOverlay.appendChild(el);
    this.activeSvgElements.push(el);
    return el;
  }

  // --- Map click handler for calibrate/measure modes ---
  private onMapClick(e: MouseEvent): void {
    if (this.mode === "pan") return;

    const rect = this.mapContainer.getBoundingClientRect();
    const scale = this.zoom / 100;
    const point: MapPoint = {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };

    this.drawingPoints.push(point);
    this.drawSvgCircle(point, 4, "ttrpgmap-draw-point");

    if (this.mode === "calibrate") {
      this.handleCalibrateClick(point);
    } else if (this.mode === "measure") {
      this.handleMeasureClick(point);
    }
  }

  private handleCalibrateClick(point: MapPoint): void {
    if (this.drawingPoints.length === 2) {
      const [a, b] = this.drawingPoints;
      this.drawSvgLine(a, b, "ttrpgmap-draw-line ttrpgmap-calibrate-line");

      const pxDist = pixelDistance(a, b);

      new ScaleCalibrationModal(this.plugin.app, pxDist, (units, unitLabel) => {
        if (!this.state) return;
        this.state.distanceScale = { pointA: a, pointB: b, units, unitLabel };
        this.plugin.dataManager.saveMapState(this.config.id, this.state);
        new Notice(`Scale set: ${units} ${unitLabel}`);
        this.cancelDrawing();
      }).open();
    }
  }

  private handleMeasureClick(point: MapPoint): void {
    if (this.drawingPoints.length >= 2) {
      const prev = this.drawingPoints[this.drawingPoints.length - 2];
      const curr = this.drawingPoints[this.drawingPoints.length - 1];
      this.drawSvgLine(prev, curr, "ttrpgmap-draw-line ttrpgmap-measure-line");

      // Show per-segment distance
      if (this.state?.distanceScale) {
        const segDist = pixelsToUnits(pixelDistance(prev, curr), this.state.distanceScale);
        if (segDist !== null) {
          const mid: MapPoint = { x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2 };
          this.drawSvgText(mid, `${segDist.toFixed(1)} ${this.state.distanceScale.unitLabel}`, "ttrpgmap-draw-label");
        }
      }
    }
  }

  private finishMeasuring(): void {
    if (!this.state?.distanceScale || this.drawingPoints.length < 2) {
      this.cancelDrawing();
      return;
    }

    const total = polylineUnitsDistance(this.drawingPoints, this.state.distanceScale);
    if (total !== null) {
      new Notice(`Total distance: ${total.toFixed(1)} ${this.state.distanceScale.unitLabel}`);
    }
    this.cancelDrawing();
  }

  private openSettings(): void {
    new MapSettingsModal(this.plugin.app, this.plugin, this.config, (updated) => {
      this.config = updated;
      this.applyWrapperSize();
      this.writeConfigToCodeBlock();
    }).open();
  }

  private async writeConfigToCodeBlock(): Promise<void> {
    const file = this.plugin.app.vault.getFileByPath(this.sourcePath);
    if (!file || !this.sectionInfo) return;

    const lines: string[] = [];
    lines.push(`image: ${this.config.image}`);
    if (this.config.height) lines.push(`height: ${this.config.height}`);
    if (this.config.width) lines.push(`width: ${this.config.width}`);
    if (this.config.zoomMin !== 50) lines.push(`zoommin: ${this.config.zoomMin}`);
    if (this.config.zoomMax !== 200) lines.push(`zoommax: ${this.config.zoomMax}`);
    if (this.config.zoomStep !== 10) lines.push(`zoomstep: ${this.config.zoomStep}`);

    const newBlock = "```ttrpgmap\n" + lines.join("\n") + "\n```";

    const content = await this.plugin.app.vault.read(file);
    const fileLines = content.split("\n");
    const { lineStart, lineEnd } = this.sectionInfo;

    fileLines.splice(lineStart, lineEnd - lineStart + 1, ...newBlock.split("\n"));
    await this.plugin.app.vault.modify(file, fileLines.join("\n"));
  }
}

/**
 * Renders a "Configure Map" button when the code block has no image set.
 */
export class EmptyMapRenderer extends MarkdownRenderChild {
  private plugin: TTRPGMapsPlugin;
  private sectionInfo: { lineStart: number; lineEnd: number } | null;
  private sourcePath: string;

  constructor(containerEl: HTMLElement, plugin: TTRPGMapsPlugin, sourcePath: string, sectionInfo: { lineStart: number; lineEnd: number } | null) {
    super(containerEl);
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.sectionInfo = sectionInfo;
  }

  onload(): void {
    const el = this.containerEl;
    el.empty();
    el.addClass("ttrpgmap-root");

    const placeholder = el.createDiv({ cls: "ttrpgmap-placeholder" });
    placeholder.createDiv({ cls: "ttrpgmap-placeholder-text", text: "TTRPG Map" });

    const btn = placeholder.createEl("button", {
      cls: "ttrpgmap-configure-btn",
      text: "Configure Map",
    });
    btn.addEventListener("click", () => {
      new ConfigureMapModal(this.plugin.app, this.plugin, (config) => {
        this.writeConfigToCodeBlock(config);
      }).open();
    });
  }

  private async writeConfigToCodeBlock(config: {
    image: string;
    height: string;
    width: string;
    zoomMin: number;
    zoomMax: number;
    zoomStep: number;
  }): Promise<void> {
    const file = this.plugin.app.vault.getFileByPath(this.sourcePath);
    if (!file || !this.sectionInfo) return;

    // Build the YAML content for the code block
    const lines: string[] = [];
    lines.push(`image: ${config.image}`);
    if (config.height) lines.push(`height: ${config.height}`);
    if (config.width) lines.push(`width: ${config.width}`);
    if (config.zoomMin !== 50) lines.push(`zoommin: ${config.zoomMin}`);
    if (config.zoomMax !== 200) lines.push(`zoommax: ${config.zoomMax}`);
    if (config.zoomStep !== 10) lines.push(`zoomstep: ${config.zoomStep}`);

    const newBlock = "```ttrpgmap\n" + lines.join("\n") + "\n```";

    // Read the file, replace the code block lines, write back
    const content = await this.plugin.app.vault.read(file);
    const fileLines = content.split("\n");
    const { lineStart, lineEnd } = this.sectionInfo;

    fileLines.splice(lineStart, lineEnd - lineStart + 1, ...newBlock.split("\n"));
    await this.plugin.app.vault.modify(file, fileLines.join("\n"));
  }
}
