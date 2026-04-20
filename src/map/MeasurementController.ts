import { Notice, setIcon } from 'obsidian';
import { MapPoint, MapState } from '../types';
import { ScaleCalibrationModal } from '../modals/ScaleCalibrationModal';
import { pixelDistance, pixelsToUnits, polylineUnitsDistance, applyRounding } from '../distance';
import { roundingToBaseUnits, convertForDisplay, formatDisplayParts } from '../units';
import type { InteractionManager, Interaction } from './InteractionManager';

const FREEHAND_MIN_DISTANCE = 5;

/** Measurement modes mapped to interaction manager modes */
const MODE_MAP: Record<string, Interaction> = {
	calibrate: 'calibrating',
	measure: 'measuring',
	freehand: 'freehand',
};

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
	openSettings: () => void;
	interaction: InteractionManager;
}

/**
 * Manages all measurement and drawing interactions: calibration, point-to-point,
 * freehand measurement, and the SVG overlays they produce.
 */
type MeasurementMode = 'pan' | 'calibrate' | 'measure' | 'freehand';

export class MeasurementController {
	/** Derived from the interaction manager. 'pan' when not in a measurement mode. */
	get mode(): MeasurementMode {
		const cur = this.ctx.interaction.current;
		if (cur === 'calibrating') return 'calibrate';
		if (cur === 'measuring') return 'measure';
		if (cur === 'freehand' || cur === 'drawing-freehand') return 'freehand';
		return 'pan';
	}

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
	private measureBtn: HTMLElement | null = null;
	private freehandBtn: HTMLElement | null = null;
	private settingsBtn: HTMLElement | null = null;

	private ctx: MeasurementContext;

	constructor(ctx: MeasurementContext) {
		this.ctx = ctx;
	}

	private get state(): MapState | null {
		return this.ctx.getState();
	}
	private get zoom(): number {
		return this.ctx.getZoom();
	}

	/** Build the measurement toolbar (inline buttons, no drawer) */
	buildUI(): void {
		const panel = this.ctx.wrapper.createDiv({ cls: 'ttrpgmap-measure-panel' });
		this.panelEl = panel;
		this.toolbar = panel;

		// Calibrate button
		const calibrateBtn = panel.createDiv({ cls: 'ttrpgmap-toolbar-btn', attr: { 'aria-label': 'Set distance scale' } });
		setIcon(calibrateBtn, 'ruler');
		calibrateBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (!this.state?.distanceScale) {
				new Notice('Click two points on the map to set the distance scale.');
			}
			this.setMode('calibrate');
		});

		// Measure button
		this.measureBtn = panel.createDiv({ cls: 'ttrpgmap-toolbar-btn', attr: { 'aria-label': 'Measure distance' } });
		setIcon(this.measureBtn, 'route');
		this.measureBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.setMode('measure');
		});

		// Freehand button
		this.freehandBtn = panel.createDiv({ cls: 'ttrpgmap-toolbar-btn', attr: { 'aria-label': 'Freehand measure' } });
		setIcon(this.freehandBtn, 'pencil');
		this.freehandBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.setMode('freehand');
		});

		// Settings button
		this.settingsBtn = panel.createDiv({ cls: 'ttrpgmap-toolbar-btn', attr: { 'aria-label': 'Measurement settings' } });
		setIcon(this.settingsBtn, 'settings');
		this.settingsBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.ctx.openSettings();
		});

		this.updateToolbarLayout();

		// Total distance display
		this.totalDisplay = this.ctx.wrapper.createDiv({ cls: 'ttrpgmap-measure-total' });
		this.totalDisplay.addClass('ttrpgmap-hidden');
	}

	/** Show/hide toolbar buttons based on scale state */
	updateToolbarLayout(): void {
		const hasScale = !!this.state?.distanceScale;
		this.measureBtn?.toggleClass('ttrpgmap-hidden', !hasScale);
		this.freehandBtn?.toggleClass('ttrpgmap-hidden', !hasScale);
		this.settingsBtn?.toggleClass('ttrpgmap-hidden', !hasScale);
	}

	setMode(mode: MeasurementMode): void {
		if (this.mode === mode) {
			this.cancelDrawing();
			return;
		}
		if ((mode === 'measure' || mode === 'freehand') && !this.state?.distanceScale) {
			new Notice('Set a distance scale first before measuring.');
			return;
		}
		const interaction = MODE_MAP[mode];
		if (!interaction || !this.ctx.interaction.tryEnter(interaction)) return;
		this.drawingPoints = [];
		this.freehandStrokes = [];
		this.clearActiveSvg();
		this.updateToolbarState();
		this.updateToolbarLayout();
		this.updateMeasureMode();
	}

	cancelDrawing(): void {
		if (this.ctx.interaction.isMeasuring) this.ctx.interaction.reset();
		this.drawingPoints = [];
		this.freehandStrokes = [];
		this.isDrawingFreehand = false;
		this.currentFreehandPolyline = null;
		this.clearMeasurePreview();
		this.clearActiveSvg();
		this.updateToolbarState();
		this.updateToolbarLayout();
		this.updateMeasureMode();
		this.hideTotalDisplay();
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
		this.ctx.interaction.tryEnter('drawing-freehand');
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
		this.ctx.interaction.exit();

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
		const buttons = this.toolbar?.querySelectorAll('.ttrpgmap-toolbar-btn');
		buttons?.forEach((btn) => btn.removeClass('ttrpgmap-toolbar-btn-active'));
		if (this.mode === 'calibrate') buttons?.[0]?.addClass('ttrpgmap-toolbar-btn-active');
		else if (this.mode === 'measure') this.measureBtn?.addClass('ttrpgmap-toolbar-btn-active');
		else if (this.mode === 'freehand') this.freehandBtn?.addClass('ttrpgmap-toolbar-btn-active');
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
			(units, unitLabel, unitSystem, unit) => {
				if (!this.state) return;
				this.state.distanceScale = { pointA: a, pointB: b, units, unitLabel, unitSystem, unit };
				this.ctx.plugin.dataManager.saveMapState(this.ctx.config.id, this.state);
				new Notice(`Scale set: ${units} ${unitLabel}`);
				this.cancelDrawing();
				this.updateToolbarLayout();
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
		const baseUnit = this.state?.distanceScale?.unit;
		const roundingUnit = this.state?.roundingUnit;
		const effectiveMultiple =
			baseUnit && roundingUnit ? roundingToBaseUnits(multiple, roundingUnit, baseUnit) : multiple;
		return applyRounding(value, mode, effectiveMultiple);
	}

	private formatNumber(value: number): string {
		const decimals = this.state?.distanceDecimals ?? 0;
		return value.toFixed(decimals);
	}

	formatDistance(value: number): string {
		const rounded = this.roundDistance(value);
		const scale = this.state?.distanceScale;
		const baseUnit = scale?.unit;
		const system = scale?.unitSystem;
		const isRounding = (this.state?.roundingMode ?? 'none') !== 'none' && (this.state?.roundingMultiple ?? 0) > 0;

		// Custom or legacy: existing flat-number behavior
		if (!system || system === 'custom' || !baseUnit) {
			const label = scale?.unitLabel ?? '';
			const display = this.formatNumber(rounded);
			if (isRounding && this.state?.showRawDistance) {
				const rawDisplay = this.formatNumber(value);
				return `${display} (${rawDisplay}) ${label}`;
			}
			return `${display} ${label}`;
		}

		// Imperial / metric: use unit conversion system
		const mode = this.state?.conversionMode ?? 'auto';
		const fixedUnit = this.state?.displayUnit;
		const excluded = this.state?.excludedUnits;
		const decimals = this.state?.distanceDecimals ?? 0;
		const parts = convertForDisplay(rounded, baseUnit, mode, fixedUnit, excluded);
		const formatted = formatDisplayParts(parts, decimals);

		if (isRounding && this.state?.showRawDistance) {
			const rawParts = convertForDisplay(value, baseUnit, mode, fixedUnit, excluded);
			const rawFormatted = formatDisplayParts(rawParts, decimals);
			return `${formatted} (${rawFormatted})`;
		}
		return formatted;
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
