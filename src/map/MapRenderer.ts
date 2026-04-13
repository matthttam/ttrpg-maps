import { MarkdownRenderChild, Menu, setIcon, parseLinktext } from 'obsidian';
import { buildPlaceMarkerMenu } from './contextMenu';
import { confirmAction } from '../utils/confirmModal';
import type TTRPGMapsPlugin from '../main';
import {
	MapConfig,
	MapState,
	MapMarker,
	MarkerLayer,
	DEFAULT_LAYER_ID,
	DEFAULT_LAYER,
	DEFAULT_MARKER_SCALE,
	DEFAULT_MARKER_TEXT_SCALE,
	MARKER_FONT_STACKS,
} from '../types';
import { MapSettingsModal } from '../modals/MapSettingsModal';
import { MarkerEditModal } from '../modals/MarkerEditModal';
import { LayerEditModal } from '../modals/LayerEditModal';
import { serializeMapConfig, writeConfigToCodeBlock } from '../utils/configSerializer';
import { createPinElement } from '../utils/markerPin';
import { buildMarkerLabel, linkPath, displayTitle } from '../utils/markerLabel';
import { generateMarkerId } from '../utils/mapId';
import { NO_ZOOM_SVG, NO_PAN_SVG } from '../icons/lockIcons';
import { MeasurementController, MeasurementContext } from './MeasurementController';

const RESIZE_SCALE_SENSITIVITY = 0.005;
const MIN_MARKER_SCALE = 0.1;
const MAX_MARKER_SCALE = 5.0;
const MIN_MARKER_TEXT_SCALE = 0.1;
const MAX_MARKER_TEXT_SCALE = 5.0;
const SCROLL_SCALE_STEP = 0.05;
const RESIZE_SAVE_DEBOUNCE_MS = 300;

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

	// Pan/zoom state
	private zoom = 100;
	private panX = 0;
	private panY = 0;
	private isPanning = false;
	private panStartX = 0;
	private panStartY = 0;
	private zoomLocked = false;
	private panLocked = false;
	private markersLocked = false;

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

	// Resize mode state
	private resizingMarker: MapMarker | null = null;
	private resizeMarkerEl: HTMLElement | null = null;
	private resizeHandleEl: HTMLElement | null = null;
	private resizeStartX = 0;
	private resizeStartScale = 1;
	private resizeTarget: 'marker' | 'text' = 'marker';
	private resizeHandleSide: 'left' | 'right' = 'right';
	private isDraggingHandle = false;
	private _resizeSaveTimeout: ReturnType<typeof setTimeout> | null = null;

	// Copy-marker state
	private pendingCopy: MapMarker | null = null;
	private _cancelCopy: (() => void) | null = null;

	// Container resize handling
	private resizeObserver: ResizeObserver | null = null;
	private _resizeDebounce: ReturnType<typeof setTimeout> | null = null;

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
			this.plugin.dataManager.saveMapState(this.config.id, this.state);
			this.plugin.onMapRefresh(this.refreshCallback);
			this.buildDOM();
		})();
	}

	onunload(): void {
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
			clearTimeout(this._resizeDebounce);
			this._resizeDebounce = null;
		}
	}

	// ──────────────────── DOM Setup ────────────────────

	private buildDOM(): void {
		const el = this.containerEl;
		el.empty();
		el.addClass('ttrpgmap-root');

		this.wrapper = el.createDiv({ cls: 'ttrpgmap-wrapper' });
		this.applyWrapperSize();

		this.mapContainer = this.wrapper.createDiv({ cls: 'ttrpgmap-container' });

		this.imageEl = this.mapContainer.createEl('img', { cls: 'ttrpgmap-image' });
		this.loadImage();

		this.svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		this.svgOverlay.addClass('ttrpgmap-svg-overlay');
		this.mapContainer.appendChild(this.svgOverlay);

		// Marker overlay sits outside the scaled container for crisp rendering
		this.markerOverlay = this.wrapper.createDiv({ cls: 'ttrpgmap-marker-overlay' });

		this.imageEl.addEventListener('load', () => {
			this.svgOverlay.setAttribute('width', String(this.imageEl.naturalWidth));
			this.svgOverlay.setAttribute('height', String(this.imageEl.naturalHeight));
			this.applyWrapperSize();
			this.renderMarkers();
		});

		this.buildZoomControls();
		this.measurement = new MeasurementController(this.getMeasurementContext());
		this.measurement.buildUI();
		this.measurePanelEl = this.measurement.panelEl;
		this.buildSettingsButton();
		this.buildMarkerListPanel();
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
				clearTimeout(this._resizeDebounce);
			}
			this._resizeDebounce = setTimeout(() => {
				this._resizeDebounce = null;
				this.imageEl.removeClass('ttrpgmap-pixelated');
				this.svgOverlay.removeClass('ttrpgmap-hidden');
				this.updateMarkerPositions();
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
		let timer = setTimeout(() => warning.remove(), 2000);
		warning.addEventListener('mouseenter', () => {
			clearTimeout(timer);
			warning.addClass('ttrpgmap-lock-warning-paused');
		});
		warning.addEventListener('mouseleave', () => {
			warning.removeClass('ttrpgmap-lock-warning-paused');
			timer = setTimeout(() => warning.remove(), 1000);
		});
	}

	private getMeasurementContext(): MeasurementContext {
		return {
			app: this.plugin.app,
			wrapper: this.wrapper,
			mapContainer: this.mapContainer,
			svgOverlay: this.svgOverlay,
			getZoom: () => this.zoom,
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
			const isDefault = layer.id === DEFAULT_LAYER_ID;
			const layerId = layer.id;
			const visOverride = this.layerVisibilityOverrides.get(layerId) ?? 'show';

			const row = container.createDiv({ cls: 'ttrpgmap-marker-list-row' });

			// Layer name + zoom range
			const nameEl = row.createDiv({ cls: 'ttrpgmap-marker-list-name' });
			nameEl.setText(layer.name);
			const rangeText = this.formatZoomRangeShort(layer);
			if (rangeText) {
				nameEl.createEl('span', { cls: 'ttrpgmap-layer-range-badge', text: ` ${rangeText}` });
			}

			// Action button group
			const actionGroup = row.createDiv({ cls: 'ttrpgmap-layer-action-group' });

			// Visibility eye toggle (3-state: show -> hide -> always -> show)
			const eyeBtn = actionGroup.createDiv({ cls: 'ttrpgmap-marker-list-action', attr: { 'aria-label': this.getVisibilityLabel(visOverride) } });
			const updateEyeIcon = (vis: 'show' | 'hide' | 'always') => {
				eyeBtn.empty();
				eyeBtn.removeClass('ttrpgmap-layer-eye-always');
				if (vis === 'hide') { setIcon(eyeBtn, 'eye-off'); }
				else if (vis === 'always') { setIcon(eyeBtn, 'eye'); eyeBtn.addClass('ttrpgmap-layer-eye-always'); }
				else { setIcon(eyeBtn, 'minus'); }
				eyeBtn.setAttribute('aria-label', this.getVisibilityLabel(vis));
			};
			updateEyeIcon(visOverride);
			eyeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const current = this.layerVisibilityOverrides.get(layerId) ?? 'show';
				const next = current === 'show' ? 'hide' : current === 'hide' ? 'always' : 'show';
				this.layerVisibilityOverrides.set(layerId, next);
				updateEyeIcon(next);
				this.updateMarkerScalesAndVisibility();
				this.refreshMarkerList();
			});

			// Edit button
			const editBtn = actionGroup.createDiv({ cls: 'ttrpgmap-marker-list-action', attr: { 'aria-label': 'Edit layer' } });
			setIcon(editBtn, 'pencil');
			editBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				new LayerEditModal(this.plugin.app, {
					layer,
					mapZoomMin: this.config.zoomMin,
					mapZoomMax: this.config.zoomMax,
					onSave: (saved) => {
						Object.assign(layer, saved);
						if (this.state) this.plugin.dataManager.saveMapState(this.config.id, this.state);
						this.renderLayerList(container);
						this.updateMarkerScalesAndVisibility();
					},
				}).open();
			});

			// Delete/Reset button
			if (isDefault) {
				const resetBtn = actionGroup.createDiv({ cls: 'ttrpgmap-marker-list-action', attr: { 'aria-label': 'Reset to defaults' } });
				setIcon(resetBtn, 'rotate-ccw');
				resetBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					layer.name = DEFAULT_LAYER.name;
					layer.zoomMin = DEFAULT_LAYER.zoomMin;
					layer.zoomMax = DEFAULT_LAYER.zoomMax;
					if (this.state) this.plugin.dataManager.saveMapState(this.config.id, this.state);
					this.renderLayerList(container);
					this.updateMarkerScalesAndVisibility();
				});
			} else {
				const deleteBtn = actionGroup.createDiv({ cls: 'ttrpgmap-marker-list-action ttrpgmap-marker-list-delete', attr: { 'aria-label': 'Delete layer' } });
				setIcon(deleteBtn, 'trash-2');
				deleteBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					if (!this.state) return;
					const count = this.state.markers.filter((m) => m.layerId === layerId).length;
					const msg = count > 0
						? `Delete "${layer.name}"? ${count} marker${count !== 1 ? 's' : ''} will be moved to the Default Layer.`
						: `Delete "${layer.name}"?`;
					void confirmAction(this.plugin.app, 'Delete layer', msg, 'Delete').then((confirmed) => {
						if (!confirmed || !this.state) return;
						for (const m of this.state.markers) {
							if (m.layerId === layerId) m.layerId = null;
						}
						this.state.layers = this.state.layers.filter((l) => l.id !== layerId);
						this.layerVisibilityOverrides.delete(layerId);
						this.plugin.dataManager.saveMapState(this.config.id, this.state);
						this.renderLayerList(container);
						this.renderMarkers();
						this.refreshMarkerList();
					});
				});
			}

			// Hover: highlight markers on this layer
			row.addEventListener('mouseenter', () => {
				const els = this.markerOverlay.querySelectorAll<HTMLElement>('.ttrpgmap-marker');
				els.forEach((el) => {
					const mid = el.dataset.markerId;
					if (!mid || !this.state) return;
					const marker = this.state.markers.find((m) => m.id === mid);
					if (!marker) return;
					const markerLayerId = marker.layerId ?? DEFAULT_LAYER_ID;
					if (markerLayerId === layerId) {
						this.startBounce(el);
						el.setCssStyles({ opacity: '1' });
					} else {
						el.setCssStyles({ opacity: '0.3' });
					}
				});
			});
			row.addEventListener('mouseleave', () => {
				const els = this.markerOverlay.querySelectorAll<HTMLElement>('.ttrpgmap-marker');
				els.forEach((el) => {
					el.setCssStyles({ opacity: '' });
					this.stopBounce(el);
				});
			});
		}

		// Add layer button
		const addRow = container.createDiv({ cls: 'ttrpgmap-marker-list-row ttrpgmap-layer-add-row' });
		const addBtn = addRow.createDiv({ cls: 'ttrpgmap-marker-list-action', attr: { 'aria-label': 'Add layer' } });
		setIcon(addBtn, 'layers');
		addRow.createDiv({ cls: 'ttrpgmap-marker-list-name', text: 'Add layer' });
		addRow.addEventListener('click', (e) => {
			e.stopPropagation();
			if (!this.state) return;
			const existingNames = new Set(this.state.layers.map((l) => l.name.toLowerCase()));
			let n = 1;
			while (existingNames.has(`layer ${n}`.toLowerCase())) n++;
			const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			const newLayer: MarkerLayer = { id, name: `Layer ${n}`, zoomMin: this.config.zoomMin, zoomMax: this.config.zoomMax };
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
			createPinElement(preview, {
				pinClass: 'ttrpgmap-marker-list-pin',
				svgClass: 'ttrpgmap-pin-svg',
				color: marker.color ?? '#ffffff',
				icon: marker.icon,
				iconColor: marker.iconColor ?? '#000000',
				iconRotation: marker.iconRotation ?? 0,
				iconClass: 'ttrpgmap-marker-list-icon',
				useBaseMarker: marker.useBaseMarker ?? true,
				shape,
			});

			// Name
			const name = displayTitle(marker.note, marker.alias) || 'Unnamed';
			row.createDiv({ cls: 'ttrpgmap-marker-list-name', text: name });

			// Hidden indicator
			if (!visible) {
				const hiddenIcon = row.createDiv({ cls: 'ttrpgmap-marker-list-hidden-icon' });
				setIcon(hiddenIcon, 'eye-off');
			}

			// Highlight map marker on hover
			row.addEventListener('mouseenter', () => {
				const el = this.markerOverlay.querySelector<HTMLElement>(`[data-marker-id="${marker.id}"]`);
				if (el) this.startBounce(el);
			});
			row.addEventListener('mouseleave', () => {
				const el = this.markerOverlay.querySelector<HTMLElement>(`[data-marker-id="${marker.id}"]`);
				if (el) this.stopBounce(el);
			});

			// Description tooltip on hover
			if (marker.description) {
				row.setAttribute('aria-label', marker.description);
				row.addClass('ttrpgmap-marker-list-has-desc');
			}

			// Action button group
			const markerActionGroup = row.createDiv({ cls: 'ttrpgmap-layer-action-group' });

			// Edit button
			const editBtn = markerActionGroup.createDiv({ cls: 'ttrpgmap-marker-list-action', attr: { 'aria-label': 'Edit' } });
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
			if ((this.measurement.mode === 'measure' || this.measurement.mode === 'freehand') && this.measurement.getMeasurePointCount() >= 2) {
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

	// ──────────────────── Pan / Zoom ────────────────────

	private applyTransform(): void {
		const scale = this.zoom / 100;

		this.mapContainer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${scale})`;
		this.updateMarkerPositions();
	}

	private getImageScale(): { sx: number; sy: number } {
		if (!this.imageEl || !this.imageEl.naturalWidth || !this.imageEl.naturalHeight) return { sx: 1, sy: 1 };
		return {
			sx: this.imageEl.clientWidth / this.imageEl.naturalWidth,
			sy: this.imageEl.clientHeight / this.imageEl.naturalHeight,
		};
	}

	private adjustZoom(delta: number): void {
		if (this.zoomLocked) { this.showLockWarning('Zoom is locked', 'Lock zoom'); return; }
		const newZoom = Math.max(this.config.zoomMin, Math.min(this.config.zoomMax, this.zoom + delta));
		if (newZoom === this.zoom) return;
		this.zoom = newZoom;
		this.applyTransform();
		this.updateMarkerScalesAndVisibility();
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
		this.updateMarkerScalesAndVisibility();
		const label = this.wrapper.querySelector('.ttrpgmap-zoom-label');
		if (label) label.setText(`${this.zoom}%`);
	}

	private onMouseDown(e: MouseEvent): void {
		if (e.button !== 0) return;
		// Only handle interactions on the map surface, not UI overlays
		if (!(e.target as HTMLElement).closest('.ttrpgmap-container, .ttrpgmap-marker-overlay')) return;

		// Resize mode: only start drag if clicking the handle
		if (this.resizingMarker && this.resizeHandleEl) {
			const handle = (e.target as HTMLElement).closest('.ttrpgmap-resize-handle');
			if (handle) {
				e.preventDefault();
				e.stopPropagation();
				this.isDraggingHandle = true;
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

		if (this.panLocked) { this.showLockWarning('Pan is locked', 'Lock pan'); return; }
		this.isPanning = true;
		this.panStartX = e.clientX - this.panX;
		this.panStartY = e.clientY - this.panY;
		this.wrapper.addClass('ttrpgmap-panning');
	}

	private onMouseMove(e: MouseEvent): void {
		// Marker hover proximity for measurement modes
		if (this.measurement.mode !== 'pan') {
			this.updateMarkerMeasureHover(e);
		}

		// Measure preview: rubber-band line from last committed point to cursor
		if (this.measurement.mode === 'measure' && this.measurement.hasDrawingPoints) {
			this.measurement.updateMeasurePreview(e);
		}

		// Resize drag (only when actively dragging the handle)
		if (this.isDraggingHandle && this.resizingMarker && this.resizeMarkerEl) {
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
			if (this.dismissActiveHover) { this.dismissActiveHover(); this.dismissActiveHover = null; }
			const dx = e.clientX - this.dragStartX;
			const dy = e.clientY - this.dragStartY;
			if (dx !== 0 || dy !== 0) this.hasDragged = true;
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

	private onWrapperLeave(): void {
		// Only end panning on wrapper leave, not marker dragging or other operations.
		// Marker dragging should survive the cursor leaving the wrapper (e.g., popover overlay).
		if (this.isPanning) {
			this.isPanning = false;
			this.wrapper.removeClass('ttrpgmap-panning');
		}
	}

	private onMouseUp(): void {
		// Resize: end handle drag (but stay in resize mode)
		if (this.isDraggingHandle) {
			this.isDraggingHandle = false;
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
			return;
		}
		this.isPanning = false;
		this.wrapper.removeClass('ttrpgmap-panning');
	}

	private onWheel(e: WheelEvent): void {
		// Alt+scroll on a marker: resize it (always allowed even when zoom locked)
		// Alt = per-marker, Shift+Alt = map-level; over label = text scale, over pin = marker scale
		if (e.altKey && this.state) {
			const markerEl = (e.target as HTMLElement).closest<HTMLElement>('.ttrpgmap-marker');
			if (markerEl) {
				const markerId = markerEl.dataset.markerId;
				const marker = this.state.markers.find((m) => m.id === markerId);
				if (marker) {
					e.preventDefault();
					const isLabel = !!(e.target as HTMLElement).closest('.ttrpgmap-marker-label');
					const isMapLevel = e.shiftKey;
					const scaleDelta = e.deltaY < 0 ? SCROLL_SCALE_STEP : -SCROLL_SCALE_STEP;
					const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

					if (isLabel) {
						if (isMapLevel) {
							// Shift+Alt over label: map-level text scale
							if (this.state.markerTextScale == null) this.state.markerTextScale = this.getTextBaseScale(marker);
							this.state.markerTextScale = clamp(
								this.state.markerTextScale + scaleDelta,
								MIN_MARKER_TEXT_SCALE,
								MAX_MARKER_TEXT_SCALE,
							);
							this.updateMarkerScalesAndVisibility();
						} else {
							// Alt over label: per-marker text scale
							if (marker.textScale === null) marker.textScale = this.getTextBaseScale(marker);
							marker.textScale = clamp(marker.textScale + scaleDelta, MIN_MARKER_TEXT_SCALE, MAX_MARKER_TEXT_SCALE);
							const stz = marker.textScaleToZoom ?? this.getTextScaleToZoom();

							markerEl.style.setProperty(
								'--marker-text-scale',
								String(this.computeEffectiveScale(marker.textScale, stz)),
							);
						}
					} else {
						if (isMapLevel) {
							// Shift+Alt over pin: map-level marker scale
							if (this.state.markerScale == null) this.state.markerScale = this.getMarkerBaseScale(marker);
							this.state.markerScale = clamp(this.state.markerScale + scaleDelta, MIN_MARKER_SCALE, MAX_MARKER_SCALE);
							this.updateMarkerScalesAndVisibility();
						} else {
							// Alt over pin: per-marker scale (existing behavior)
							if (marker.scale === null) marker.scale = this.getMarkerBaseScale(marker);
							marker.scale = clamp(marker.scale + scaleDelta, MIN_MARKER_SCALE, MAX_MARKER_SCALE);
							const stz = marker.scaleToZoom ?? this.getMarkerScaleToZoom();

							markerEl.style.setProperty('--marker-scale', String(this.computeEffectiveScale(marker.scale, stz)));
						}
					}

					// Show hotspot markers visibly while resizing
					markerEl.addClass('ttrpgmap-marker-resizing');
					// Debounced save + remove resizing class
					if (this._resizeSaveTimeout) clearTimeout(this._resizeSaveTimeout);
					this._resizeSaveTimeout = setTimeout(() => {
						markerEl.removeClass('ttrpgmap-marker-resizing');
						if (this.state) this.plugin.dataManager.saveMapState(this.config.id, this.state);
					}, RESIZE_SAVE_DEBOUNCE_MS);
					return;
				}
			}
		}

		if (this.zoomLocked) { this.showLockWarning('Zoom is locked', 'Lock zoom'); return; }
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
		el.addEventListener('animationiteration', () => {
			if (el.hasClass('ttrpgmap-marker-bounce-stopping')) {
				el.removeClass('ttrpgmap-marker-bounce');
				el.removeClass('ttrpgmap-marker-bounce-stopping');
			}
		}, { once: true });
	}

	private isControlVisible(field: 'showMeasurementTools' | 'showZoomControls' | 'showMarkerList' | 'showLayerList' | 'showMapSettings'): boolean {
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
	private getMarkerFont(marker: MapMarker): string | null {
		const font = marker.font ?? this.state?.markerFont ?? this.plugin.settings.defaultMarkerFont ?? 'default';
		if (font === 'default') return null;
		return MARKER_FONT_STACKS[font] ?? null;
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
		const els = this.markerOverlay.querySelectorAll<HTMLElement>('.ttrpgmap-marker');
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
		const els = this.markerOverlay.querySelectorAll<HTMLElement>('.ttrpgmap-marker');
		const needsFullRender = false;

		els.forEach((el) => {
			const id = el.dataset.markerId;
			if (!id) return;
			const marker = markerMap.get(id);
			if (!marker) return;

			// Update visibility (fade instead of instant hide)
			const visible = this.isMarkerVisible(marker);
			el.toggleClass('ttrpgmap-marker-layer-hidden', !visible);

			// Update scales
			const markerBaseScale = this.getMarkerBaseScale(marker);
			const markerScaleToZoom = marker.scaleToZoom ?? mapScaleToZoom;

			el.style.setProperty('--marker-scale', String(this.computeEffectiveScale(markerBaseScale, markerScaleToZoom)));

			const textBaseScale = this.getTextBaseScale(marker);
			const textScaleToZoom = marker.textScaleToZoom ?? mapTextScaleToZoom;

			el.style.setProperty('--marker-text-scale', String(this.computeEffectiveScale(textBaseScale, textScaleToZoom)));
		});

		if (needsFullRender) this.renderMarkers();
	}

	/** Update marker hover state during measurement modes */
	private updateMarkerMeasureHover(e: MouseEvent): void {
		const els = this.markerOverlay.querySelectorAll<HTMLElement>('.ttrpgmap-marker');
		const mx = e.clientX;
		const my = e.clientY;
		const pad = 5;
		els.forEach((el) => {
			// Check the marker element itself
			const rect = el.getBoundingClientRect();
			let isNear = mx >= rect.left - pad && mx <= rect.right + pad && my >= rect.top - pad && my <= rect.bottom + pad;
			// Also check the label if it extends outside the marker box
			if (!isNear) {
				const label = el.querySelector<HTMLElement>('.ttrpgmap-marker-label');
				if (label) {
					const lr = label.getBoundingClientRect();
					isNear = mx >= lr.left - pad && mx <= lr.right + pad && my >= lr.top - pad && my <= lr.bottom + pad;
				}
			}
			el.toggleClass('ttrpgmap-marker-measure-hover', isNear);
		});
	}

	private renderMarkers(): void {
		if (!this.state) return;
		// Null out refs before DOM wipe (elements are removed with the markers)
		this.resizeHandleEl = null;
		this.isDraggingHandle = false;
		this.markerOverlay.querySelectorAll('.ttrpgmap-marker').forEach((el) => el.remove());

		const mapScaleToZoom = this.getMarkerScaleToZoom();
		const mapTextScaleToZoom = this.getTextScaleToZoom();

		const isMeasuring = this.measurement.mode !== 'pan';

		for (const marker of this.state.markers) {
			const markerEl = this.createMarkerElement(marker, mapScaleToZoom, mapTextScaleToZoom, isMeasuring);
			if (!this.isMarkerVisible(marker)) markerEl.addClass('ttrpgmap-marker-layer-hidden');
			if (!isMeasuring) this.attachMarkerEvents(marker, markerEl);
		}

		this.recoverResizeMode();
	}

	private createMarkerElement(
		marker: MapMarker,
		mapScaleToZoom: boolean,
		mapTextScaleToZoom: boolean,
		isMeasuring: boolean,
	): HTMLElement {
		const color = marker.color ?? '#ffffff';
		const iconColor = marker.iconColor ?? '#000000';
		const direction = marker.direction ?? 'down';
		const textPlacement = marker.textPlacement ?? 'above';

		const { x, y } = this.toScreenCoords(marker.x, marker.y);
		const markerEl = this.markerOverlay.createDiv({ cls: 'ttrpgmap-marker' });

		markerEl.style.left = `${x}px`;

		markerEl.style.top = `${y}px`;

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

		if (isMeasuring) {
			markerEl.addClass('ttrpgmap-marker-measuring');
		}

		createPinElement(markerEl, {
			pinClass: 'ttrpgmap-marker-pin',
			svgClass: 'ttrpgmap-pin-svg',
			color,
			icon: marker.icon,
			iconColor,
			iconRotation: marker.iconRotation ?? 0,
			iconClass: 'ttrpgmap-marker-icon',
			useBaseMarker: marker.useBaseMarker ?? true,
			shape: marker.shape ?? 'pin',
		});

		buildMarkerLabel(markerEl, marker.note, marker.alias, marker.description, 'ttrpgmap-marker-label');

		return markerEl;
	}

	private attachMarkerEvents(marker: MapMarker, markerEl: HTMLElement): void {
		// Click to navigate
		if (marker.note) {
			const navPath = linkPath(marker.note);
			markerEl.addEventListener('click', (e) => {
				if (this.hasDragged) {
					this.hasDragged = false;
					return;
				}
				e.stopPropagation();
				const newTab = this.openLinksInNewTab;
				void this.plugin.app.workspace.openLinkText(navPath, '', newTab);
			});
		}

		// Hover preview
		// Spec: 300ms delay, interactable popover, any mousedown dismisses,
		// Alt dismisses, must mouse-out and back in to re-trigger after dismiss.
		let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
		let hoverSuppressed = false;
		const hoverParent: { hoverPopover: { hide: () => void } | null } = { hoverPopover: null };

		const clearHoverTimeout = () => {
			if (hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout = null; }
		};
		const dismissPopover = () => {
			clearHoverTimeout();
			if (hoverParent.hoverPopover) { hoverParent.hoverPopover.hide(); hoverParent.hoverPopover = null; }
			hoverSuppressed = true; // require fresh mouseenter to re-trigger
		};

		markerEl.addEventListener('mouseenter', (e) => {
			markerEl.setCssStyles({ zIndex: '10' });
			hoverSuppressed = false; // fresh enter resets suppression
			this.dismissActiveHover = dismissPopover;
			if (this.draggingMarker || e.altKey) return;
			const showPreview = this.showHoverPreview;
			if (!showPreview) return;
			let previewPath: string | null = null;
			if (marker.previewNote) {
				const p = linkPath(marker.previewNote);
				const { path: basePath } = parseLinktext(p);
				if (basePath && this.plugin.app.metadataCache.getFirstLinkpathDest(basePath, '')) {
					previewPath = p;
				}
			}
			if (!previewPath && marker.note) {
				previewPath = linkPath(marker.note);
			}
			if (!previewPath) return;
			hoverTimeout = setTimeout(() => {
				hoverTimeout = null;
				if (this.draggingMarker || hoverSuppressed) return;
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

		// mouseleave: only cancel timeout, do NOT dismiss popover
		// (user may be moving cursor to the popover itself - requirement #2)
		markerEl.addEventListener('mouseleave', () => {
			markerEl.setCssStyles({ zIndex: '' });
			clearHoverTimeout();
		});

		// Any mousedown on marker: dismiss everything (requirement #3)
		markerEl.addEventListener('mousedown', dismissPopover);


		// Drag to reposition
		markerEl.addEventListener('mousedown', (e) => {
			if (e.button !== 0) return;
			if (this.resizingMarker) return;
			e.stopPropagation();
			if (this.markersLocked) {
				this.showLockWarning('Marker positions are locked', 'Lock markers');
				return;
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

		// Right-click menu
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
		this.wrapper.removeClass('ttrpgmap-cursor-grab');
		this.wrapper.removeClass('ttrpgmap-cursor-crosshair');
		this.wrapper.addClass('ttrpgmap-cursor-copy');
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
			this.wrapper.removeClass('ttrpgmap-cursor-copy');
			this.wrapper.removeClass('ttrpgmap-cursor-crosshair');
			this.wrapper.addClass('ttrpgmap-cursor-grab');
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
		this.isDraggingHandle = false;
		if (this.resizeMarkerEl) {
			this.resizeMarkerEl.removeClass('ttrpgmap-marker-resizing');
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
	}

	// ──────────────────── Context Menu ────────────────────

	private onContextMenu(e: MouseEvent): void {
		e.preventDefault();

		// Close any active resize handle when opening map context menu
		if (this.resizingMarker) this.commitResize();

		if ((this.measurement.mode === 'measure' || this.measurement.mode === 'freehand') && this.measurement.getMeasurePointCount() >= 2) {
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
			item.setTitle('Edit templates');
			item.setIcon('settings');
			item.onClick(() => {
				const setting = this.plugin.app.setting;
				setting.open();
				setting.openTabById(this.plugin.manifest.id);
			});
		});
		if (!this.isControlVisible('showMapSettings') || this.controlOpacity === 0) {
			menu.addItem((item) => {
				item.setTitle('Edit map');
				item.setIcon('settings');
				item.onClick(() => this.openSettings());
			});
		}

		menu.showAtMouseEvent(e);
	}

	// ──────────────────── Settings Persistence ────────────────────

	private openSettings(highlightSetting?: string): void {
		if (!this.state) return;
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
				this.applyWrapperSize();
				if (this.sectionInfo) {
					void writeConfigToCodeBlock(
						this.plugin.app,
						this.sourcePath,
						this.sectionInfo,
						serializeMapConfig(this.config),
					);
				}
				this.plugin.dataManager.saveMapState(this.config.id, updatedState);
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
