/** All mutually exclusive interaction modes */
export type Interaction =
	| 'idle'
	| 'panning'
	| 'dragging-marker'
	| 'calibrating'
	| 'measuring'
	| 'freehand'
	| 'drawing-freehand'
	| 'resizing-marker'
	| 'dragging-handle'
	| 'edge-resize'
	| 'copying';

/** Valid transitions: map of "from" -> set of allowed "to" modes */
const TRANSITIONS: Record<Interaction, Set<Interaction>> = {
	idle: new Set<Interaction>([
		'panning',
		'dragging-marker',
		'calibrating',
		'measuring',
		'freehand',
		'resizing-marker',
		'edge-resize',
		'copying',
	]),
	panning: new Set<Interaction>(['idle']),
	'dragging-marker': new Set<Interaction>(['idle', 'panning']),
	calibrating: new Set<Interaction>(['idle']),
	measuring: new Set<Interaction>(['idle']),
	freehand: new Set<Interaction>(['idle', 'drawing-freehand']),
	'drawing-freehand': new Set<Interaction>(['freehand']),
	'resizing-marker': new Set<Interaction>(['idle', 'dragging-handle']),
	'dragging-handle': new Set<Interaction>(['resizing-marker']),
	'edge-resize': new Set<Interaction>(['idle']),
	copying: new Set<Interaction>(['idle']),
};

const MEASURING_MODES = new Set<Interaction>(['calibrating', 'measuring', 'freehand', 'drawing-freehand']);

/**
 * Mediates interaction modes so only one can be active at a time.
 * Features call tryEnter() to request a mode and exit() to leave it.
 */
export class InteractionManager {
	private _current: Interaction = 'idle';
	private onTransition: () => void;

	constructor(onTransition: () => void) {
		this.onTransition = onTransition;
	}

	get current(): Interaction {
		return this._current;
	}

	get isIdle(): boolean {
		return this._current === 'idle';
	}

	/** True when in any measurement/calibration mode */
	get isMeasuring(): boolean {
		return MEASURING_MODES.has(this._current);
	}

	/** True when actively drawing a freehand stroke */
	get isDrawing(): boolean {
		return this._current === 'drawing-freehand';
	}

	/**
	 * Attempt to transition to a new mode.
	 * Returns true if the transition was allowed, false if blocked.
	 */
	tryEnter(mode: Interaction): boolean {
		if (mode === this._current) return true;
		const allowed = TRANSITIONS[this._current];
		if (!allowed.has(mode)) return false;
		this._current = mode;
		this.onTransition();
		return true;
	}

	/**
	 * Exit the current mode. Sub-states return to their parent
	 * (drawing-freehand -> freehand, dragging-handle -> resizing-marker).
	 * All others return to idle.
	 */
	exit(): void {
		if (this._current === 'drawing-freehand') {
			this._current = 'freehand';
		} else if (this._current === 'dragging-handle') {
			this._current = 'resizing-marker';
		} else {
			this._current = 'idle';
		}
		this.onTransition();
	}

	/** Force reset to idle regardless of current state */
	reset(): void {
		this._current = 'idle';
		this.onTransition();
	}
}
