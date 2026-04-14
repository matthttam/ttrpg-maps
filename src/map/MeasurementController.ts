import { Notice, setIcon } from 'obsidian';
import { MapPoint, MapState, RoundingMode } from '../types';
import { ScaleCalibrationModal } from '../modals/ScaleCalibrationModal';
import { pixelDistance, pixelsToUnits, polylineUnitsDistance, applyRounding } from '../distance';

type InteractionMode = 'pan' | 'calibrate' | 'measure' | 'freehand';

const FREEHAND_MIN_DISTANCE = 5;
const DEFAULT_ROUNDING_MULTIPLE = 5;

/** Context interface the measurement controller needs from the renderer */
export interface MeasurementContext {
	app: { workspace: unknown };
	wrapper: HTMLElement;
	mapContainer: HTMLElement;
	svgOverlay: SVGSVGElement;
	getZoom: () => number;
	getState: () => MapState | null;
	config: { id: string };
	plugin: { app: { workspace: unknown }; dataManager: { saveMapState: (id: string, state: MapState) => void } };
	renderMarkers: () => void;
	cancelCopy: () => void;
}

/**
 * Manages all measurement and drawing interactions: calibration, point-to-point,
 * freehand measurement, and the SVG overlays they produce.
 */
export class MeasurementController {
	mode: InteractionMode = 'pan';

	// Drawing state
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

	// UI elements (built by buildUI)
	panelEl: HTMLElement | null = null;
	private toolbar: HTMLElement | null = null;
	private totalDisplay: HTMLDivElement | null = null;
	private drawerWrapper: HTMLElement | null = null;

	private ctx: MeasurementContext;

	constructor(ctx: MeasurementContext) {
		this.ctx = ctx;
	}

	private get state(): MapState | null { return this.ctx.getState(); }
	private get zoom(): number { return this.ctx.getZoom(); }

	/** Build the measurement panel UI (toggle button, tool buttons, rounding controls, total display) */
	buildUI(): void {
		const panel = this.ctx.wrapper.createDiv({ cls: 'ttrpgmap-measure-panel' });
		this.panelEl = panel;

		// Toggle button
		const toggleBtn = panel.createDiv({ cls: 'ttrpgmap-measure-toggle' });
		setIcon(toggleBtn, 'ruler');
		toggleBtn.setAttribute('aria-label', 'Measurement tools');

		// Drawer (hidden by default)
		const drawer = panel.createDiv({ cls: 'ttrpgmap-measure-drawer' });
		drawer.addClass('ttrpgmap-hidden');
		this.drawerWrapper = drawer;

		// Tool buttons
		const toolRow = drawer.createDiv({ cls: 'ttrpgmap-measure-tools' });
		this.toolbar = toolRow;

		const tools: { label: string; icon: string; mode: InteractionMode }[] = [
			{ label: 'Set Distance Scale', icon: 'scaling', mode: 'calibrate' },
			{ label: 'Measure Distance', icon: 'route', mode: 'measure' },
			{ label: 'Freehand Measure', icon: 'pencil', mode: 'freehand' },
		];
		for (const tool of tools) {
			const btn = toolRow.createDiv({ cls: 'ttrpgmap-toolbar-btn', attr: { 'aria-label': tool.label } });
			setIcon(btn, tool.icon);
			btn.addEventListener('click', (e) => { e.stopPropagation(); this.setMode(tool.mode); });
		}

		// Rounding controls
		this.buildRoundingControls(drawer);

		// Toggle drawer
		toggleBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			drawer.toggleClass('ttrpgmap-hidden', !drawer.hasClass('ttrpgmap-hidden'));
		});

		// Total distance display
		this.totalDisplay = this.ctx.wrapper.createDiv({ cls: 'ttrpgmap-measure-total' });
		this.totalDisplay.addClass('ttrpgmap-hidden');
	}

	private buildRoundingControls(drawer: HTMLElement): void {
		const section = drawer.createDiv({ cls: 'ttrpgmap-measure-rounding' });
		section.createDiv({ cls: 'ttrpgmap-measure-rounding-label', text: 'Rounding' });

		const row = section.createDiv({ cls: 'ttrpgmap-measure-rounding-row' });

		// Mode dropdown
		const modeSelect = row.createEl('select', { cls: 'ttrpgmap-measure-rounding-select' });
		const modes = [
			{ text: 'None', value: 'none' },
			{ text: 'Closest', value: 'closest' },
			{ text: 'Up to', value: 'up' },
			{ text: 'Down to', value: 'down' },
		];
		const currentMode = this.state?.roundingMode ?? 'none';
		for (const m of modes) {
			const opt = modeSelect.createEl('option', { text: m.text, value: m.value });
			opt.selected = currentMode === m.value;
		}

		const multipleLabel = row.createEl('span', { cls: 'ttrpgmap-measure-rounding-of', text: 'Multiple of' });
		const multipleInput = row.createEl('input', {
			cls: 'ttrpgmap-measure-rounding-input',
			type: 'number',
			attr: { min: '0', step: 'any' },
			value: String(this.state?.roundingMultiple ?? DEFAULT_ROUNDING_MULTIPLE),
		});

		const rawLabel = row.createEl('label', { cls: 'ttrpgmap-measure-rounding-raw' });
		const rawCheckbox = rawLabel.createEl('input', { type: 'checkbox' });
		rawCheckbox.checked = this.state?.showRawDistance ?? false;
		rawLabel.append('Raw');

		const updateVisibility = () => {
			const isNone = modeSelect.value === 'none';
			multipleLabel.toggleClass('ttrpgmap-hidden', isNone);
			multipleInput.toggleClass('ttrpgmap-hidden', isNone);
			rawLabel.toggleClass('ttrpgmap-hidden', isNone);
		};
		updateVisibility();

		const saveState = () => {
			if (this.state) this.ctx.plugin.dataManager.saveMapState(this.ctx.config.id, this.state);
		};

		modeSelect.addEventListener('change', () => {
			if (!this.state) return;
			this.state.roundingMode = modeSelect.value as RoundingMode;
			updateVisibility();
			saveState();
		});

		multipleInput.addEventListener('change', () => {
			if (!this.state) return;
			const val = parseFloat(multipleInput.value);
			if (!isNaN(val) && val > 0) {
				this.state.roundingMultiple = val;
				saveState();
			}
		});

		rawCheckbox.addEventListener('change', () => {
			if (!this.state) return;
			this.state.showRawDistance = rawCheckbox.checked;
			saveState();
		});

		// Decimal places
		const decimalsRow = section.createDiv({ cls: 'ttrpgmap-measure-rounding-row' });
		decimalsRow.createEl('span', { cls: 'ttrpgmap-measure-rounding-of', text: 'Decimal places' });
		const decimalsInput = decimalsRow.createEl('input', {
			cls: 'ttrpgmap-measure-rounding-input',
			type: 'number',
			attr: { min: '0', max: '6', step: '1' },
			value: String(this.state?.distanceDecimals ?? 0),
		});
		decimalsInput.addEventListener('change', () => {
			if (!this.state) return;
			const val = parseInt(decimalsInput.value, 10);
			if (!isNaN(val) && val >= 0 && val <= 6) {
				this.state.distanceDecimals = val;
				saveState();
			}
		});
	}

	setMode(mode: InteractionMode): void {
		this.ctx.cancelCopy();
		if (this.mode === mode) {
			this.cancelDrawing();
			return;
		}
		if ((mode === 'measure' || mode === 'freehand') && !this.state?.distanceScale) {
			new Notice('Set a distance scale first before measuring.');
			return;
		}
		this.mode = mode;
		this.drawingPoints = [];
		this.freehandStrokes = [];
		this.clearActiveSvg();
		this.updateToolbarState();
		this.updateMeasureMode();
		this.ctx.wrapper.removeClass('ttrpgmap-cursor-grab');
		this.ctx.wrapper.removeClass('ttrpgmap-cursor-crosshair');
		this.ctx.wrapper.removeClass('ttrpgmap-cursor-copy');
		this.ctx.wrapper.addClass(this.mode === 'pan' ? 'ttrpgmap-cursor-grab' : 'ttrpgmap-cursor-crosshair');
	}

	cancelDrawing(): void {
		this.mode = 'pan';
		this.drawingPoints = [];
		this.freehandStrokes = [];
		this.isDrawingFreehand = false;
		this.currentFreehandPolyline = null;
		this.clearMeasurePreview();
		this.clearActiveSvg();
		this.updateToolbarState();
		this.updateMeasureMode();
		this.hideTotalDisplay();
		this.ctx.wrapper.removeClass('ttrpgmap-cursor-crosshair');
		this.ctx.wrapper.removeClass('ttrpgmap-cursor-copy');
		this.ctx.wrapper.addClass('ttrpgmap-cursor-grab');
		this.ctx.wrapper.removeClass('ttrpgmap-panning');
	}

	/** Get total point count across measure mode and freehand strokes */
	getMeasurePointCount(): number {
		if (this.mode === 'freehand') {
			let total = 0;
			for (const stroke of this.freehandStrokes) total += stroke.length;
			return total;
		}
		return this.drawingPoints.length;
	}

	finishMeasuring(): void {
		if (!this.state?.distanceScale) {
			this.cancelDrawing();
			return;
		}
		const total = this.calculateTotalDistance();
		if (total !== null) {
			new Notice(`Total Distance: ${this.formatDistance(total)}`);
		}
		this.cancelDrawing();
	}

	onMapClick(e: MouseEvent): void {
		if (this.mode === 'pan' || this.mode === 'freehand') return;
		const rect = this.ctx.mapContainer.getBoundingClientRect();
		const scale = this.zoom / 100;
		const point: MapPoint = { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };

		this.drawingPoints.push(point);
		this.drawSvgCircle(point, 4, 'ttrpgmap-draw-point');

		if (this.mode === 'calibrate') this.handleCalibrateClick();
		else if (this.mode === 'measure') this.handleMeasureClick();
	}

	updateMeasurePreview(e: MouseEvent): void {
		const last = this.drawingPoints[this.drawingPoints.length - 1];
		const rect = this.ctx.mapContainer.getBoundingClientRect();
		const scale = this.zoom / 100;
		const cursor: MapPoint = { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };

		if (!this.measurePreviewLine) {
			this.measurePreviewLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			this.measurePreviewLine.setAttribute(
				'class',
				'ttrpgmap-draw-line ttrpgmap-measure-line ttrpgmap-measure-preview',
			);
			this.ctx.svgOverlay.appendChild(this.measurePreviewLine);
		}
		this.measurePreviewLine.setAttribute('x1', String(last.x));
		this.measurePreviewLine.setAttribute('y1', String(last.y));
		this.measurePreviewLine.setAttribute('x2', String(cursor.x));
		this.measurePreviewLine.setAttribute('y2', String(cursor.y));

		if (!this.measurePreviewCircle) {
			this.measurePreviewCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			this.measurePreviewCircle.setAttribute('r', '4');
			this.measurePreviewCircle.setAttribute('class', 'ttrpgmap-draw-point ttrpgmap-measure-preview');
			this.ctx.svgOverlay.appendChild(this.measurePreviewCircle);
		}
		this.measurePreviewCircle.setAttribute('cx', String(cursor.x));
		this.measurePreviewCircle.setAttribute('cy', String(cursor.y));

		if (this.state?.distanceScale) {
			const segDist = pixelsToUnits(pixelDistance(last, cursor), this.state.distanceScale);
			if (segDist !== null) {
				const mid: MapPoint = { x: (last.x + cursor.x) / 2, y: (last.y + cursor.y) / 2 };
				if (!this.measurePreviewLabel) {
					this.measurePreviewLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
					this.measurePreviewLabel.setAttribute('class', 'ttrpgmap-draw-label ttrpgmap-measure-preview');
					this.ctx.svgOverlay.appendChild(this.measurePreviewLabel);
				}
				this.measurePreviewLabel.setAttribute('x', String(mid.x));
				this.measurePreviewLabel.setAttribute('y', String(mid.y - 10));
				this.measurePreviewLabel.textContent = this.formatDistance(segDist);
			}
		}
	}

	// ── Freehand ──

	startFreehand(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		if (
			target.closest('.ttrpgmap-measure-panel') ||
			target.closest('.ttrpgmap-zoom-controls') ||
			target.closest('.ttrpgmap-settings-btn') ||
			target.closest('.ttrpgmap-marker-list-panel')
		) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();
		this.isDrawingFreehand = true;

		const point = this.screenToMap(e);
		const stroke: MapPoint[] = [point];
		this.freehandStrokes.push(stroke);

		const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
		polyline.setAttribute('class', 'ttrpgmap-draw-line ttrpgmap-freehand-line');
		polyline.setAttribute('points', `${point.x},${point.y}`);
		polyline.setAttribute('fill', 'none');
		this.ctx.svgOverlay.appendChild(polyline);
		this.activeSvgElements.push(polyline);
		this.currentFreehandPolyline = polyline;

		this.drawSvgCircle(point, 4, 'ttrpgmap-draw-point');
	}

	continueFreehand(e: MouseEvent): void {
		if (!this.isDrawingFreehand || !this.currentFreehandPolyline) return;
		const currentStroke = this.freehandStrokes[this.freehandStrokes.length - 1];
		if (!currentStroke || currentStroke.length === 0) return;

		const point = this.screenToMap(e);
		const last = currentStroke[currentStroke.length - 1];
		const dx = point.x - last.x;
		const dy = point.y - last.y;
		const dist = Math.sqrt(dx * dx + dy * dy);

		if (dist < FREEHAND_MIN_DISTANCE) return;

		currentStroke.push(point);
		const pointsStr = currentStroke.map((p) => `${p.x},${p.y}`).join(' ');
		this.currentFreehandPolyline.setAttribute('points', pointsStr);
		this.updateTotalDisplay();
	}

	endFreehand(): void {
		this.isDrawingFreehand = false;

		const currentStroke = this.freehandStrokes[this.freehandStrokes.length - 1];
		if (currentStroke && currentStroke.length > 0) {
			this.drawSvgCircle(currentStroke[currentStroke.length - 1], 4, 'ttrpgmap-draw-point');

			if (this.state?.distanceScale && currentStroke.length >= 2) {
				const strokeDist = polylineUnitsDistance(currentStroke, this.state.distanceScale);
				if (strokeDist !== null) {
					const midIdx = Math.floor(currentStroke.length / 2);
					const mid = currentStroke[midIdx];
					this.drawSvgText(mid, this.formatDistance(strokeDist), 'ttrpgmap-draw-label');
				}
			}
		}

		this.currentFreehandPolyline = null;
		this.updateTotalDisplay();
	}

	get isDrawing(): boolean {
		return this.isDrawingFreehand;
	}

	get hasDrawingPoints(): boolean {
		return this.drawingPoints.length >= 1;
	}

	// ── Private helpers ──

	private screenToMap(e: MouseEvent): MapPoint {
		const rect = this.ctx.mapContainer.getBoundingClientRect();
		const scale = this.zoom / 100;
		return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
	}

	private updateMeasureMode(): void {
		const isMeasuring = this.mode !== 'pan';
		this.ctx.wrapper.toggleClass('ttrpgmap-measuring', isMeasuring);
		// Toggle measuring class on existing markers instead of full re-render
		const overlay = this.ctx.wrapper.querySelector('.ttrpgmap-marker-overlay');
		if (overlay) {
			overlay.querySelectorAll<HTMLElement>('.ttrpgmap-marker').forEach((el) => {
				el.toggleClass('ttrpgmap-marker-measuring', isMeasuring);
			});
		}
	}

	private updateToolbarState(): void {
		const buttons = this.toolbar!.querySelectorAll('.ttrpgmap-toolbar-btn');
		buttons.forEach((btn) => btn.removeClass('ttrpgmap-toolbar-btn-active'));
		if (this.mode === 'calibrate') buttons[0]?.addClass('ttrpgmap-toolbar-btn-active');
		else if (this.mode === 'measure') buttons[1]?.addClass('ttrpgmap-toolbar-btn-active');
		else if (this.mode === 'freehand') buttons[2]?.addClass('ttrpgmap-toolbar-btn-active');
	}

	private handleCalibrateClick(): void {
		if (this.drawingPoints.length !== 2) return;
		const [a, b] = this.drawingPoints;
		if (pixelDistance(a, b) === 0) {
			new Notice('Calibration line must have some length. Click two different points.');
			this.drawingPoints.pop();
			return;
		}
		this.drawSvgLine(a, b, 'ttrpgmap-draw-line ttrpgmap-calibrate-line');

		new ScaleCalibrationModal(
			this.ctx.plugin.app as import('obsidian').App,
			(units, unitLabel) => {
				if (!this.state) return;
				this.state.distanceScale = { pointA: a, pointB: b, units, unitLabel };
				this.ctx.plugin.dataManager.saveMapState(this.ctx.config.id, this.state);
				new Notice(`Scale set: ${units} ${unitLabel}`);
				this.cancelDrawing();
			},
			() => {
				this.cancelDrawing();
			},
		).open();
	}

	private handleMeasureClick(): void {
		if (this.drawingPoints.length < 2) return;
		this.clearMeasurePreview();
		const prev = this.drawingPoints[this.drawingPoints.length - 2];
		const curr = this.drawingPoints[this.drawingPoints.length - 1];
		this.drawSvgLine(prev, curr, 'ttrpgmap-draw-line ttrpgmap-measure-line');

		if (this.state?.distanceScale) {
			const segDist = pixelsToUnits(pixelDistance(prev, curr), this.state.distanceScale);
			if (segDist !== null) {
				const mid: MapPoint = { x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2 };
				this.drawSvgText(mid, this.formatDistance(segDist), 'ttrpgmap-draw-label');
			}
		}
		this.updateTotalDisplay();
	}

	private calculateTotalDistance(): number | null {
		if (!this.state?.distanceScale) return null;
		if (this.mode === 'freehand') {
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

	private roundDistance(value: number): number {
		const mode = this.state?.roundingMode ?? 'none';
		const multiple = this.state?.roundingMultiple ?? 5;
		return applyRounding(value, mode, multiple);
	}

	private formatNumber(value: number): string {
		const decimals = this.state?.distanceDecimals ?? 0;
		return value.toFixed(decimals);
	}

	formatDistance(value: number): string {
		const rounded = this.roundDistance(value);
		const label = this.state?.distanceScale?.unitLabel ?? '';
		const display = this.formatNumber(rounded);
		const isRounding = (this.state?.roundingMode ?? 'none') !== 'none' && (this.state?.roundingMultiple ?? 0) > 0;
		if (isRounding && this.state?.showRawDistance) {
			const rawDisplay = this.formatNumber(value);
			return `${display} (${rawDisplay}) ${label}`;
		}
		return `${display} ${label}`;
	}

	private updateTotalDisplay(): void {
		if (!this.totalDisplay) return;
		const total = this.calculateTotalDistance();
		if (total === null || total === 0) {
			this.totalDisplay.addClass('ttrpgmap-hidden');
			return;
		}
		this.totalDisplay.removeClass('ttrpgmap-hidden');
		this.totalDisplay.textContent = `Total Distance: ${this.formatDistance(total)}`;
	}

	private hideTotalDisplay(): void {
		if (this.totalDisplay) this.totalDisplay.addClass('ttrpgmap-hidden');
	}

	private clearMeasurePreview(): void {
		this.measurePreviewLine?.remove();
		this.measurePreviewLine = null;
		this.measurePreviewLabel?.remove();
		this.measurePreviewLabel = null;
		this.measurePreviewCircle?.remove();
		this.measurePreviewCircle = null;
	}

	private clearActiveSvg(): void {
		for (const el of this.activeSvgElements) el.remove();
		this.activeSvgElements = [];
	}

	private drawSvgLine(a: MapPoint, b: MapPoint, cls: string): SVGLineElement {
		const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
		line.setAttribute('x1', String(a.x));
		line.setAttribute('y1', String(a.y));
		line.setAttribute('x2', String(b.x));
		line.setAttribute('y2', String(b.y));
		line.setAttribute('class', cls);
		this.ctx.svgOverlay.appendChild(line);
		this.activeSvgElements.push(line);
		return line;
	}

	private drawSvgCircle(p: MapPoint, r: number, cls: string): SVGCircleElement {
		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', String(p.x));
		circle.setAttribute('cy', String(p.y));
		circle.setAttribute('r', String(r));
		circle.setAttribute('class', cls);
		this.ctx.svgOverlay.appendChild(circle);
		this.activeSvgElements.push(circle);
		return circle;
	}

	private drawSvgText(p: MapPoint, text: string, cls: string): SVGTextElement {
		const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		el.setAttribute('x', String(p.x));
		el.setAttribute('y', String(p.y - 10));
		el.setAttribute('class', cls);
		el.textContent = text;
		this.ctx.svgOverlay.appendChild(el);
		this.activeSvgElements.push(el);
		return el;
	}
}
