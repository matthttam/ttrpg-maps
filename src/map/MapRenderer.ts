import { MarkdownRenderChild, Menu, setIcon, parseLinktext } from 'obsidian';
import { buildPlaceMarkerMenu } from './contextMenu';
import { confirmAction } from '../utils/confirmModal';
import type TTRPGMapsPlugin from '../main';
import {
	MapConfig,
	MapState,
	MapMarker,
	MapPoint,
	MarkerLayer,
	DEFAULT_LAYER_ID,
	DEFAULT_LAYER,
	DEFAULT_MARKER_SCALE,
	DEFAULT_MARKER_TEXT_SCALE,
	TextVisibility,
	getMarkerFontStack,
} from '../types';
import { MapSettingsModal } from '../modals/MapSettingsModal';
import { MarkerEditModal } from '../modals/MarkerEditModal';
import { ZoneEditModal } from '../modals/ZoneEditModal';
import { ZoneDrawController } from './ZoneDrawController';
import {
	anchorZonePoints,
	appendZoneListPreview,
	darkenHex,
	isZone,
	resolveZonePoints,
	zoneArea,
	zoneCentroid,
	zoneFillOpacity,
	zonePointsAttr,
} from '../utils/zoneGeometry';
import { LayerEditModal } from '../modals/LayerEditModal';
import { serializeMapConfig, writeConfigToCodeBlock } from '../utils/configSerializer';
import { createPinElement } from '../utils/markerPin';
import { buildMarkerLabel, linkPath, displayTitle } from '../utils/markerLabel';
import { generateMarkerId } from '../utils/mapId';
import { NO_ZOOM_SVG, NO_PAN_SVG } from '../icons/lockIcons';
import { MeasurementController, MeasurementContext } from './MeasurementController';
import { InteractionManager } from './InteractionManager';

const RESIZE_SCALE_SENSITIVITY = 0.005;
const MIN_MARKER_SCALE = 0.1;
const MAX_MARKER_SCALE = 10.0;
const MIN_MARKER_TEXT_SCALE = 0.1;
const MAX_MARKER_TEXT_SCALE = 10.0;
const SCROLL_SCALE_STEP = 0.05;
const RESIZE_SAVE_DEBOUNCE_MS = 300;
const DEFAULT_MAX_RENDERED_MARKERS = 200;

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
	private markerListScroll: HTMLElement | null = null;
	private markerCullBanner: HTMLElement | null = null;

	// Interaction state
	private interaction!: InteractionManager;

	// Pan/zoom state
	private zoom = 100;
	private panX = 0;
	private panY = 0;
	private panStartX = 0;
	private panStartY = 0;
	private zoomLocked = false;
	private panLocked = false;
	private markersLocked = false;

	// Marker focus state (last-hovered stays promoted via incrementing z-index)
	private markerZCounter = 0;

	// Hot zones: polygons live in their own <g> inside the transformed SVG overlay
	private zoneLayer!: SVGGElement;
	private zoneDraw!: ZoneDrawController;
	/** Authoring aid: reveal every zone outline, not just the hovered one. */
	private showAllZoneOutlines = false;
	/** Zone currently being redrawn: hidden so it cannot block drawing over it. */
	private redrawingZoneId: string | null = null;

	// Marker drag state
	private draggingMarker: MapMarker | null = null;
	private dismissActiveHover: (() => void) | null = null;
	private dragMarkerEl: HTMLElement | null = null;
	private dragStartX = 0;
	private dragStartY = 0;
	private dragOrigX = 0;
	private dragOrigY = 0;
	private hasDragged = false;

	// Measurement/drawing delegate
	private measurement!: MeasurementController;

	// Map edge resize state
	private edgeResizeAxis: 'width' | 'height' | null = null;
	private edgeHoverAxis: 'width' | 'height' | null = null;
	private edgeResizeStartPos = 0;
	private edgeResizeStartSize = 0;

	// Resize mode state
	private resizingMarker: MapMarker | null = null;
	private resizeMarkerEl: HTMLElement | null = null;
	private resizeHandleEl: HTMLElement | null = null;
	private resizeStartX = 0;
	private resizeStartScale = 1;
	private resizeTarget: 'marker' | 'text' = 'marker';
	private resizeHandleSide: 'left' | 'right' = 'right';
	private _resizeSaveTimeout: number | null = null;

	// Copy-marker state
	private pendingCopy: MapMarker | null = null;
	private _cancelCopy: (() => void) | null = null;

	// Container resize handling
	private resizeObserver: ResizeObserver | null = null;
	private _resizeDebounce: number | null = null;

	// Layer panel state (non-persisted, session only)
	private layerVisibilityOverrides: Map<string, 'show' | 'hide' | 'always'> = new Map();
	private activeListTab: 'markers' | 'layers' = 'markers';
	private layerListContainer: HTMLElement | null = null;

	// Control containers (for visibility toggling without DOM rebuild)
	private zoomControlsEl: HTMLElement | null = null;
	private measurePanelEl: HTMLElement | null = null;
	private settingsBtnEl: HTMLElement | null = null;
	private markerListPanelEl: HTMLElement | null = null;
	private markersTabEl: HTMLElement | null = null;
	private layersTabEl: HTMLElement | null = null;
	private tabRowEl: HTMLElement | null = null;
	private listWrapperEl: HTMLElement | null = null;
	private listPinBtnEl: HTMLElement | null = null;
	private listPinned = false;

	// Lock button elements (for syncing visual state after settings save)
	private zoomLockBtnEl: HTMLElement | null = null;
	private panLockBtnEl: HTMLElement | null = null;
	private markerLockBtnEl: HTMLElement | null = null;
	private zoomInBtnEl: HTMLElement | null = null;
	private zoomOutBtnEl: HTMLElement | null = null;

	constructor(
		containerEl: HTMLElement,
		plugin: TTRPGMapsPlugin,
		config: MapConfig,
		sourcePath: string,
		sectionInfo: { lineStart: number; lineEnd: number } | null,
	) {
		super(containerEl);
		this.plugin = plugin;
		this.config = config;
		this.sourcePath = sourcePath;
		this.sectionInfo = sectionInfo;
	}

	private refreshCallback = () => {
		void (async () => {
			this.state = await this.plugin.dataManager.loadMapState(this.config.id);
			this.applyControlVisibility();
			this.applyControlOpacity();
			this.applyLockState();
			this.renderMarkers();
			this.refreshMarkerList();
		})();
	};

	onload(): void {
		void (async () => {
			this.state = await this.plugin.dataManager.loadMapState(this.config.id);
			// Register last known paths for identification in data management
			this.state.lastImagePath = this.config.image;
			this.state.lastSourcePath = this.sourcePath;
			// Restore persisted view state
			if (this.state.savedZoom != null) this.zoom = this.state.savedZoom;
			if (this.state.savedPanX != null) this.panX = this.state.savedPanX;
			if (this.state.savedPanY != null) this.panY = this.state.savedPanY;
			this._lastSettledZoom = this.zoom;
			this.plugin.dataManager.saveMapState(this.config.id, this.state);
			this.plugin.onMapRefresh(this.refreshCallback);
			this.buildDOM();
		})();
	}

	onunload(): void {
		// Persist view state so it restores on back-navigation
		if (this.state) {
			this.state.savedZoom = this.zoom;
			this.state.savedPanX = this.panX;
			this.state.savedPanY = this.panY;
			this.plugin.dataManager.saveMapState(this.config.id, this.state);
		}
		this.plugin.offMapRefresh(this.refreshCallback);
		if (this._cancelCopy) {
			this._cancelCopy();
			this._cancelCopy = null;
		}
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		if (this._resizeDebounce) {
			activeWindow.clearTimeout(this._resizeDebounce);
			this._resizeDebounce = null;
		}
	}

	// ──────────────────── DOM Setup ────────────────────

	private buildDOM(): void {
		const el = this.containerEl;
		el.empty();
		el.addClass('ttrpgmap-root');

		this.wrapper = el.createDiv({ cls: 'ttrpgmap-wrapper' });
		this.interaction = new InteractionManager(() => this.updateCursor());
		this.applyWrapperSize();

		this.mapContainer = this.wrapper.createDiv({ cls: 'ttrpgmap-container' });

		this.imageEl = this.mapContainer.createEl('img', { cls: 'ttrpgmap-image' });
		this.loadImage();

		this.svgOverlay = createSvg('svg', { cls: 'ttrpgmap-svg-overlay' });
		this.mapContainer.appendChild(this.svgOverlay);

		// Zone polygons paint before measurement lines, so lines stay readable on top
		this.zoneLayer = createSvg('g', { cls: 'ttrpgmap-zone-layer' });
		this.svgOverlay.appendChild(this.zoneLayer);
		this.zoneDraw = new ZoneDrawController({
			surface: this.mapContainer,
			svgOverlay: this.svgOverlay,
			interaction: this.interaction,
			screenToMap: (e) => this.screenToMapPoint(e),
			getImageScale: () => this.getImageScale(),
			onDrawStateChange: () => {
				// Drawing began or ended: drop any redraw hide and re-render so markers
				// and zones pick up or release the inert state.
				if (!this.zoneDraw.isDrawing) this.redrawingZoneId = null;
				this.renderMarkers();
			},
		});

		// Marker overlay sits outside the scaled container for crisp rendering
		this.markerOverlay = this.wrapper.createDiv({ cls: 'ttrpgmap-marker-overlay' });

		this.imageEl.addEventListener('load', () => {
			this.svgOverlay.setAttribute('width', String(this.imageEl.naturalWidth));
			this.svgOverlay.setAttribute('height', String(this.imageEl.naturalHeight));
			this.applyWrapperSize();
			this.updateImageScaleCache();
			this.applyTransform();
			this.syncViewportMarkers(true);
			this.renderMarkers();
		});

		this.buildZoomControls();
		this.measurement = new MeasurementController(this.getMeasurementContext());
		this.measurement.buildUI();
		this.measurePanelEl = this.measurement.panelEl;
		this.buildSettingsButton();
		this.buildMarkerListPanel();
		this.markerCullBanner = this.wrapper.createDiv({ cls: 'ttrpgmap-cull-banner ttrpgmap-hidden' });
		this.applyControlVisibility();
		this.applyControlOpacity();
		this.bindEvents();

		// Render markers immediately (positions corrected on image load)
		this.renderMarkers();

		// Throttle layout during resize: hide overlays and pause image rendering
		this.resizeObserver = new ResizeObserver(() => {
			if (!this._resizeDebounce) {
				this.markerOverlay.addClass('ttrpgmap-visibility-hidden');
				this.svgOverlay.addClass('ttrpgmap-hidden');
				this.imageEl.addClass('ttrpgmap-pixelated');
			} else {
				activeWindow.clearTimeout(this._resizeDebounce);
			}
			this._resizeDebounce = activeWindow.setTimeout(() => {
				this._resizeDebounce = null;
				this.imageEl.removeClass('ttrpgmap-pixelated');
				this.svgOverlay.removeClass('ttrpgmap-hidden');
				this.updateImageScaleCache();
				this.syncViewportMarkers(true);
				// SVG draw helpers cache sx/sy at the moment of creation; a wrapper
				// resize invalidates those positions, so redraw the in-progress
				// measurement (if any) using the new display ratio.
				this.measurement.redrawActiveMeasurements();
				this.markerOverlay.removeClass('ttrpgmap-visibility-hidden');
			}, 150);
		});
		this.resizeObserver.observe(this.wrapper);
	}

	private loadImage(): void {
		const file = this.plugin.app.vault.getFileByPath(this.config.image);
		if (!file) {
			this.wrapper.empty();
			this.wrapper.createDiv({ cls: 'ttrpgmap-error', text: `Image not found: ${this.config.image}` });
			return;
		}
		this.imageEl.src = this.plugin.app.vault.getResourcePath(file);
		this.imageEl.draggable = false;
	}

	private buildZoomControls(): void {
		const controls = this.wrapper.createDiv({ cls: 'ttrpgmap-zoom-controls' });
		this.zoomControlsEl = controls;

		const zoomInBtn = controls.createDiv({ cls: 'ttrpgmap-zoom-btn', text: '+' });
		this.zoomInBtnEl = zoomInBtn;
		zoomInBtn.addEventListener('click', () => this.adjustZoom(this.config.zoomStep));

		controls.createDiv({ cls: 'ttrpgmap-zoom-label' }).setText(`${this.zoom}%`);

		const zoomOutBtn = controls.createDiv({ cls: 'ttrpgmap-zoom-btn', text: '−' });
		this.zoomOutBtnEl = zoomOutBtn;
		zoomOutBtn.addEventListener('click', () => this.adjustZoom(-this.config.zoomStep));

		controls
			.createDiv({
				cls: 'ttrpgmap-zoom-btn ttrpgmap-center-btn',
				text: '◎',
				attr: { 'aria-label': 'Center map', 'data-tooltip-position': 'right' },
			})
			.addEventListener('click', () => this.centerMap());

		const fitBtn = controls.createDiv({
			cls: 'ttrpgmap-zoom-btn',
			attr: { 'aria-label': 'Fit to screen', 'data-tooltip-position': 'right' },
		});
		setIcon(fitBtn, 'maximize');
		fitBtn.addEventListener('click', () => this.fitToScreen());

		// Lock toggles (inside zoom controls strip)
		this.zoomLocked = this.state?.zoomLocked ?? false;
		this.panLocked = this.state?.panLocked ?? false;

		const zoomLockBtn = controls.createDiv({
			cls: 'ttrpgmap-zoom-btn ttrpgmap-lock-btn',
			attr: { 'aria-label': 'Lock zoom', 'data-tooltip-position': 'right' },
		});
		this.zoomLockBtnEl = zoomLockBtn;
		const zoomLockDoc = new DOMParser().parseFromString(NO_ZOOM_SVG, 'image/svg+xml');
		zoomLockBtn.empty();
		zoomLockBtn.appendChild(zoomLockDoc.documentElement);
		if (this.zoomLocked) {
			zoomLockBtn.addClass('is-active');
			zoomInBtn.addClass('ttrpgmap-btn-disabled');
			zoomOutBtn.addClass('ttrpgmap-btn-disabled');
		}
		zoomLockBtn.addEventListener('click', () => {
			this.zoomLocked = !this.zoomLocked;
			zoomLockBtn.toggleClass('is-active', this.zoomLocked);
			zoomInBtn.toggleClass('ttrpgmap-btn-disabled', this.zoomLocked);
			zoomOutBtn.toggleClass('ttrpgmap-btn-disabled', this.zoomLocked);
			if (this.state) {
				this.state.zoomLocked = this.zoomLocked;
				this.plugin.dataManager.saveMapState(this.config.id, this.state);
			}
		});

		const panLockBtn = controls.createDiv({
			cls: 'ttrpgmap-zoom-btn ttrpgmap-lock-btn',
			attr: { 'aria-label': 'Lock pan', 'data-tooltip-position': 'right' },
		});
		this.panLockBtnEl = panLockBtn;
		const panLockDoc = new DOMParser().parseFromString(NO_PAN_SVG, 'image/svg+xml');
		panLockBtn.empty();
		panLockBtn.appendChild(panLockDoc.documentElement);
		if (this.panLocked) {
			panLockBtn.addClass('is-active');
			this.wrapper.addClass('ttrpgmap-pan-locked');
		}
		panLockBtn.addEventListener('click', () => {
			this.panLocked = !this.panLocked;
			panLockBtn.toggleClass('is-active', this.panLocked);
			this.wrapper.toggleClass('ttrpgmap-pan-locked', this.panLocked);
			this.updateCursor();
			if (this.state) {
				this.state.panLocked = this.panLocked;
				this.plugin.dataManager.saveMapState(this.config.id, this.state);
			}
		});

		// Marker lock toggle
		this.markersLocked = this.state?.markersLocked ?? false;
		const markerLockBtn = controls.createDiv({
			cls: 'ttrpgmap-zoom-btn ttrpgmap-lock-btn',
			attr: { 'aria-label': 'Lock markers', 'data-tooltip-position': 'right' },
		});
		this.markerLockBtnEl = markerLockBtn;
		setIcon(markerLockBtn, this.markersLocked ? 'map-pin-off' : 'map-pin');
		if (this.markersLocked) markerLockBtn.addClass('is-active');
		markerLockBtn.addEventListener('click', () => {
			this.markersLocked = !this.markersLocked;
			markerLockBtn.toggleClass('is-active', this.markersLocked);
			markerLockBtn.empty();
			setIcon(markerLockBtn, this.markersLocked ? 'map-pin-off' : 'map-pin');
			if (this.state) {
				this.state.markersLocked = this.markersLocked;
				this.plugin.dataManager.saveMapState(this.config.id, this.state);
			}
		});
	}

	/** Show a brief warning toast. Hovering pauses dismissal. Clicking opens map settings. */
	private showLockWarning(text: string, settingName?: string): void {
		this.wrapper.querySelector('.ttrpgmap-lock-warning')?.remove();
		const warning = this.wrapper.createDiv({ cls: 'ttrpgmap-lock-warning', text });

		// Position next to zoom controls if visible, otherwise top-left fallback
		const controls = this.zoomControlsEl;
		if (controls && !controls.hasClass('ttrpgmap-hidden')) {
			const rect = controls.getBoundingClientRect();
			const wrapperRect = this.wrapper.getBoundingClientRect();
			warning.setCssStyles({
				top: `${rect.top - wrapperRect.top}px`,
				left: `${rect.right - wrapperRect.left + 8}px`,
			});
		} else {
			warning.setCssStyles({ top: '10px', left: '10px' });
		}

		if (settingName) {
			warning.addClass('ttrpgmap-lock-warning-clickable');
			warning.addEventListener('click', () => {
				warning.remove();
				this.openSettings(settingName);
			});
		}

		// Auto-dismiss after 2s, but pause while hovering
		let timer = activeWindow.setTimeout(() => warning.remove(), 2000);
		warning.addEventListener('mouseenter', () => {
			activeWindow.clearTimeout(timer);
			warning.addClass('ttrpgmap-lock-warning-paused');
		});
		warning.addEventListener('mouseleave', () => {
			warning.removeClass('ttrpgmap-lock-warning-paused');
			timer = activeWindow.setTimeout(() => warning.remove(), 1000);
		});
	}

	private getMeasurementContext(): MeasurementContext {
		return {
			app: this.plugin.app,
			wrapper: this.wrapper,
			mapContainer: this.mapContainer,
			svgOverlay: this.svgOverlay,
			getZoom: () => this.zoom,
			getImageScale: () => this.getImageScale(),
			getState: () => this.state,
			config: this.config,
			plugin: this.plugin,
			renderMarkers: () => this.renderMarkers(),
			cancelCopy: () => {
				if (this._cancelCopy) {
					this._cancelCopy();
					this._cancelCopy = null;
				}
			},
			openSettings: () => this.openSettings('Measurement'),
			interaction: this.interaction,
		};
	}

	private buildSettingsButton(): void {
		const btn = this.wrapper.createDiv({ cls: 'ttrpgmap-settings-btn' });
		this.settingsBtnEl = btn;
		btn.setText('⚙');
		btn.setAttribute('aria-label', 'Map settings');
		btn.addEventListener('click', () => this.openSettings());
	}

	private buildMarkerListPanel(): void {
		const panel = this.wrapper.createDiv({ cls: 'ttrpgmap-marker-list-panel' });
		this.markerListPanelEl = panel;
		this.listPinned = false;

		// Wrapper for pin tab + list (sits above tabs)
		const listWrapper = panel.createDiv({ cls: 'ttrpgmap-marker-list-wrapper' });
		listWrapper.addClass('ttrpgmap-hidden');
		this.listWrapperEl = listWrapper;

		// Pin tab attached to top-left of list
		const pinBtn = listWrapper.createDiv({ cls: 'ttrpgmap-marker-list-pin-tab' });
		setIcon(pinBtn, 'pin-off');
		this.listPinBtnEl = pinBtn;
		pinBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.listPinned = !this.listPinned;
			pinBtn.empty();
			setIcon(pinBtn, this.listPinned ? 'pin' : 'pin-off');
			panel.toggleClass('ttrpgmap-marker-list-pinned', this.listPinned);
			listWrapper.toggleClass('ttrpgmap-marker-list-wrapper-pinned', this.listPinned);
		});

		// List container
		const listContainer = listWrapper.createDiv({ cls: 'ttrpgmap-marker-list-container' });

		// Scrollable marker list area
		const markerScroll = listContainer.createDiv({ cls: 'ttrpgmap-marker-list-scroll' });
		this.markerListScroll = markerScroll;

		// Scrollable layer list area (hidden by default)
		const layerScroll = listContainer.createDiv({ cls: 'ttrpgmap-marker-list-scroll ttrpgmap-hidden' });
		this.layerListContainer = layerScroll;

		// Prevent scroll from zooming the map when the list is scrollable
		const preventScrollZoom = (el: HTMLElement) => {
			el.addEventListener('wheel', (e) => {
				const atTop = el.scrollTop === 0;
				const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight;
				const scrollingUp = e.deltaY < 0;
				if ((scrollingUp && atTop) || (!scrollingUp && atBottom)) return;
				e.stopPropagation();
			});
		};
		preventScrollZoom(markerScroll);
		preventScrollZoom(layerScroll);

		// Tab buttons at the bottom
		const tabRow = panel.createDiv({ cls: 'ttrpgmap-panel-tabs' });
		this.tabRowEl = tabRow;

		const markersTab = tabRow.createDiv({ cls: 'ttrpgmap-marker-list-toggle', attr: { 'aria-label': 'Markers' } });
		setIcon(markersTab, 'list');
		this.markersTabEl = markersTab;

		const layersTab = tabRow.createDiv({ cls: 'ttrpgmap-marker-list-toggle', attr: { 'aria-label': 'Layers' } });
		setIcon(layersTab, 'layers');
		this.layersTabEl = layersTab;

		const switchTab = (tab: 'markers' | 'layers') => {
			this.activeListTab = tab;
			markerScroll.toggleClass('ttrpgmap-hidden', tab !== 'markers');
			layerScroll.toggleClass('ttrpgmap-hidden', tab !== 'layers');
			markersTab.toggleClass('ttrpgmap-panel-tab-active', tab === 'markers');
			layersTab.toggleClass('ttrpgmap-panel-tab-active', tab === 'layers');
			if (tab === 'markers') this.renderMarkerList(markerScroll);
			if (tab === 'layers') this.renderLayerList(layerScroll);
		};

		const handleTabClick = (tab: 'markers' | 'layers') => {
			const isOpen = !listWrapper.hasClass('ttrpgmap-hidden');
			if (isOpen && this.activeListTab === tab && !this.listPinned) {
				// Clicking the active tab when not pinned closes the panel
				listWrapper.addClass('ttrpgmap-hidden');
				markersTab.removeClass('ttrpgmap-panel-tab-active');
				layersTab.removeClass('ttrpgmap-panel-tab-active');
				return;
			}
			listWrapper.removeClass('ttrpgmap-hidden');
			switchTab(tab);
		};

		markersTab.addEventListener('click', (e) => {
			e.stopPropagation();
			handleTabClick('markers');
		});

		layersTab.addEventListener('click', (e) => {
			e.stopPropagation();
			handleTabClick('layers');
		});
	}

	private renderLayerList(container: HTMLElement): void {
		container.empty();
		if (!this.state) return;

		for (const layer of this.state.layers) {
			this.buildLayerRow(container, layer);
		}
		this.buildAddLayerRow(container);
	}

	private buildLayerRow(container: HTMLElement, layer: MarkerLayer): void {
		const layerId = layer.id;
		const row = container.createDiv({ cls: 'ttrpgmap-marker-list-row' });

		// Name + zoom range badge
		const nameEl = row.createDiv({ cls: 'ttrpgmap-marker-list-name' });
		nameEl.setText(layer.name);
		const rangeText = this.formatZoomRangeShort(layer);
		if (rangeText) nameEl.createSpan({ cls: 'ttrpgmap-layer-range-badge', text: ` ${rangeText}` });

		// Actions
		const actionGroup = row.createDiv({ cls: 'ttrpgmap-layer-action-group' });
		this.buildLayerVisibilityToggle(actionGroup, layerId);
		this.buildLayerEditButton(actionGroup, layer, container);
		if (layer.id === DEFAULT_LAYER_ID) {
			this.buildLayerResetButton(actionGroup, layer, container);
		} else {
			this.buildLayerDeleteButton(actionGroup, layer, container);
		}

		// Click: bounce and highlight visible markers on this layer, dim others
		row.addEventListener('mouseenter', () => {});
		row.addEventListener('mouseleave', () => {
			this.markerOverlay.querySelectorAll<HTMLElement>('.ttrpgmap-marker').forEach((el) => {
				el.removeClass('ttrpgmap-marker-layer-highlight');
				el.setCssStyles({ opacity: '' });
				this.stopBounce(el);
			});
		});
		row.addEventListener('click', (e) => {
			e.stopPropagation();
			this.markerOverlay.querySelectorAll<HTMLElement>('.ttrpgmap-marker').forEach((el) => {
				const mid = el.dataset.markerId;
				if (!mid || !this.state) return;
				const marker = this.state.markers.find((m) => m.id === mid);
				if (!marker) return;
				if ((marker.layerId ?? DEFAULT_LAYER_ID) === layerId) {
					this.startBounce(el);
					el.addClass('ttrpgmap-marker-layer-highlight');
					el.setCssStyles({ opacity: '1' });
				} else {
					el.setCssStyles({ opacity: '0.3' });
				}
			});
		});
	}

	private buildLayerVisibilityToggle(actionGroup: HTMLElement, layerId: string): void {
		const visOverride = this.layerVisibilityOverrides.get(layerId) ?? 'show';
		const eyeBtn = actionGroup.createDiv({
			cls: 'ttrpgmap-marker-list-action',
			attr: { 'aria-label': this.getVisibilityLabel(visOverride) },
		});
		const updateIcon = (vis: 'show' | 'hide' | 'always') => {
			eyeBtn.empty();
			eyeBtn.removeClass('ttrpgmap-layer-eye-always');
			if (vis === 'hide') setIcon(eyeBtn, 'eye-off');
			else if (vis === 'always') {
				setIcon(eyeBtn, 'eye');
				eyeBtn.addClass('ttrpgmap-layer-eye-always');
			} else setIcon(eyeBtn, 'minus');
			eyeBtn.setAttribute('aria-label', this.getVisibilityLabel(vis));
		};
		updateIcon(visOverride);
		eyeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const current = this.layerVisibilityOverrides.get(layerId) ?? 'show';
			const next = current === 'show' ? 'hide' : current === 'hide' ? 'always' : 'show';
			this.layerVisibilityOverrides.set(layerId, next);
			updateIcon(next);
			this.syncViewportMarkers(true);
			this.refreshMarkerList();
		});
	}

	private buildLayerEditButton(actionGroup: HTMLElement, layer: MarkerLayer, container: HTMLElement): void {
		const btn = actionGroup.createDiv({ cls: 'ttrpgmap-marker-list-action', attr: { 'aria-label': 'Edit layer' } });
		setIcon(btn, 'pencil');
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			new LayerEditModal(this.plugin.app, {
				layer,
				mapZoomMin: this.config.zoomMin,
				mapZoomMax: this.config.zoomMax,
				onSave: (saved) => {
					Object.assign(layer, saved);
					if (this.state) this.plugin.dataManager.saveMapState(this.config.id, this.state);
					this.renderLayerList(container);
					this.syncViewportMarkers(true);
				},
			}).open();
		});
	}

	private buildLayerResetButton(actionGroup: HTMLElement, layer: MarkerLayer, container: HTMLElement): void {
		const btn = actionGroup.createDiv({
			cls: 'ttrpgmap-marker-list-action',
			attr: { 'aria-label': 'Reset to defaults' },
		});
		setIcon(btn, 'rotate-ccw');
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			layer.name = DEFAULT_LAYER.name;
			layer.zoomMin = DEFAULT_LAYER.zoomMin;
			layer.zoomMax = DEFAULT_LAYER.zoomMax;
			if (this.state) this.plugin.dataManager.saveMapState(this.config.id, this.state);
			this.renderLayerList(container);
			this.syncViewportMarkers(true);
		});
	}

	private buildLayerDeleteButton(actionGroup: HTMLElement, layer: MarkerLayer, container: HTMLElement): void {
		const btn = actionGroup.createDiv({
			cls: 'ttrpgmap-marker-list-action ttrpgmap-marker-list-delete',
			attr: { 'aria-label': 'Delete layer' },
		});
		setIcon(btn, 'trash-2');
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (!this.state) return;
			const count = this.state.markers.filter((m) => m.layerId === layer.id).length;
			const msg =
				count > 0
					? `Delete "${layer.name}"? ${count} marker${count !== 1 ? 's' : ''} will be moved to the Default Layer.`
					: `Delete "${layer.name}"?`;
			void confirmAction(this.plugin.app, 'Delete layer', msg, 'Delete').then((confirmed) => {
				if (!confirmed || !this.state) return;
				for (const m of this.state.markers) {
					if (m.layerId === layer.id) m.layerId = null;
				}
				this.state.layers = this.state.layers.filter((l) => l.id !== layer.id);
				this.layerVisibilityOverrides.delete(layer.id);
				this.plugin.dataManager.saveMapState(this.config.id, this.state);
				this.renderLayerList(container);
				this.renderMarkers();
				this.refreshMarkerList();
			});
		});
	}

	private buildAddLayerRow(container: HTMLElement): void {
		const addRow = container.createDiv({ cls: 'ttrpgmap-marker-list-row ttrpgmap-layer-add-row' });
		addRow.createDiv({ cls: 'ttrpgmap-marker-list-action', attr: { 'aria-label': 'Add layer' } });
		setIcon(addRow.querySelector('.ttrpgmap-marker-list-action')!, 'layers');
		addRow.createDiv({ cls: 'ttrpgmap-marker-list-name', text: 'Add layer' });
		addRow.addEventListener('click', (e) => {
			e.stopPropagation();
			if (!this.state) return;
			const existingNames = new Set(this.state.layers.map((l) => l.name.toLowerCase()));
			let n = 1;
			while (existingNames.has(`layer ${n}`.toLowerCase())) n++;
			const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			const newLayer: MarkerLayer = {
				id,
				name: `Layer ${n}`,
				zoomMin: this.config.zoomMin,
				zoomMax: this.config.zoomMax,
			};
			this.state.layers.push(newLayer);
			this.plugin.dataManager.saveMapState(this.config.id, this.state);
			this.renderLayerList(container);
			new LayerEditModal(this.plugin.app, {
				layer: newLayer,
				mapZoomMin: this.config.zoomMin,
				mapZoomMax: this.config.zoomMax,
				isNew: true,
				onSave: (saved) => {
					Object.assign(newLayer, saved);
					if (this.state) this.plugin.dataManager.saveMapState(this.config.id, this.state);
					this.renderLayerList(container);
				},
			}).open();
		});
	}

	private getVisibilityLabel(vis: 'show' | 'hide' | 'always'): string {
		if (vis === 'hide') return 'Hidden';
		if (vis === 'always') return 'Always visible';
		return 'Default';
	}

	private formatZoomRangeShort(layer: MarkerLayer): string {
		const min = layer.zoomMin;
		const max = layer.zoomMax;
		if (min == null && max == null) return '';
		if (min != null && max != null) return `${min}%-${max}%`;
		if (min != null) return `${min}%+`;
		return `\u2264${max}%`;
	}

	/** Refresh the active list panel if it's currently visible */
	private refreshMarkerList(): void {
		if (this.markerListScroll) {
			const wrapper = this.markerListScroll.closest('.ttrpgmap-marker-list-wrapper');
			if (wrapper && !wrapper.hasClass('ttrpgmap-hidden')) {
				if (this.activeListTab === 'markers') {
					this.renderMarkerList(this.markerListScroll);
				} else if (this.activeListTab === 'layers' && this.layerListContainer) {
					this.renderLayerList(this.layerListContainer);
				}
			}
		}
	}

	private renderMarkerList(container: HTMLElement): void {
		container.empty();
		if (!this.state || this.state.markers.length === 0) {
			container.createDiv({ cls: 'ttrpgmap-marker-list-empty', text: 'No markers' });
			return;
		}

		const sorted = [...this.state.markers].sort((a, b) => {
			const nameA = displayTitle(a.note, a.alias);
			const nameB = displayTitle(b.note, b.alias);
			return nameA.localeCompare(nameB);
		});

		for (const marker of sorted) {
			const visible = this.isMarkerVisible(marker);
			const row = container.createDiv({ cls: 'ttrpgmap-marker-list-row' });
			if (!visible) row.addClass('ttrpgmap-marker-list-row--hidden');

			// Mini icon preview
			const preview = row.createDiv({ cls: 'ttrpgmap-marker-list-preview' });
			const shape = marker.shape ?? 'pin';
			if (isZone(marker)) {
				// Show the zone's actual outline rather than a generic glyph: a viewBox
				// set to its bounding box scales any polygon to fit the swatch.
				appendZoneListPreview(preview, marker);
			} else {
				createPinElement(preview, {
					pinClass: 'ttrpgmap-marker-list-pin',
					svgClass: 'ttrpgmap-pin-svg',
					color: marker.color ?? '#ffffff',
					transparency: marker.transparency ?? 0,
					icon: marker.icon,
					iconColor: marker.iconColor ?? '#000000',
					iconRotation: marker.iconRotation ?? 0,
					iconClass: 'ttrpgmap-marker-list-icon',
					useBaseMarker: marker.useBaseMarker ?? true,
					shape,
				});
			}

			// Name
			const name = displayTitle(marker.note, marker.alias) || 'Unnamed';
			row.createDiv({ cls: 'ttrpgmap-marker-list-name', text: name });

			// Hidden indicator
			if (!visible) {
				const hiddenIcon = row.createDiv({ cls: 'ttrpgmap-marker-list-hidden-icon' });
				setIcon(hiddenIcon, 'eye-off');
			}

			// Highlight map marker on hover or click (skip if off-screen)
			const findMarkerEl = () => this.markerOverlay.querySelector<HTMLElement>(`[data-marker-id="${marker.id}"]`);
			row.addEventListener('mouseenter', () => {});
			row.addEventListener('mouseleave', () => {
				const el = findMarkerEl();
				if (el) this.stopBounce(el);
			});
			row.addEventListener('click', () => {
				const el = findMarkerEl();
				if (el) this.startBounce(el);
			});

			// Description tooltip on hover
			if (marker.description) {
				row.setAttribute('aria-label', marker.description);
				row.addClass('ttrpgmap-marker-list-has-desc');
			}

			// Action button group
			const markerActionGroup = row.createDiv({ cls: 'ttrpgmap-layer-action-group' });

			// Edit button
			const editBtn = markerActionGroup.createDiv({
				cls: 'ttrpgmap-marker-list-action',
				attr: { 'aria-label': 'Edit' },
			});
			setIcon(editBtn, 'pencil');
			editBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.editMarker(marker);
			});

			// Delete button
			const deleteBtn = markerActionGroup.createDiv({
				cls: 'ttrpgmap-marker-list-action ttrpgmap-marker-list-delete',
				attr: { 'aria-label': 'Delete' },
			});
			setIcon(deleteBtn, 'trash-2');
			deleteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.deleteMarker(marker);
				this.renderMarkerList(container);
			});

			// Click row to pan to marker
			row.addEventListener('click', () => {
				const { x, y } = this.toScreenCoords(marker.x, marker.y);
				const rect = this.wrapper.getBoundingClientRect();
				this.panX += rect.width / 2 - x;
				this.panY += rect.height / 2 - y;
				this.applyTransform();
			});
		}
	}

	private bindEvents(): void {
		this.wrapper.addEventListener('mousedown', this.onMouseDown.bind(this));
		this.wrapper.addEventListener('mousemove', this.onMouseMove.bind(this));
		this.wrapper.addEventListener('mouseup', this.onMouseUp.bind(this));
		this.wrapper.addEventListener('mouseleave', this.onWrapperLeave.bind(this));
		// Catch mouseup outside the wrapper (e.g., on a popover) to prevent stuck drags
		activeWindow.addEventListener('mouseup', () => {
			if (this.draggingMarker) this.onMouseUp();
		});
		this.wrapper.addEventListener(
			'click',
			(e) => {
				if (
					this.measurement.mode !== 'pan' &&
					!this.mapContainer.contains(e.target as Node) &&
					!this.markerOverlay.contains(e.target as Node)
				) {
					this.measurement.cancelDrawing();
				}
			},
			true,
		);
		this.wrapper.addEventListener('click', (e) => this.measurement.onMapClick(e));
		this.wrapper.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
		this.wrapper.addEventListener('contextmenu', this.onContextMenu.bind(this));
		this.wrapper.setAttribute('tabindex', '0');
		activeWindow.addEventListener('keydown', (e) => {
			if (e.key === 'Alt' && this.dismissActiveHover) {
				this.dismissActiveHover();
			}
		});
		this.wrapper.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				if (this.resizingMarker) {
					this.cancelResize();
					return;
				}
				if (this.measurement.mode !== 'pan') this.measurement.cancelDrawing();
			}
		});
		this.wrapper.addEventListener('dblclick', (e) => {
			if (
				(this.measurement.mode === 'measure' || this.measurement.mode === 'freehand') &&
				this.measurement.getMeasurePointCount() >= 2
			) {
				e.preventDefault();
				this.measurement.finishMeasuring();
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

	/** Detect if the mouse is near the right or bottom edge of the wrapper (within 10px) */
	private detectWrapperEdge(e: MouseEvent): 'width' | 'height' | null {
		const rect = this.wrapper.getBoundingClientRect();
		const threshold = 10;
		const nearRight = Math.abs(e.clientX - rect.right) < threshold && e.clientY >= rect.top && e.clientY <= rect.bottom;
		const nearBottom =
			Math.abs(e.clientY - rect.bottom) < threshold && e.clientX >= rect.left && e.clientX <= rect.right;
		// Prefer the closer edge if near a corner
		if (nearRight && nearBottom) {
			return Math.abs(e.clientX - rect.right) < Math.abs(e.clientY - rect.bottom) ? 'width' : 'height';
		}
		if (nearRight) return 'width';
		if (nearBottom) return 'height';
		return null;
	}

	/** Start an edge resize operation with window-level mouse tracking */
	private startEdgeResize(axis: 'width' | 'height', e: MouseEvent): void {
		if (!this.interaction.tryEnter('edge-resize')) return;
		this.edgeResizeAxis = axis;
		this.edgeResizeStartPos = axis === 'width' ? e.clientX : e.clientY;
		const rect = this.wrapper.getBoundingClientRect();
		this.edgeResizeStartSize = axis === 'width' ? rect.width : rect.height;
		const ratio = this.imageEl ? this.imageEl.naturalWidth / this.imageEl.naturalHeight : 0;

		// Force fill mode during drag so the image matches our explicit dimensions
		const sizeClasses = ['ttrpgmap-size-fill', 'ttrpgmap-size-auto-width', 'ttrpgmap-size-auto-height'];
		sizeClasses.forEach((cls) => this.imageEl?.removeClass(cls));
		this.wrapper.removeClass('ttrpgmap-size-auto-height');
		this.imageEl?.addClass('ttrpgmap-size-fill');

		let prevWidth = rect.width;
		let prevHeight = rect.height;
		let resizeSyncTimeout: number | null = null;
		const onMove = (ev: MouseEvent) => {
			const delta = axis === 'width' ? ev.clientX - this.edgeResizeStartPos : ev.clientY - this.edgeResizeStartPos;
			const newSize = Math.max(50, Math.round(this.edgeResizeStartSize + delta));
			let newW: number;
			let newH: number;
			if (axis === 'width') {
				newW = newSize;
				newH = ratio ? Math.round(newSize / ratio) : prevHeight;
			} else {
				newH = newSize;
				newW = ratio ? Math.round(newSize * ratio) : prevWidth;
			}
			this.wrapper.style.width = `${newW}px`;
			this.wrapper.style.height = `${newH}px`;

			// Adjust pan to keep the viewport center stable
			this.panX += (newW - prevWidth) / 2;
			this.panY += (newH - prevHeight) / 2;
			this.applyTransform();
			prevWidth = newW;
			prevHeight = newH;

			// Throttled marker sync during drag (every 100ms)
			if (!resizeSyncTimeout) {
				resizeSyncTimeout = activeWindow.setTimeout(() => {
					resizeSyncTimeout = null;
					this.updateImageScaleCache();
					this.syncViewportMarkers(true);
				}, 100);
			}
		};

		const onUp = () => {
			activeWindow.removeEventListener('mousemove', onMove);
			activeWindow.removeEventListener('mouseup', onUp);
			if (resizeSyncTimeout) {
				activeWindow.clearTimeout(resizeSyncTimeout);
				resizeSyncTimeout = null;
			}
			const finalRect = this.wrapper.getBoundingClientRect();
			if (axis === 'width') {
				this.config.width = `${Math.round(finalRect.width)}`;
				this.config.height = null;
			} else {
				this.config.height = `${Math.round(finalRect.height)}`;
				this.config.width = null;
			}
			this.edgeResizeAxis = null;
			this.edgeHoverAxis = null;
			this.interaction.exit();
			this.updateCursor();
			this.updateImageScaleCache();
			this.syncViewportMarkers(true);
			// Persist current zoom/pan before writing config, since the code block
			// rewrite triggers a full re-render that loads state from disk
			if (this.state) {
				this.state.savedZoom = this.zoom;
				this.state.savedPanX = this.panX;
				this.state.savedPanY = this.panY;
				this.plugin.dataManager.saveMapState(this.config.id, this.state);
				this.plugin.dataManager.flushSavesSync();
			}
			if (this.sectionInfo) {
				void writeConfigToCodeBlock(
					this.plugin.app,
					this.sourcePath,
					this.sectionInfo,
					serializeMapConfig(this.config),
				);
			}
		};

		activeWindow.addEventListener('mousemove', onMove);
		activeWindow.addEventListener('mouseup', onUp);
	}

	private applyWrapperSize(): void {
		const height = this.parseDimension(this.config.height);
		const width = this.parseDimension(this.config.width);
		const natW = this.imageEl?.naturalWidth || 0;
		const natH = this.imageEl?.naturalHeight || 0;
		const ratio = natW && natH ? natW / natH : 0;

		const imageSizeClasses = ['ttrpgmap-size-fill', 'ttrpgmap-size-auto-width', 'ttrpgmap-size-auto-height'];
		if (this.imageEl) {
			const img = this.imageEl;
			imageSizeClasses.forEach((cls) => img.removeClass(cls));
		}
		this.wrapper.removeClass('ttrpgmap-size-auto-height');

		if (height && width) {
			this.wrapper.style.width = width;

			this.wrapper.style.height = height;
			if (this.imageEl) {
				this.imageEl.addClass('ttrpgmap-size-fill');
			}
		} else if (height && !width) {
			this.wrapper.style.height = height;
			if (this.imageEl) {
				this.imageEl.addClass('ttrpgmap-size-auto-width');
			}
			const px = parseFloat(height);

			this.wrapper.style.width = ratio && !height.includes('%') ? `${Math.round(px * ratio)}px` : 'auto';
		} else if (!height && width) {
			this.wrapper.style.width = width;
			if (this.imageEl) {
				this.imageEl.addClass('ttrpgmap-size-auto-height');
			}
			const px = parseFloat(width);

			this.wrapper.style.height = ratio && !width.includes('%') ? `${Math.round(px / ratio)}px` : 'auto';
		} else {
			this.wrapper.addClass('ttrpgmap-size-auto-height');
			if (this.imageEl) {
				this.imageEl.addClass('ttrpgmap-size-auto-height');
			}
		}
	}

	// ──────────────────── Cursor ────────────────────

	private static readonly CURSOR_CLASSES = [
		'ttrpgmap-cursor-grab',
		'ttrpgmap-cursor-crosshair',
		'ttrpgmap-cursor-copy',
		'ttrpgmap-cursor-ew-resize',
		'ttrpgmap-cursor-ns-resize',
	] as const;

	/** Evaluate all state and apply the single correct cursor class */
	private updateCursor(): void {
		let cls: string;
		const mode = this.interaction.current;
		if (mode === 'edge-resize' || this.edgeHoverAxis) {
			cls =
				(this.edgeResizeAxis ?? this.edgeHoverAxis) === 'width'
					? 'ttrpgmap-cursor-ew-resize'
					: 'ttrpgmap-cursor-ns-resize';
		} else if (this.interaction.isMeasuring) {
			cls = 'ttrpgmap-cursor-crosshair';
		} else if (mode === 'copying') {
			cls = 'ttrpgmap-cursor-copy';
		} else if (this.panLocked && mode === 'idle') {
			cls = '';
		} else {
			cls = 'ttrpgmap-cursor-grab';
		}
		for (const c of MapRenderer.CURSOR_CLASSES) {
			this.wrapper.toggleClass(c, c === cls);
		}
	}

	// ──────────────────── Pan / Zoom ────────────────────

	private _zoomSettleTimeout: number | null = null;
	private _cullTimeout: number | null = null;
	private _lastSettledZoom = 100;

	private applyTransform(): void {
		const scale = this.zoom / 100;
		this.mapContainer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${scale})`;

		if (this.zoom === this._lastSettledZoom) {
			// Pan only: hide markers for smooth panning, rebuild when paused
			const isPanning = this.interaction.current === 'panning';
			if (isPanning) {
				this.markerOverlay.addClass('ttrpgmap-visibility-hidden');
			}
			if (isPanning) {
				if (this._cullTimeout) activeWindow.clearTimeout(this._cullTimeout);
				this._cullTimeout = activeWindow.setTimeout(() => {
					this._cullTimeout = null;
					this.syncViewportMarkers(true);
					this.markerOverlay.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
					this.markerOverlay.removeClass('ttrpgmap-visibility-hidden');
				}, 200);
			} else {
				this.markerOverlay.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
			}
			return;
		}

		// Zoom changed: hide markers during interactive zoom, rebuild when settled
		this.markerOverlay.addClass('ttrpgmap-visibility-hidden');

		if (this._zoomSettleTimeout) activeWindow.clearTimeout(this._zoomSettleTimeout);
		this._zoomSettleTimeout = activeWindow.setTimeout(() => {
			this._zoomSettleTimeout = null;
			this._lastSettledZoom = this.zoom;
			this.markerOverlay.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
			this.syncViewportMarkers(true);
			this.markerOverlay.removeClass('ttrpgmap-visibility-hidden');
		}, 500);
	}

	private _cachedImageScale: { sx: number; sy: number } = { sx: 1, sy: 1 };

	/** Recalculate and cache the display-to-natural image ratio */
	private updateImageScaleCache(): void {
		if (this.imageEl?.naturalWidth && this.imageEl?.naturalHeight) {
			this._cachedImageScale = {
				sx: this.imageEl.clientWidth / this.imageEl.naturalWidth,
				sy: this.imageEl.clientHeight / this.imageEl.naturalHeight,
			};
		}
	}

	private getImageScale(): { sx: number; sy: number } {
		return this._cachedImageScale;
	}

	private adjustZoom(delta: number): void {
		if (this.zoomLocked) {
			this.showLockWarning('Zoom is locked', 'Lock zoom');
			return;
		}
		const newZoom = Math.max(this.config.zoomMin, Math.min(this.config.zoomMax, this.zoom + delta));
		if (newZoom === this.zoom) return;

		const oldScale = this.zoom / 100;
		const newScale = newZoom / 100;
		const rect = this.wrapper.getBoundingClientRect();
		const centerX = rect.width / 2;
		const centerY = rect.height / 2;
		const mapX = (centerX - this.panX) / oldScale;
		const mapY = (centerY - this.panY) / oldScale;
		this.panX = centerX - mapX * newScale;
		this.panY = centerY - mapY * newScale;

		this.zoom = newZoom;
		this.applyTransform();
		const label = this.wrapper.querySelector('.ttrpgmap-zoom-label');
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
		const label = this.wrapper.querySelector('.ttrpgmap-zoom-label');
		if (label) label.setText(`${this.zoom}%`);
	}

	private onMouseDown(e: MouseEvent): void {
		if (e.button !== 0) return;

		// Edge resize: ALT + mousedown near wrapper edge (only when idle, on map surface)
		if (
			e.altKey &&
			!this.edgeResizeAxis &&
			this.measurement.mode === 'pan' &&
			!this.pendingCopy &&
			(e.target as HTMLElement).closest('.ttrpgmap-container, .ttrpgmap-marker-overlay')
		) {
			const edge = this.detectWrapperEdge(e);
			if (edge) {
				e.preventDefault();
				e.stopPropagation();
				this.startEdgeResize(edge, e);
				return;
			}
		}

		// Only handle interactions on the map surface, not UI overlays
		if (!(e.target as HTMLElement).closest('.ttrpgmap-container, .ttrpgmap-marker-overlay')) return;

		// Resize mode: only start drag if clicking the handle
		if (this.resizingMarker && this.resizeHandleEl) {
			const handle = (e.target as HTMLElement).closest('.ttrpgmap-resize-handle');
			if (handle) {
				e.preventDefault();
				e.stopPropagation();
				this.interaction.tryEnter('dragging-handle');
				this.resizeStartX = e.clientX;
				this.resizeStartScale =
					this.resizeTarget === 'marker' ? this.resizingMarker.scale! : this.resizingMarker.textScale!;
			} else {
				// Clicked outside handle: commit resize
				this.commitResize();
			}
			return;
		}

		// Freehand mode: start drawing
		if (this.measurement.mode === 'freehand') {
			this.measurement.startFreehand(e);
			return;
		}

		if (this.measurement.mode !== 'pan') return;

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

		if (this.panLocked) {
			this.showLockWarning('Pan is locked', 'Lock pan');
			return;
		}
		if (!this.interaction.tryEnter('panning')) return;
		// Reset here and set true once the pan actually moves, so the click that
		// follows a pan is ignored. Without this, panning that starts on a hot zone
		// (which can cover most of the map) would open the zone's linked note on
		// release. Pins avoid this because their own mousedown never starts a pan.
		this.hasDragged = false;
		this.panStartX = e.clientX - this.panX;
		this.panStartY = e.clientY - this.panY;
		this.wrapper.addClass('ttrpgmap-panning');
	}

	private onMouseMove(e: MouseEvent): void {
		// Edge resize cursor: detect ALT + near edge
		if (
			!this.edgeResizeAxis &&
			e.altKey &&
			this.interaction.current !== 'panning' &&
			!this.draggingMarker &&
			this.measurement.mode === 'pan' &&
			!this.pendingCopy
		) {
			const edge = this.detectWrapperEdge(e);
			if (this.edgeHoverAxis !== edge) {
				this.edgeHoverAxis = edge;
				this.updateCursor();
			}
			if (edge) return;
		} else if (this.edgeHoverAxis) {
			this.edgeHoverAxis = null;
			this.updateCursor();
		}

		// Measure preview: rubber-band line from last committed point to cursor
		if (this.measurement.mode === 'measure' && this.measurement.hasDrawingPoints) {
			this.measurement.updateMeasurePreview(e);
		}

		// Resize drag (only when actively dragging the handle)
		if (this.interaction.current === 'dragging-handle' && this.resizingMarker && this.resizeMarkerEl) {
			const rawDx = e.clientX - this.resizeStartX;
			// Dragging away from the marker = bigger (invert when handle is on the left)
			const dx = this.resizeHandleSide === 'left' ? -rawDx : rawDx;
			const newScale = Math.max(
				MIN_MARKER_SCALE,
				Math.min(MAX_MARKER_SCALE, this.resizeStartScale + dx * RESIZE_SCALE_SENSITIVITY),
			);
			if (this.resizeTarget === 'marker') {
				this.resizingMarker.scale = newScale;
				const stz = this.resizingMarker.scaleToZoom ?? this.getMarkerScaleToZoom();

				this.resizeMarkerEl.style.setProperty('--marker-scale', String(this.computeEffectiveScale(newScale, stz)));
			} else {
				this.resizingMarker.textScale = newScale;
				const stz = this.resizingMarker.textScaleToZoom ?? this.getTextScaleToZoom();

				this.resizeMarkerEl.style.setProperty('--marker-text-scale', String(this.computeEffectiveScale(newScale, stz)));
			}
			this.updateResizeLabel(newScale);
			return;
		}

		// Freehand drawing
		if (this.measurement.isDrawing) {
			this.measurement.continueFreehand(e);
			return;
		}

		if (this.draggingMarker && this.dragMarkerEl) {
			// Dismiss any hover popover that appeared in the race between timeout and mousedown
			if (this.dismissActiveHover) {
				this.dismissActiveHover();
				this.dismissActiveHover = null;
			}
			const dx = e.clientX - this.dragStartX;
			const dy = e.clientY - this.dragStartY;
			if (dx === 0 && dy === 0) return;
			// Markers locked: cancel drag, show warning, and start panning instead
			if (this.markersLocked) {
				this.showLockWarning('Marker positions are locked', 'Lock markers');
				this.dragMarkerEl.removeClass('ttrpgmap-marker-dragging');
				this.draggingMarker = null;
				this.dragMarkerEl = null;
				this.hasDragged = true;
				if (!this.panLocked) {
					this.interaction.tryEnter('panning');
					this.panStartX = e.clientX - this.panX;
					this.panStartY = e.clientY - this.panY;
					this.wrapper.addClass('ttrpgmap-panning');
				}
				return;
			}
			this.hasDragged = true;
			const scale = this.zoom / 100;
			const { sx, sy } = this.getImageScale();
			this.draggingMarker.x = this.dragOrigX + dx / scale / sx;
			this.draggingMarker.y = this.dragOrigY + dy / scale / sy;

			this.dragMarkerEl.style.left = `${this.draggingMarker.x * sx * scale}px`;
			this.dragMarkerEl.style.top = `${this.draggingMarker.y * sy * scale}px`;
			return;
		}
		if (this.interaction.current !== 'panning') return;
		// A real pan happened; suppress the click that follows so it can't navigate.
		this.hasDragged = true;
		this.panX = e.clientX - this.panStartX;
		this.panY = e.clientY - this.panStartY;
		this.applyTransform();
	}

	private onWrapperLeave(): void {
		// Only end panning on wrapper leave, not marker dragging or other operations.
		// Marker dragging should survive the cursor leaving the wrapper (e.g., popover overlay).
		if (this.interaction.current === 'panning') {
			this.interaction.exit();
			this.wrapper.removeClass('ttrpgmap-panning');
		}
	}

	private onMouseUp(): void {
		// Resize: end handle drag (but stay in resize mode)
		if (this.interaction.current === 'dragging-handle') {
			this.interaction.exit();
			// Suppress the click event that fires after mouseup so it doesn't navigate
			this.hasDragged = true;
			return;
		}

		// Freehand: finish current stroke
		if (this.measurement.isDrawing) {
			this.measurement.endFreehand();
			return;
		}

		if (this.draggingMarker) {
			this.dragMarkerEl?.removeClass('ttrpgmap-marker-dragging');
			if (this.hasDragged && this.state) this.plugin.dataManager.saveMapState(this.config.id, this.state);
			this.draggingMarker = null;
			this.dragMarkerEl = null;
			this.interaction.exit();
			return;
		}
		if (this.interaction.current === 'panning') {
			this.interaction.exit();
			this.wrapper.removeClass('ttrpgmap-panning');
		}
	}

	/** Alt+scroll over a marker: resize per-marker or map-level scale. Returns true if handled. */
	private handleAltScrollResize(e: WheelEvent): boolean {
		if (!this.state) return false;
		const markerEl = (e.target as HTMLElement).closest<HTMLElement>('.ttrpgmap-marker');
		if (!markerEl) return false;
		const marker = this.state.markers.find((m) => m.id === markerEl.dataset.markerId);
		if (!marker) return false;

		e.preventDefault();
		const isLabel = !!(e.target as HTMLElement).closest('.ttrpgmap-marker-label');
		const isMapLevel = e.shiftKey;
		const delta = e.deltaY < 0 ? SCROLL_SCALE_STEP : -SCROLL_SCALE_STEP;
		const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

		if (isLabel && isMapLevel) {
			if (this.state.markerTextScale == null) this.state.markerTextScale = this.getTextBaseScale(marker);
			this.state.markerTextScale = clamp(
				this.state.markerTextScale + delta,
				MIN_MARKER_TEXT_SCALE,
				MAX_MARKER_TEXT_SCALE,
			);
			this.syncViewportMarkers(true);
		} else if (isLabel) {
			if (marker.textScale === null) marker.textScale = this.getTextBaseScale(marker);
			marker.textScale = clamp(marker.textScale + delta, MIN_MARKER_TEXT_SCALE, MAX_MARKER_TEXT_SCALE);
			const stz = marker.textScaleToZoom ?? this.getTextScaleToZoom();
			markerEl.style.setProperty('--marker-text-scale', String(this.computeEffectiveScale(marker.textScale, stz)));
		} else if (isMapLevel) {
			if (this.state.markerScale == null) this.state.markerScale = this.getMarkerBaseScale(marker);
			this.state.markerScale = clamp(this.state.markerScale + delta, MIN_MARKER_SCALE, MAX_MARKER_SCALE);
			this.syncViewportMarkers(true);
		} else {
			if (marker.scale === null) marker.scale = this.getMarkerBaseScale(marker);
			marker.scale = clamp(marker.scale + delta, MIN_MARKER_SCALE, MAX_MARKER_SCALE);
			const stz = marker.scaleToZoom ?? this.getMarkerScaleToZoom();
			markerEl.style.setProperty('--marker-scale', String(this.computeEffectiveScale(marker.scale, stz)));
		}

		markerEl.addClass('ttrpgmap-marker-resizing');
		if (this._resizeSaveTimeout) activeWindow.clearTimeout(this._resizeSaveTimeout);
		this._resizeSaveTimeout = activeWindow.setTimeout(() => {
			markerEl.removeClass('ttrpgmap-marker-resizing');
			if (this.state) this.plugin.dataManager.saveMapState(this.config.id, this.state);
		}, RESIZE_SAVE_DEBOUNCE_MS);
		return true;
	}

	private onWheel(e: WheelEvent): void {
		if (e.altKey && this.handleAltScrollResize(e)) return;

		if (this.zoomLocked) {
			this.showLockWarning('Zoom is locked', 'Lock zoom');
			return;
		}
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

		const label = this.wrapper.querySelector('.ttrpgmap-zoom-label');
		if (label) label.setText(`${this.zoom}%`);
	}

	// ──────────────────── Markers ────────────────────

	/** Check if a marker is visible at the current zoom level based on its layer */
	/** Start the bounce animation on a marker element, cancelling any pending stop */
	private startBounce(el: HTMLElement): void {
		el.removeClass('ttrpgmap-marker-bounce-stopping');
		el.addClass('ttrpgmap-marker-bounce');
	}

	/** Stop the bounce animation after the current cycle completes */
	private stopBounce(el: HTMLElement): void {
		el.addClass('ttrpgmap-marker-bounce-stopping');
		el.addEventListener(
			'animationiteration',
			() => {
				if (el.hasClass('ttrpgmap-marker-bounce-stopping')) {
					el.removeClass('ttrpgmap-marker-bounce');
					el.removeClass('ttrpgmap-marker-bounce-stopping');
				}
			},
			{ once: true },
		);
	}

	private isControlVisible(
		field: 'showMeasurementTools' | 'showZoomControls' | 'showMarkerList' | 'showLayerList' | 'showMapSettings',
	): boolean {
		return this.state?.[field] ?? this.plugin.settings[field] ?? true;
	}

	// ── Resolved settings (2-tier: map override ?? global default) ──

	private get controlOpacity(): number {
		return this.state?.controlOpacity ?? this.plugin.settings.defaultControlOpacity ?? 50;
	}

	private get openLinksInNewTab(): boolean {
		return this.state?.openLinksInNewTab ?? this.plugin.settings.openLinksInNewTab ?? false;
	}

	private get showHoverPreview(): boolean {
		return this.state?.showHoverPreview ?? this.plugin.settings.showHoverPreview ?? false;
	}

	private get maxRenderedMarkers(): number {
		return this.state?.maxRenderedMarkers ?? this.plugin.settings.maxRenderedMarkers ?? DEFAULT_MAX_RENDERED_MARKERS;
	}

	/** Sync lock state from this.state and update button visuals */
	private applyLockState(): void {
		this.zoomLocked = this.state?.zoomLocked ?? false;
		this.panLocked = this.state?.panLocked ?? false;
		this.markersLocked = this.state?.markersLocked ?? false;

		this.zoomLockBtnEl?.toggleClass('is-active', this.zoomLocked);
		this.zoomInBtnEl?.toggleClass('ttrpgmap-btn-disabled', this.zoomLocked);
		this.zoomOutBtnEl?.toggleClass('ttrpgmap-btn-disabled', this.zoomLocked);
		this.panLockBtnEl?.toggleClass('is-active', this.panLocked);
		this.wrapper?.toggleClass('ttrpgmap-pan-locked', this.panLocked);
		if (this.markerLockBtnEl) {
			this.markerLockBtnEl.toggleClass('is-active', this.markersLocked);
			this.markerLockBtnEl.empty();
			setIcon(this.markerLockBtnEl, this.markersLocked ? 'map-pin-off' : 'map-pin');
		}
		this.updateCursor();
	}

	/** Apply control opacity from global + per-map settings */
	private applyControlOpacity(): void {
		const opacity = this.controlOpacity;
		this.wrapper?.style.setProperty('--control-opacity', String(opacity / 100));
	}

	/** Toggle visibility of UI controls based on global + per-map settings */
	private applyControlVisibility(): void {
		const showZoom = this.isControlVisible('showZoomControls');
		const showMeasure = this.isControlVisible('showMeasurementTools');
		const showSettings = this.isControlVisible('showMapSettings');
		const showMarkers = this.isControlVisible('showMarkerList');
		const showLayers = this.isControlVisible('showLayerList');

		this.zoomControlsEl?.toggleClass('ttrpgmap-hidden', !showZoom);
		this.measurePanelEl?.toggleClass('ttrpgmap-hidden', !showMeasure);
		this.settingsBtnEl?.toggleClass('ttrpgmap-hidden', !showSettings);

		// Entire panel hidden when both tabs are off
		this.markerListPanelEl?.toggleClass('ttrpgmap-hidden', !showMarkers && !showLayers);
		// Individual tab buttons
		this.markersTabEl?.toggleClass('ttrpgmap-hidden', !showMarkers);
		this.layersTabEl?.toggleClass('ttrpgmap-hidden', !showLayers);

		// Close panel if the active tab was just hidden
		if ((this.activeListTab === 'markers' && !showMarkers) || (this.activeListTab === 'layers' && !showLayers)) {
			this.closeListPanel();
		}
	}

	/** Reset the marker/layer list panel to its default closed state */
	private closeListPanel(): void {
		this.listPinned = false;
		this.listWrapperEl?.addClass('ttrpgmap-hidden');
		this.listWrapperEl?.removeClass('ttrpgmap-marker-list-wrapper-pinned');
		this.markerListPanelEl?.removeClass('ttrpgmap-marker-list-pinned');
		this.markersTabEl?.removeClass('ttrpgmap-panel-tab-active');
		this.layersTabEl?.removeClass('ttrpgmap-panel-tab-active');
		if (this.listPinBtnEl) {
			this.listPinBtnEl.empty();
			setIcon(this.listPinBtnEl, 'pin-off');
		}
	}

	private isMarkerVisible(marker: MapMarker): boolean {
		if (!this.state) return false;
		const layerId = marker.layerId ?? DEFAULT_LAYER_ID;
		// Check layer visibility override (session-only)
		const override = this.layerVisibilityOverrides.get(layerId);
		if (override === 'hide') return false;
		if (override === 'always') return true;
		// Normal zoom-based visibility
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
		return (
			marker.textScale ??
			this.state?.markerTextScale ??
			this.plugin.settings.defaultMarkerTextScale ??
			DEFAULT_MARKER_TEXT_SCALE
		);
	}

	/** Resolve whether a marker scales to zoom */
	private getMarkerScaleToZoom(): boolean {
		return this.state?.scaleMarkersToZoom ?? this.plugin.settings.defaultScaleMarkersToZoom ?? true;
	}

	/** Resolve whether a marker's text scales to zoom */
	private getTextScaleToZoom(): boolean {
		return this.state?.scaleMarkerTextToZoom ?? this.plugin.settings.defaultScaleMarkerTextToZoom ?? true;
	}

	/** Resolve the effective font for a marker, walking the 3-tier hierarchy */
	/**
	 * Resolve a marker's text visibility. "Inherit" on a marker falls through to
	 * the per-map override (map settings), then the global default. Zones and pins
	 * must share this: they diverged once, and zone labels silently ignored the
	 * per-map setting.
	 */
	private getTextVisibility(marker: MapMarker): TextVisibility {
		return (
			marker.textVisibility ?? this.state?.textVisibility ?? this.plugin.settings.defaultTextVisibility ?? 'visible'
		);
	}

	private getMarkerFont(marker: MapMarker): string | null {
		const font = marker.font ?? this.state?.markerFont ?? this.plugin.settings.defaultMarkerFont ?? 'default';
		return getMarkerFontStack(font);
	}

	/** Compute effective scale (accounting for zoom if fixed-to-map) */
	private computeEffectiveScale(baseScale: number, scaleToZoom: boolean): number {
		return scaleToZoom ? baseScale : baseScale * (this.zoom / 100);
	}

	/** Convert a mouse event to natural image pixel coords. */
	/**
	 * True while a map-wide drawing mode owns the surface (measuring or zone
	 * drawing). Existing markers and zones are dimmed and made click-through so
	 * they cannot swallow clicks meant for the drawing.
	 */
	private get markersInert(): boolean {
		return this.measurement.mode !== 'pan' || (this.zoneDraw?.isDrawing ?? false);
	}

	private screenToMapPoint(e: MouseEvent): MapPoint {
		const rect = this.mapContainer.getBoundingClientRect();
		const scale = this.zoom / 100;
		const { sx, sy } = this.getImageScale();
		return {
			x: (e.clientX - rect.left) / scale / sx,
			y: (e.clientY - rect.top) / scale / sy,
		};
	}

	/** Convert natural image coords to display coords (image-space, before zoom/pan transform) */
	private toDisplayCoords(natX: number, natY: number): { x: number; y: number } {
		const { sx, sy } = this.getImageScale();
		return { x: natX * sx, y: natY * sy };
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

	/** Viewport bounds in display-space coordinates */
	private getViewportBounds(): { left: number; top: number; right: number; bottom: number } {
		const rect = this.wrapper.getBoundingClientRect();
		// When layout dimensions are unavailable, treat entire space as visible
		if (rect.width === 0 && rect.height === 0) {
			return { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
		}
		const pad = 50;
		return {
			left: -this.panX - pad,
			top: -this.panY - pad,
			right: -this.panX + rect.width + pad,
			bottom: -this.panY + rect.height + pad,
		};
	}

	/** Check if a marker is within the current viewport (in display coords) */
	private isInViewport(
		marker: MapMarker,
		sx: number,
		sy: number,
		scale: number,
		vp: ReturnType<typeof this.getViewportBounds>,
	): boolean {
		const px = marker.x * sx * scale;
		const py = marker.y * sy * scale;
		return px >= vp.left && px <= vp.right && py >= vp.top && py <= vp.bottom;
	}

	/** Differential viewport render: add markers entering the viewport, remove those leaving */
	private syncViewportMarkers(updateScales = false): void {
		if (!this.state) return;
		this.renderZones();
		const { sx, sy } = this.getImageScale();
		const scale = this.zoom / 100;
		const vp = this.getViewportBounds();
		const inert = this.markersInert;
		const mapScaleToZoom = this.getMarkerScaleToZoom();
		const mapTextScaleToZoom = this.getTextScaleToZoom();

		// Collect all viewport-visible marker IDs
		const visibleIds = new Set<string>();
		for (const marker of this.state.markers) {
			if (marker.shape === 'area') continue;
			if (this.isMarkerVisible(marker) && this.isInViewport(marker, sx, sy, scale, vp)) {
				visibleIds.add(marker.id);
			}
		}

		// Cap to max rendered markers, keeping center-most
		const maxMarkers = this.maxRenderedMarkers;
		const totalVisible = visibleIds.size;
		if (totalVisible > maxMarkers) {
			const vpCenterX = (vp.left + vp.right) / 2;
			const vpCenterY = (vp.top + vp.bottom) / 2;
			const ranked: Array<{ id: string; dist: number }> = [];
			for (const marker of this.state.markers) {
				if (!visibleIds.has(marker.id)) continue;
				const px = marker.x * sx * scale;
				const py = marker.y * sy * scale;
				const dx = px - vpCenterX;
				const dy = py - vpCenterY;
				ranked.push({ id: marker.id, dist: dx * dx + dy * dy });
			}
			ranked.sort((a, b) => a.dist - b.dist);
			visibleIds.clear();
			for (let i = 0; i < maxMarkers; i++) visibleIds.add(ranked[i].id);
		}

		// Update cull banner
		if (this.markerCullBanner) {
			if (totalVisible > maxMarkers) {
				this.markerCullBanner.setText(`Showing ${maxMarkers} of ${totalVisible} markers`);
				this.markerCullBanner.removeClass('ttrpgmap-hidden');
			} else {
				this.markerCullBanner.addClass('ttrpgmap-hidden');
			}
		}

		// Remove markers no longer visible (left viewport or layer hidden)
		this.markerOverlay.querySelectorAll<HTMLElement>('.ttrpgmap-marker').forEach((el) => {
			const id = el.dataset.markerId ?? '';
			if (!visibleIds.has(id)) {
				el.remove();
			} else if (updateScales) {
				const marker = this.state!.markers.find((m) => m.id === id);
				if (!marker) return;
				el.style.left = `${marker.x * sx * scale}px`;
				el.style.top = `${marker.y * sy * scale}px`;
				const mScale = this.computeEffectiveScale(
					this.getMarkerBaseScale(marker),
					marker.scaleToZoom ?? mapScaleToZoom,
				);
				const tScale = this.computeEffectiveScale(
					this.getTextBaseScale(marker),
					marker.textScaleToZoom ?? mapTextScaleToZoom,
				);
				el.style.setProperty('--marker-scale', String(mScale));
				el.style.setProperty('--marker-text-scale', String(tScale));
				visibleIds.delete(id);
			} else {
				visibleIds.delete(id);
			}
		});

		// Create markers newly entering visibility
		if (visibleIds.size > 0) {
			const fragment = createFragment();
			for (const marker of this.state.markers) {
				if (!visibleIds.has(marker.id)) continue;
				const markerEl = this.createMarkerElement(marker, mapScaleToZoom, mapTextScaleToZoom, inert, fragment);
				if (!inert) this.attachMarkerEvents(marker, markerEl);
			}
			this.markerOverlay.appendChild(fragment);
		}
	}

	/**
	 * Render every hot zone into the transformed SVG overlay.
	 *
	 * Zones are map geometry, so keeping both the polygon and its label inside
	 * the zoom/pan transform means they need no screen-coordinate bookkeeping --
	 * unlike pins, which live in a separate overlay to stay crisp. Zones are
	 * rebuilt wholesale rather than diffed; there are few of them and the
	 * geometry changes rarely.
	 */
	private renderZones(): void {
		// Standard DOM APIs here: Obsidian's element helpers (empty/addClass/
		// toggleClass) are HTMLElement extensions and don't exist on SVG nodes.
		while (this.zoneLayer.firstChild) this.zoneLayer.removeChild(this.zoneLayer.firstChild);
		if (!this.state) return;

		const { sx, sy } = this.getImageScale();
		const scale = this.zoom / 100;

		// Largest first, so a zone nested inside another paints on top and stays
		// clickable. SVG has no z-index -- document order decides.
		const zones = this.state.markers
			// The zone being redrawn is hidden entirely, not dimmed: a visible old
			// outline would sit on top of exactly where you are trying to draw.
			.filter((m) => isZone(m) && m.id !== this.redrawingZoneId && this.isMarkerVisible(m))
			.map((m) => ({ marker: m, points: resolveZonePoints(m) }))
			.sort((a, b) => zoneArea(b.points) - zoneArea(a.points));

		const inert = this.markersInert;
		this.zoneLayer.classList.toggle('ttrpgmap-zone-layer--show-all', this.showAllZoneOutlines);
		// Dimmed and click-through while measuring or drawing, matching pins
		this.zoneLayer.classList.toggle('ttrpgmap-zone-layer--inert', inert);

		for (const { marker, points } of zones) {
			const fill = marker.color ?? '#ffffff';
			const group = createSvg('g', { cls: 'ttrpgmap-zone' });
			group.dataset.markerId = marker.id;

			const fillOpacity = zoneFillOpacity(marker.transparency);
			// Exposed as a variable so the hover rule can tint relative to the base
			group.style.setProperty('--zone-fill-opacity', String(fillOpacity));

			const polygon = createSvg('polygon', { cls: 'ttrpgmap-zone-shape' });
			polygon.setAttribute('points', zonePointsAttr(points, sx, sy));
			polygon.setAttribute('fill', fill);
			polygon.setAttribute('fill-opacity', String(fillOpacity));
			polygon.setAttribute('stroke', darkenHex(fill));
			// Keep the outline a constant on-screen width regardless of zoom
			polygon.setAttribute('stroke-width', String(2 / scale));
			group.appendChild(polygon);

			this.appendZoneLabel(group, marker, points, sx, sy, scale);
			this.zoneLayer.appendChild(group);
			if (!inert) this.attachZoneEvents(marker, group, polygon);
		}
	}

	/** Zone label as SVG text at the centroid, above or below the shape. */
	private appendZoneLabel(
		group: SVGGElement,
		marker: MapMarker,
		points: MapPoint[],
		sx: number,
		sy: number,
		scale: number,
	): void {
		const textVis = this.getTextVisibility(marker);
		if (textVis === 'hidden') return;

		const title = displayTitle(marker.note, marker.alias);
		const text = title || marker.description;
		if (!text) return;

		const centroid = zoneCentroid(points);
		// Divide by scale so the label keeps a constant on-screen size
		const fontSize = 14 / scale;
		const below = marker.textPlacement === 'below';
		const offset = (below ? 1 : -1) * (fontSize * 0.6);

		const label = createSvg('text', {
			// Array, not a space-separated string: createSvg passes cls to
			// classList.add, which rejects tokens containing whitespace.
			cls: textVis === 'hover' ? ['ttrpgmap-zone-label', 'ttrpgmap-zone-label--hover'] : ['ttrpgmap-zone-label'],
		});
		label.setAttribute('x', String(centroid.x * sx));
		label.setAttribute('y', String(centroid.y * sy + offset));
		label.setAttribute('font-size', String(fontSize));
		label.setAttribute('stroke-width', String(3 / scale));
		label.setAttribute('text-anchor', 'middle');
		label.setAttribute('dominant-baseline', below ? 'hanging' : 'auto');
		const fontStack = this.getMarkerFont(marker);
		if (fontStack) label.setAttribute('font-family', fontStack);
		label.textContent = text;
		group.appendChild(label);
	}

	/**
	 * Zone interaction. The polygon is the hit target so the whole fill is
	 * clickable, and hovering re-appends the group to promote it above overlapping
	 * zones (the SVG equivalent of the pin overlay's z-index bump).
	 */
	private attachZoneEvents(marker: MapMarker, group: SVGGElement, polygon: SVGPolygonElement): void {
		const promote = () => {
			this.zoneLayer.appendChild(group);
		};

		polygon.addEventListener('mouseenter', () => {
			group.classList.add('ttrpgmap-zone--hover');
			promote();
		});
		polygon.addEventListener('mouseleave', () => {
			group.classList.remove('ttrpgmap-zone--hover');
		});

		this.attachMarkerNavigation(marker, polygon);
		this.attachMarkerHoverPreview(marker, polygon, promote);

		polygon.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const menu = new Menu();
			menu.addItem((item) => {
				item.setTitle('Edit hot zone');
				item.setIcon('pencil');
				item.onClick(() => this.editZone(marker));
			});
			menu.addItem((item) => {
				item.setTitle('Redraw shape');
				item.setIcon('pen-tool');
				// Existing zone from the map, so never new.
				item.onClick(() => this.redrawZone(marker, false));
			});
			menu.addItem((item) => {
				item.setTitle('Delete');
				item.setIcon('trash-2');
				item.onClick(() => this.deleteMarker(marker));
			});
			menu.showAtMouseEvent(e);
		});
	}

	private renderMarkers(): void {
		if (!this.state) return;
		this.renderZones();
		this.markerZCounter = 0;
		this.resizeHandleEl = null;
		this.markerOverlay.querySelectorAll('.ttrpgmap-marker').forEach((el) => el.remove());

		const { sx, sy } = this.getImageScale();
		const scale = this.zoom / 100;
		const vp = this.getViewportBounds();
		const mapScaleToZoom = this.getMarkerScaleToZoom();
		const mapTextScaleToZoom = this.getTextScaleToZoom();
		const inert = this.markersInert;

		// Collect visible markers
		const maxMarkers = this.maxRenderedMarkers;
		const visibleMarkers: MapMarker[] = [];
		for (const marker of this.state.markers) {
			// Hot zones render in the SVG overlay via renderZones(), not here
			if (marker.shape === 'area') continue;
			if (!this.isMarkerVisible(marker) || !this.isInViewport(marker, sx, sy, scale, vp)) continue;
			visibleMarkers.push(marker);
		}

		// Cap to max rendered markers, keeping center-most
		const totalVisible = visibleMarkers.length;
		if (totalVisible > maxMarkers) {
			const vpCenterX = (vp.left + vp.right) / 2;
			const vpCenterY = (vp.top + vp.bottom) / 2;
			visibleMarkers.sort((a, b) => {
				const ax = a.x * sx * scale - vpCenterX;
				const ay = a.y * sy * scale - vpCenterY;
				const bx = b.x * sx * scale - vpCenterX;
				const by = b.y * sy * scale - vpCenterY;
				return ax * ax + ay * ay - (bx * bx + by * by);
			});
			visibleMarkers.length = maxMarkers;
		}

		const fragment = createFragment();
		for (const marker of visibleMarkers) {
			const markerEl = this.createMarkerElement(marker, mapScaleToZoom, mapTextScaleToZoom, inert, fragment);
			if (!inert) this.attachMarkerEvents(marker, markerEl);
		}
		this.markerOverlay.appendChild(fragment);

		// Update cull banner
		if (this.markerCullBanner) {
			if (totalVisible > maxMarkers) {
				this.markerCullBanner.setText(`Showing ${maxMarkers} of ${totalVisible} markers`);
				this.markerCullBanner.removeClass('ttrpgmap-hidden');
			} else {
				this.markerCullBanner.addClass('ttrpgmap-hidden');
			}
		}

		this.recoverResizeMode();
	}

	private createMarkerElement(
		marker: MapMarker,
		mapScaleToZoom: boolean,
		mapTextScaleToZoom: boolean,
		inert: boolean,
		parent?: DocumentFragment,
	): HTMLElement {
		const color = marker.color ?? '#ffffff';
		const iconColor = marker.iconColor ?? '#000000';
		const direction = marker.direction ?? 'down';
		const textPlacement = marker.textPlacement ?? 'above';

		const { sx, sy } = this.getImageScale();
		const scale = this.zoom / 100;
		const markerEl = createDiv({ cls: 'ttrpgmap-marker' });
		(parent ?? this.markerOverlay).appendChild(markerEl);

		markerEl.style.left = `${marker.x * sx * scale}px`;

		markerEl.style.top = `${marker.y * sy * scale}px`;

		markerEl.style.setProperty('--marker-color', color);

		markerEl.style.setProperty('--marker-icon-color', iconColor);
		markerEl.dataset.direction = direction;
		markerEl.dataset.textPlacement = textPlacement;
		markerEl.dataset.markerId = marker.id;

		// Compute effective scale for marker pin/icon
		const markerBaseScale = this.getMarkerBaseScale(marker);
		const markerScaleToZoom = marker.scaleToZoom ?? mapScaleToZoom;

		markerEl.style.setProperty(
			'--marker-scale',
			String(this.computeEffectiveScale(markerBaseScale, markerScaleToZoom)),
		);

		// Compute effective scale for text label
		const textBaseScale = this.getTextBaseScale(marker);
		const textScaleToZoom = marker.textScaleToZoom ?? mapTextScaleToZoom;

		markerEl.style.setProperty(
			'--marker-text-scale',
			String(this.computeEffectiveScale(textBaseScale, textScaleToZoom)),
		);

		const fontStack = this.getMarkerFont(marker);
		if (fontStack) markerEl.style.setProperty('--marker-font', fontStack);

		if (inert) {
			markerEl.addClass('ttrpgmap-marker-inert');
		}

		createPinElement(markerEl, {
			pinClass: 'ttrpgmap-marker-pin',
			svgClass: 'ttrpgmap-pin-svg',
			color,
			transparency: marker.transparency ?? 0,
			icon: marker.icon,
			iconColor,
			iconRotation: marker.iconRotation ?? 0,
			iconClass: 'ttrpgmap-marker-icon',
			useBaseMarker: marker.useBaseMarker ?? true,
			shape: marker.shape ?? 'pin',
		});

		const textVis = this.getTextVisibility(marker);
		if (textVis !== 'hidden') {
			buildMarkerLabel(markerEl, marker.note, marker.alias, marker.description, 'ttrpgmap-marker-label');
		}
		if (textVis === 'hover') {
			markerEl.dataset.textVisibility = 'hover';
		}

		return markerEl;
	}

	private attachMarkerEvents(marker: MapMarker, markerEl: HTMLElement): void {
		this.attachMarkerNavigation(marker, markerEl);
		this.attachMarkerHoverPreview(marker, markerEl, () => this.promoteMarkerEl(markerEl));
		this.attachMarkerDrag(marker, markerEl);
		this.attachMarkerContextMenu(marker, markerEl);
	}

	/** Raise a marker element above every previously hovered one. */
	private promoteMarkerEl(markerEl: HTMLElement): void {
		if (this.markerZCounter >= 2_000_000_000) {
			this.markerZCounter = 0;
			this.markerOverlay.querySelectorAll<HTMLElement>('.ttrpgmap-marker').forEach((el) => {
				el.setCssStyles({ zIndex: '' });
			});
		}
		this.markerZCounter++;
		markerEl.setCssStyles({ zIndex: String(this.markerZCounter) });
	}

	// Takes an Element rather than HTMLElement so hot zone polygons can reuse it.
	private attachMarkerNavigation(marker: MapMarker, markerEl: Element): void {
		if (!marker.note) return;
		const navPath = linkPath(marker.note);
		markerEl.addEventListener('click', (e) => {
			if (this.hasDragged || this.pendingCopy) {
				this.hasDragged = false;
				return;
			}
			e.stopPropagation();
			void this.plugin.app.workspace.openLinkText(navPath, '', this.openLinksInNewTab);
		});
	}

	/**
	 * Hover preview. `markerEl` is an Element (not HTMLElement) so hot zone
	 * polygons can reuse this, and promotion is injected because SVG has no
	 * z-index -- zones promote by re-appending instead.
	 */
	private attachMarkerHoverPreview(marker: MapMarker, markerEl: Element, promote: () => void): void {
		let hoverTimeout: number | null = null;
		let hoverSuppressed = false;
		// Hover parent with intercepted setter: auto-hides popover if suppressed
		let _popover: { hide: () => void } | null = null;
		const hoverParent = {
			get hoverPopover() {
				return _popover;
			},
			set hoverPopover(v: { hide: () => void } | null) {
				if (v && hoverSuppressed) {
					v.hide();
					_popover = null;
				} else {
					_popover = v;
				}
			},
		};

		const clearHoverTimeout = () => {
			if (hoverTimeout) {
				activeWindow.clearTimeout(hoverTimeout);
				hoverTimeout = null;
			}
		};
		const dismissPopover = () => {
			clearHoverTimeout();
			hoverSuppressed = true;
			if (_popover) {
				_popover.hide();
				_popover = null;
			}
		};

		markerEl.addEventListener('mouseenter', (evt) => {
			// Typed as Event because this attaches to both HTML markers and SVG zones
			const e = evt as MouseEvent;
			// Promote this marker above all previously hovered ones
			promote();
			if (!this.draggingMarker && this.interaction.current !== 'panning') hoverSuppressed = false;
			this.dismissActiveHover = dismissPopover;
			if (this.draggingMarker || this.interaction.current === 'panning' || e.altKey || !this.showHoverPreview) return;

			let previewPath: string | null = null;
			if (marker.previewNote) {
				const p = linkPath(marker.previewNote);
				const { path: basePath } = parseLinktext(p);
				if (basePath && this.plugin.app.metadataCache.getFirstLinkpathDest(basePath, '')) {
					previewPath = p;
				}
			}
			if (!previewPath && marker.note) previewPath = linkPath(marker.note);
			if (!previewPath) return;

			hoverTimeout = activeWindow.setTimeout(() => {
				hoverTimeout = null;
				if (this.draggingMarker || this.interaction.current === 'panning' || hoverSuppressed) return;
				hoverParent.hoverPopover = null;
				this.plugin.app.workspace.trigger('hover-link', {
					event: e,
					source: 'ttrpg-maps',
					hoverParent,
					targetEl: markerEl,
					linktext: previewPath,
					sourcePath: '',
				});
			}, 300);
		});

		markerEl.addEventListener('mouseleave', () => {
			clearHoverTimeout();
		});

		markerEl.addEventListener('mousedown', dismissPopover);
	}

	private attachMarkerDrag(marker: MapMarker, markerEl: HTMLElement): void {
		markerEl.addEventListener('mousedown', (e) => {
			if (e.button !== 0 || this.resizingMarker || this.pendingCopy) return;
			e.stopPropagation();
			if (this.dismissActiveHover) {
				this.dismissActiveHover();
				this.dismissActiveHover = null;
			}
			this.draggingMarker = marker;
			this.dragMarkerEl = markerEl;
			this.dragStartX = e.clientX;
			this.dragStartY = e.clientY;
			this.dragOrigX = marker.x;
			this.dragOrigY = marker.y;
			this.hasDragged = false;
			markerEl.addClass('ttrpgmap-marker-dragging');
		});
	}

	private attachMarkerContextMenu(marker: MapMarker, markerEl: HTMLElement): void {
		markerEl.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (this.resizingMarker) this.commitResize();
			const menu = new Menu();
			menu.addItem((item) => {
				item.setTitle('Edit');
				item.setIcon('pencil');
				item.onClick(() => this.editMarker(marker));
			});
			menu.addItem((item) => {
				item.setTitle('Copy marker');
				item.setIcon('copy');
				item.onClick(() => this.startCopyMarker(marker));
			});
			menu.addItem((item) => {
				item.setTitle('Resize marker');
				item.setIcon('maximize-2');
				item.onClick(() => this.enterResizeMode(marker, markerEl, 'marker'));
			});
			menu.addItem((item) => {
				item.setTitle('Resize text');
				item.setIcon('a-large-small');
				item.onClick(() => this.enterResizeMode(marker, markerEl, 'text'));
			});
			menu.addItem((item) => {
				item.setTitle('Delete');
				item.setIcon('trash-2');
				item.onClick(() => this.deleteMarker(marker));
			});
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
			templateId,
			x,
			y,
			layerId,
			note: null,
			alias: null,
			previewNote: null,
			description: null,
			direction: template?.direction ?? 'down',
			textPlacement: template?.textPlacement ?? 'above',
			color: template?.color ?? '#ffffff',
			transparency: template?.transparency ?? 0,
			icon: template?.icon ?? null,
			iconColor: template?.iconColor ?? '#000000',
			iconRotation: template?.iconRotation ?? 0,
			useBaseMarker: template?.useBaseMarker ?? true,
			shape: template?.shape ?? 'pin',
			scale: null,
			scaleToZoom: null,
			textScale: null,
			textScaleToZoom: null,
			font: null,
			textVisibility: null,
		};

		new MarkerEditModal(
			this.plugin.app,
			this.plugin,
			marker,
			this.state.layers,
			(updated) => {
				if (!this.state) return;
				Object.assign(marker, updated);
				this.state.markers.push(marker);
				this.plugin.dataManager.saveMapState(this.config.id, this.state);
				this.renderMarkers();
				this.refreshMarkerList();
			},
			true,
		).open();
	}

	/** Enter draw mode, then create a hot zone from the drawn outline. */
	private startZoneDraw(layerId: string | null = null): void {
		this.measurement.cancelDrawing();
		if (this.resizingMarker) this.commitResize();
		this.zoneDraw.start((absolute) => this.createZone(absolute, layerId));
	}

	private createZone(absolute: MapPoint[], layerId: string | null): void {
		if (!this.state) return;
		const { anchor, points } = anchorZonePoints(absolute);

		const marker: MapMarker = {
			id: generateMarkerId(),
			// Zones carry no template. An empty id means template applies skip them,
			// and leaves room to assign one when zone templates arrive.
			templateId: '',
			x: anchor.x,
			y: anchor.y,
			layerId,
			note: null,
			alias: null,
			previewNote: null,
			description: null,
			direction: null,
			textPlacement: 'above',
			color: '#3b82f6',
			transparency: 40,
			icon: null,
			iconColor: null,
			iconRotation: null,
			useBaseMarker: null,
			shape: 'area',
			points,
			scale: null,
			scaleToZoom: null,
			textScale: null,
			textScaleToZoom: null,
			font: null,
			textVisibility: null,
		};

		// Not pushed yet: like a new pin, a hot zone is only persisted when the
		// user saves the editor, so cancelling discards it.
		this.editZone(marker, true);
	}

	/**
	 * Open the zone editor on a working copy. Nothing is mutated on the map until
	 * `commitZone` runs on save, so Cancel always reverts — including after a
	 * redraw, which carries the pending field edits forward in the copy.
	 */
	private editZone(marker: MapMarker, isNew = false): void {
		new ZoneEditModal(
			this.plugin.app,
			this.plugin,
			marker,
			this.state?.layers ?? [],
			(updated) => this.commitZone(updated),
			(edited) => this.redrawZone(edited, isNew),
			isNew,
			// What Inherit resolves to for this zone: the per-map override, else
			// the global default. Computed here because the modal has neither.
			this.state?.textVisibility ?? this.plugin.settings.defaultTextVisibility ?? 'visible',
		).open();
	}

	/** Persist an edited zone: assign onto the existing marker, or add a new one. */
	private commitZone(zone: MapMarker): void {
		if (!this.state) return;
		// Match by id rather than reference: a redraw hands us a detached copy.
		const existing = this.state.markers.find((m) => m.id === zone.id);
		if (existing) {
			Object.assign(existing, zone);
		} else {
			this.state.markers.push({ ...zone });
		}
		this.plugin.dataManager.saveMapState(this.config.id, this.state);
		this.renderMarkers();
		this.refreshMarkerList();
	}

	/**
	 * Redraw a zone's outline, keeping its other settings (including edits still
	 * pending in the editor). Reopens the editor on a copy carrying the new
	 * geometry; nothing is committed until the user saves there.
	 */
	private redrawZone(marker: MapMarker, isNew: boolean): void {
		this.measurement.cancelDrawing();
		// Hide the on-map original while its replacement is drawn: the old outline
		// would otherwise sit over exactly where the new one is being placed.
		this.redrawingZoneId = marker.id;
		const started = this.zoneDraw.start((absolute) => {
			const { anchor, points } = anchorZonePoints(absolute);
			this.editZone({ ...marker, x: anchor.x, y: anchor.y, points }, isNew);
		});
		// Another interaction owns the map: un-hide rather than leaving it invisible
		if (!started) {
			this.redrawingZoneId = null;
			this.renderZones();
		}
	}

	private editMarker(marker: MapMarker): void {
		// Route hot zones to their own editor. Checked on `shape` rather than
		// isZone() so a zone with broken geometry still opens the zone editor,
		// where it can be redrawn, instead of the pin editor.
		if (marker.shape === 'area') {
			this.editZone(marker);
			return;
		}
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
		if (!this.interaction.tryEnter('copying')) return;
		this.pendingCopy = source;
		this.wrapper.addClass('ttrpgmap-copy-mode');

		// Create ghost preview fixed to the viewport
		const ghost = activeWindow.document.body.createDiv({ cls: 'ttrpgmap-marker ttrpgmap-copy-ghost' });

		ghost.style.setProperty('--marker-color', source.color ?? '#ffffff');

		ghost.style.setProperty('--marker-icon-color', source.iconColor ?? '#000000');
		const markerBaseScale = this.getMarkerBaseScale(source);
		const markerScaleToZoom = source.scaleToZoom ?? this.getMarkerScaleToZoom();

		ghost.style.setProperty('--marker-scale', String(this.computeEffectiveScale(markerBaseScale, markerScaleToZoom)));
		const textBaseScale = this.getTextBaseScale(source);
		const textScaleToZoom = source.textScaleToZoom ?? this.getTextScaleToZoom();

		ghost.style.setProperty('--marker-text-scale', String(this.computeEffectiveScale(textBaseScale, textScaleToZoom)));
		const ghostFont = this.getMarkerFont(source);
		if (ghostFont) ghost.style.setProperty('--marker-font', ghostFont);
		ghost.dataset.direction = source.direction ?? 'down';
		ghost.dataset.textPlacement = source.textPlacement ?? 'above';
		createPinElement(ghost, {
			pinClass: 'ttrpgmap-marker-pin',
			svgClass: 'ttrpgmap-pin-svg',
			color: source.color ?? '#ffffff',
			transparency: source.transparency ?? 0,
			icon: source.icon,
			iconColor: source.iconColor ?? '#000000',
			iconRotation: source.iconRotation ?? 0,
			iconClass: 'ttrpgmap-marker-icon',
			useBaseMarker: source.useBaseMarker ?? true,
			shape: source.shape ?? 'pin',
		});
		buildMarkerLabel(ghost, source.note, source.alias, source.description, 'ttrpgmap-marker-label');

		const onMove = (e: MouseEvent) => {
			ghost.style.left = `${e.clientX}px`;

			ghost.style.top = `${e.clientY}px`;
		};
		this.wrapper.addEventListener('mousemove', onMove);

		const cancel = () => {
			this.pendingCopy = null;
			this.interaction.exit();
			this.wrapper.removeClass('ttrpgmap-copy-mode');
			ghost.remove();
			this.wrapper.removeEventListener('mousemove', onMove);
			this.wrapper.removeEventListener('contextmenu', onCancel, true);
			activeWindow.removeEventListener('keydown', onCancel, true);
			activeWindow.removeEventListener('blur', onCancel);
		};
		const onCancel = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			cancel();
		};

		// Cancel on right-click or any keypress
		this.wrapper.addEventListener('contextmenu', onCancel, true);
		activeWindow.addEventListener('keydown', onCancel, true);
		activeWindow.addEventListener('blur', onCancel);

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

	private enterResizeMode(marker: MapMarker, markerEl: HTMLElement, target: 'marker' | 'text'): void {
		// Ensure only one resize handle exists at a time
		if (this.resizingMarker) this.commitResize();
		if (!this.interaction.tryEnter('resizing-marker')) return;
		// Materialize inherited scale so we have a concrete value to adjust
		if (target === 'marker') {
			if (marker.scale === null) marker.scale = this.getMarkerBaseScale(marker);
		} else {
			if (marker.textScale === null) marker.textScale = this.getTextBaseScale(marker);
		}
		this.resizingMarker = marker;
		this.resizeMarkerEl = markerEl;
		this.resizeTarget = target;
		this.resizeStartScale = target === 'marker' ? marker.scale! : marker.textScale!;
		markerEl.addClass('ttrpgmap-marker-resizing');

		// Both handles go on the opposite side from the text to avoid overlap
		const textPlacement = markerEl.dataset.textPlacement ?? 'above';
		const handleSide: 'left' | 'right' = textPlacement === 'left' ? 'right' : 'left';

		// Build the drag handle
		const handle = markerEl.createDiv({ cls: 'ttrpgmap-resize-handle' });
		handle.dataset.side = handleSide;
		this.resizeHandleSide = handleSide;

		const grip = handle.createDiv({ cls: 'ttrpgmap-resize-grip' });
		setIcon(grip, 'grip-vertical');

		const label = handle.createDiv({ cls: 'ttrpgmap-resize-label' });
		label.setText(`${this.resizeStartScale.toFixed(2)}x`);

		const tag = handle.createDiv({ cls: 'ttrpgmap-resize-tag' });
		tag.setText(target === 'marker' ? 'Marker' : 'Text');

		this.resizeHandleEl = handle;
	}

	private updateResizeLabel(scale: number): void {
		const label = this.resizeHandleEl?.querySelector('.ttrpgmap-resize-label');
		if (label) label.setText(`${scale.toFixed(2)}x`);
	}

	private cleanupResizeHandle(): void {
		// Remove all resize handles in the overlay (defensive: ensures singleton)
		this.markerOverlay?.querySelectorAll('.ttrpgmap-resize-handle').forEach((el) => el.remove());
		this.resizeHandleEl = null;
		if (this.resizeMarkerEl) {
			this.resizeMarkerEl.removeClass('ttrpgmap-marker-resizing');
		}
	}

	private commitResize(): void {
		this.cleanupResizeHandle();
		if (this.state) this.plugin.dataManager.saveMapState(this.config.id, this.state);
		this.resizingMarker = null;
		this.resizeMarkerEl = null;
		this.interaction.exit();
	}

	private cancelResize(): void {
		if (this.resizingMarker && this.resizeMarkerEl) {
			// Revert to original scale
			if (this.resizeTarget === 'marker') {
				this.resizingMarker.scale = this.resizeStartScale;
				const stz = this.resizingMarker.scaleToZoom ?? this.getMarkerScaleToZoom();

				this.resizeMarkerEl.style.setProperty(
					'--marker-scale',
					String(this.computeEffectiveScale(this.resizeStartScale, stz)),
				);
			} else {
				this.resizingMarker.textScale = this.resizeStartScale;
				const stz = this.resizingMarker.textScaleToZoom ?? this.getTextScaleToZoom();

				this.resizeMarkerEl.style.setProperty(
					'--marker-text-scale',
					String(this.computeEffectiveScale(this.resizeStartScale, stz)),
				);
			}
		}
		this.cleanupResizeHandle();
		this.resizingMarker = null;
		this.resizeMarkerEl = null;
		this.interaction.exit();
	}

	// ──────────────────── Context Menu ────────────────────

	private onContextMenu(e: MouseEvent): void {
		e.preventDefault();

		// Right-click during zone drawing finishes the shape (handled in the
		// controller's capture listener); never open the map menu over it.
		if (this.zoneDraw.isDrawing) return;
		this.measurement.cancelDrawing();
		// Close any active resize handle when opening map context menu
		if (this.resizingMarker) this.commitResize();

		if (
			(this.measurement.mode === 'measure' || this.measurement.mode === 'freehand') &&
			this.measurement.getMeasurePointCount() >= 2
		) {
			this.measurement.finishMeasuring();
			return;
		}
		if (this.measurement.mode !== 'pan') {
			this.measurement.cancelDrawing();
			return;
		}
		if (!this.state) return;

		const rect = this.mapContainer.getBoundingClientRect();
		const scale = this.zoom / 100;
		const { sx, sy } = this.getImageScale();
		const mapX = (e.clientX - rect.left) / scale / sx;
		const mapY = (e.clientY - rect.top) / scale / sy;

		const menu = new Menu();
		buildPlaceMarkerMenu(menu, {
			templates: this.plugin.settings.markerTemplates,
			folders: this.plugin.settings.templateFolders,
			layers: this.state.layers,
			onPlace: (templateId, layerId) => this.placeMarker(mapX, mapY, templateId, layerId),
		});

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle('Place hot zone');
			item.setIcon('pen-tool');
			item.onClick(() => this.startZoneDraw());
		});
		if (this.state.markers.some((m) => m.shape === 'area')) {
			menu.addItem((item) => {
				item.setTitle(this.showAllZoneOutlines ? 'Hide all zone outlines' : 'Show all zone outlines');
				item.setIcon('eye');
				item.onClick(() => {
					this.showAllZoneOutlines = !this.showAllZoneOutlines;
					this.renderZones();
				});
			});
		}

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle('Edit templates');
			item.setIcon('settings');
			item.onClick(() => {
				const setting = this.plugin.app.setting;
				setting.open();
				setting.openTabById(this.plugin.manifest.id);
			});
		});
		menu.addItem((item) => {
			item.setTitle('Edit map');
			item.setIcon('settings');
			item.onClick(() => this.openSettings());
		});

		menu.showAtMouseEvent(e);
	}

	// ──────────────────── Settings Persistence ────────────────────

	private openSettings(highlightSetting?: string): void {
		if (!this.state) return;
		this.measurement.cancelDrawing();
		new MapSettingsModal(
			this.plugin.app,
			this.plugin,
			this.config,
			this.state,
			highlightSetting,
			// onSave: normal settings save (no ID change)
			(updatedConfig, updatedState) => {
				this.config = updatedConfig;
				this.state = updatedState;
				// Persist zoom/pan so re-render from code block write restores them
				updatedState.savedZoom = this.zoom;
				updatedState.savedPanX = this.panX;
				updatedState.savedPanY = this.panY;
				this.plugin.dataManager.saveMapState(this.config.id, updatedState);
				this.plugin.dataManager.flushSavesSync();
				this.applyWrapperSize();
				if (this.sectionInfo) {
					void writeConfigToCodeBlock(
						this.plugin.app,
						this.sourcePath,
						this.sectionInfo,
						serializeMapConfig(this.config),
					);
				}
				this.applyControlVisibility();
				this.applyControlOpacity();
				this.applyLockState();
				this.renderMarkers();
				this.refreshMarkerList();
			},
			// onIdChanged: executes immediately when the user picks an action
			(oldId, newId, action) => {
				void (async () => {
					const dm = this.plugin.dataManager;
					const freshState = (): MapState => ({
						mapId: newId,
						markers: [],
						layers: [{ id: 'default', name: 'Default Layer', zoomMin: null, zoomMax: null }],
						distanceScale: null,
					});
					if (action === 'migrate') {
						// Move data to new ID, delete old
						const currentState = await dm.loadMapState(oldId);
						currentState.mapId = newId;
						dm.saveMapState(newId, currentState);
						await dm.deleteMapState(oldId);
						this.state = currentState;
					} else if (action === 'copy') {
						// Copy data to new ID, keep old
						const currentState = await dm.loadMapState(oldId);
						currentState.mapId = newId;
						dm.saveMapState(newId, currentState);
						this.state = currentState;
					} else if (action === 'orphan') {
						// Fresh state, keep old data behind
						this.state = freshState();
						dm.saveMapState(newId, this.state);
					} else if (action === 'delete') {
						// Fresh state, delete old data
						await dm.deleteMapState(oldId);
						this.state = freshState();
						dm.saveMapState(newId, this.state);
					}
					await dm.flushSaves();
					this.config.id = newId;
					if (this.sectionInfo) {
						void writeConfigToCodeBlock(
							this.plugin.app,
							this.sourcePath,
							this.sectionInfo,
							serializeMapConfig(this.config),
						);
					}
					this.renderMarkers();
					this.refreshMarkerList();
				})();
			},
		).open();
	}
}
