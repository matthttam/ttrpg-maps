import { MarkdownRenderChild, Menu, Notice, setIcon } from "obsidian";
import type TTRPGMapsPlugin from "../main";
import { MapConfig, MapState, MapMarker, MapPoint } from "../types";
import { MapSettingsModal } from "../modals/MapSettingsModal";
import { MarkerEditModal } from "../modals/MarkerEditModal";
import { ScaleCalibrationModal } from "../modals/ScaleCalibrationModal";
import { serializeMapConfig, writeConfigToCodeBlock } from "../utils/configSerializer";
import { createPinElement } from "../utils/markerPin";
import { buildMarkerLabel, linkPath, displayTitle } from "../utils/markerLabel";
import { setFAIcon } from "../utils/faIcon";
import { pixelDistance, pixelsToUnits, polylineUnitsDistance } from "../distance";

type InteractionMode = "pan" | "calibrate" | "measure";

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

  // Drawing mode state
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
    this.buildToolbar();
    this.buildSettingsButton();
    this.buildMarkerListPanel();
    this.bindEvents();
    this.renderMarkers();
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

    controls.createDiv({ cls: "ttrpgmap-zoom-btn", text: "+" })
      .addEventListener("click", () => this.adjustZoom(this.config.zoomStep));

    controls.createDiv({ cls: "ttrpgmap-zoom-label" }).setText(`${this.zoom}%`);

    controls.createDiv({ cls: "ttrpgmap-zoom-btn", text: "−" })
      .addEventListener("click", () => this.adjustZoom(-this.config.zoomStep));

    controls.createDiv({ cls: "ttrpgmap-zoom-btn ttrpgmap-center-btn", text: "◎" })
      .addEventListener("click", () => this.centerMap());
  }

  private buildToolbar(): void {
    this.toolbar = this.wrapper.createDiv({ cls: "ttrpgmap-toolbar" });

    const calibrateBtn = this.toolbar.createDiv({
      cls: "ttrpgmap-toolbar-btn",
      attr: { "aria-label": "Set Distance Scale" },
    });
    calibrateBtn.setText("📏");
    calibrateBtn.addEventListener("click", (e) => { e.stopPropagation(); this.setMode("calibrate"); });

    const measureBtn = this.toolbar.createDiv({
      cls: "ttrpgmap-toolbar-btn",
      attr: { "aria-label": "Measure Distance" },
    });
    measureBtn.setText("📐");
    measureBtn.addEventListener("click", (e) => { e.stopPropagation(); this.setMode("measure"); });
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
      const nameA = a.note ? displayTitle(a.note) : "";
      const nameB = b.note ? displayTitle(b.note) : "";
      return nameA.localeCompare(nameB);
    });

    for (const marker of sorted) {
      const row = container.createDiv({ cls: "ttrpgmap-marker-list-row" });

      // Mini icon preview
      const preview = row.createDiv({ cls: "ttrpgmap-marker-list-preview" });
      const shape = marker.shape ?? "pin";
      createPinElement(preview, {
        pinClass: "ttrpgmap-marker-list-pin",
        svgClass: "ttrpgmap-pin-svg",
        color: marker.color ?? "#ffffff",
        icon: marker.icon,
        iconColor: marker.iconColor ?? "#000000",
        iconClass: "ttrpgmap-marker-list-icon",
        useBaseMarker: marker.useBaseMarker ?? true,
        shape,
      });

      // Name
      const name = marker.note ? displayTitle(marker.note) : "Unnamed";
      row.createDiv({ cls: "ttrpgmap-marker-list-name", text: name });

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
      if (e.key === "Escape" && this.mode !== "pan") this.cancelDrawing();
    });
    this.wrapper.addEventListener("dblclick", (e) => {
      if (this.mode === "measure" && this.drawingPoints.length >= 2) {
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
    const newZoom = Math.max(this.config.zoomMin, Math.min(this.config.zoomMax, this.zoom + delta));
    if (newZoom === this.zoom) return;
    this.zoom = newZoom;
    this.applyTransform();
    this.updateMarkerPositions();
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

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0 || this.mode !== "pan") return;
    this.isPanning = true;
    this.panStartX = e.clientX - this.panX;
    this.panStartY = e.clientY - this.panY;
    this.wrapper.addClass("ttrpgmap-panning");
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.draggingMarker && this.dragMarkerEl) {
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.hasDragged = true;
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

  private onMouseUp(): void {
    if (this.draggingMarker) {
      this.dragMarkerEl?.removeClass("ttrpgmap-marker-dragging");
      if (this.hasDragged) this.plugin.dataManager.saveMapState(this.config.id, this.state!);
      this.draggingMarker = null;
      this.dragMarkerEl = null;
      return;
    }
    this.isPanning = false;
    this.wrapper.removeClass("ttrpgmap-panning");
  }

  private onWheel(e: WheelEvent): void {
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
    this.updateMarkerPositions();

    const label = this.wrapper.querySelector(".ttrpgmap-zoom-label");
    if (label) label.setText(`${this.zoom}%`);
  }

  // ──────────────────── Markers ────────────────────

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
    const markers = this.state.markers;
    const els = this.markerOverlay.querySelectorAll<HTMLElement>(".ttrpgmap-marker");
    els.forEach((el, i) => {
      if (i >= markers.length) return;
      const { x, y } = this.toScreenCoords(markers[i].x, markers[i].y);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    });
  }

  private renderMarkers(): void {
    if (!this.state) return;
    this.markerOverlay.querySelectorAll(".ttrpgmap-marker").forEach((el) => el.remove());

    for (const marker of this.state.markers) {
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

      // Pin with icon
      const useBaseMarker = marker.useBaseMarker ?? true;
      const shape = marker.shape ?? "pin";
      createPinElement(markerEl, {
        pinClass: "ttrpgmap-marker-pin",
        svgClass: "ttrpgmap-pin-svg",
        color,
        icon: marker.icon,
        iconColor,
        iconClass: "ttrpgmap-marker-icon",
        useBaseMarker,
        shape,
      });

      // Label
      buildMarkerLabel(markerEl, marker.note, marker.description, "ttrpgmap-marker-label");

      // Click to navigate
      if (marker.note) {
        const navPath = linkPath(marker.note);
        markerEl.addEventListener("click", (e) => {
          if (this.hasDragged) return;
          e.stopPropagation();
          this.plugin.app.workspace.openLinkText(navPath, "");
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

      // Right-click menu
      markerEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const menu = new Menu();
        menu.addItem((item) => { item.setTitle("Edit"); item.onClick(() => this.editMarker(marker)); });
        menu.addItem((item) => { item.setTitle("Delete"); item.onClick(() => this.deleteMarker(marker)); });
        menu.showAtMouseEvent(e);
      });
    }
  }

  private placeMarker(x: number, y: number, templateId: string): void {
    if (!this.state) return;
    const template = this.plugin.settings.markerTemplates.find((t) => t.id === templateId);

    const marker: MapMarker = {
      id: `marker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      templateId, x, y,
      note: null, description: null,
      direction: template?.direction ?? "down",
      textPlacement: template?.textPlacement ?? "above",
      color: template?.color ?? "#ffffff",
      icon: template?.icon ?? null,
      iconColor: template?.iconColor ?? "#000000",
      useBaseMarker: template?.useBaseMarker ?? true,
      shape: template?.shape ?? "pin",
    };

    new MarkerEditModal(this.plugin.app, this.plugin, marker, (updated) => {
      Object.assign(marker, updated);
      this.state!.markers.push(marker);
      this.plugin.dataManager.saveMapState(this.config.id, this.state!);
      this.renderMarkers();
      this.refreshMarkerList();
    }).open();
  }

  private editMarker(marker: MapMarker): void {
    new MarkerEditModal(this.plugin.app, this.plugin, marker, (updated) => {
      Object.assign(marker, updated);
      this.plugin.dataManager.saveMapState(this.config.id, this.state!);
      this.renderMarkers();
      this.refreshMarkerList();
    }).open();
  }

  private deleteMarker(marker: MapMarker): void {
    if (!this.state) return;
    this.state.markers = this.state.markers.filter((m) => m.id !== marker.id);
    this.plugin.dataManager.saveMapState(this.config.id, this.state);
    this.renderMarkers();
    this.refreshMarkerList();
  }

  // ──────────────────── Context Menu ────────────────────

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();

    if (this.mode === "measure" && this.drawingPoints.length >= 2) { this.finishMeasuring(); return; }
    if (this.mode !== "pan") { this.cancelDrawing(); return; }
    if (!this.state) return;

    const rect = this.mapContainer.getBoundingClientRect();
    const scale = this.zoom / 100;
    const { sx, sy } = this.getImageScale();
    const mapX = (e.clientX - rect.left) / scale / sx;
    const mapY = (e.clientY - rect.top) / scale / sy;

    const menu = new Menu();
    const templates = this.plugin.settings.markerTemplates;
    const defaultTemplate = templates.find((t) => t.id === "default") ?? templates[0];
    if (defaultTemplate) {
      menu.addItem((item) => {
        item.setTitle("Place Marker");
        item.setIcon("map-pin");
        item.onClick(() => this.placeMarker(mapX, mapY, defaultTemplate.id));
      });
    }
    if (templates.length > 1) {
      menu.addSeparator();
      for (const template of templates) {
        menu.addItem((item) => {
          item.setTitle(`Place: ${template.name}`);
          item.onClick(() => this.placeMarker(mapX, mapY, template.id));
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

  // ──────────────────── Drawing (Calibrate / Measure) ────────────────────

  private setMode(mode: InteractionMode): void {
    if (this.mode === mode) { this.cancelDrawing(); return; }
    if (mode === "measure" && !this.state?.distanceScale) {
      new Notice("Set a distance scale first (📏) before measuring.");
      return;
    }
    this.mode = mode;
    this.drawingPoints = [];
    this.clearActiveSvg();
    this.updateToolbarState();
    this.wrapper.style.cursor = this.mode === "pan" ? "grab" : "crosshair";
  }

  private cancelDrawing(): void {
    this.mode = "pan";
    this.drawingPoints = [];
    this.clearActiveSvg();
    this.updateToolbarState();
    this.wrapper.style.cursor = "grab";
    this.wrapper.removeClass("ttrpgmap-panning");
  }

  private updateToolbarState(): void {
    const buttons = this.toolbar.querySelectorAll(".ttrpgmap-toolbar-btn");
    buttons.forEach((btn) => btn.removeClass("ttrpgmap-toolbar-btn-active"));
    if (this.mode === "calibrate") buttons[0]?.addClass("ttrpgmap-toolbar-btn-active");
    else if (this.mode === "measure") buttons[1]?.addClass("ttrpgmap-toolbar-btn-active");
  }

  private onMapClick(e: MouseEvent): void {
    if (this.mode === "pan") return;
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
    this.drawSvgLine(a, b, "ttrpgmap-draw-line ttrpgmap-calibrate-line");

    new ScaleCalibrationModal(this.plugin.app, pixelDistance(a, b), (units, unitLabel) => {
      if (!this.state) return;
      this.state.distanceScale = { pointA: a, pointB: b, units, unitLabel };
      this.plugin.dataManager.saveMapState(this.config.id, this.state);
      new Notice(`Scale set: ${units} ${unitLabel}`);
      this.cancelDrawing();
    }).open();
  }

  private handleMeasureClick(): void {
    if (this.drawingPoints.length < 2) return;
    const prev = this.drawingPoints[this.drawingPoints.length - 2];
    const curr = this.drawingPoints[this.drawingPoints.length - 1];
    this.drawSvgLine(prev, curr, "ttrpgmap-draw-line ttrpgmap-measure-line");

    if (this.state?.distanceScale) {
      const segDist = pixelsToUnits(pixelDistance(prev, curr), this.state.distanceScale);
      if (segDist !== null) {
        const mid: MapPoint = { x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2 };
        this.drawSvgText(mid, `${segDist.toFixed(1)} ${this.state.distanceScale.unitLabel}`, "ttrpgmap-draw-label");
      }
    }
  }

  private finishMeasuring(): void {
    if (!this.state?.distanceScale || this.drawingPoints.length < 2) { this.cancelDrawing(); return; }
    const total = polylineUnitsDistance(this.drawingPoints, this.state.distanceScale);
    if (total !== null) new Notice(`Total distance: ${total.toFixed(1)} ${this.state.distanceScale.unitLabel}`);
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
    new MapSettingsModal(this.plugin.app, this.plugin, this.config, (updated) => {
      this.config = updated;
      this.applyWrapperSize();
      if (this.sectionInfo) {
        writeConfigToCodeBlock(this.plugin.app, this.sourcePath, this.sectionInfo, serializeMapConfig(this.config));
      }
    }).open();
  }
}
