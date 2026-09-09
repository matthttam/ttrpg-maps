import { App, Modal, Setting, Notice } from 'obsidian';
import type TTRPGMapsPlugin from '../main';
import { MarkerTemplate, PREDEFINED_TEMPLATE_IDS } from '../types';
import { createPinElement } from '../utils/markerPin';
import { buildMarkerLabel } from '../utils/markerLabel';
import { buildTextPlacementField, buildPinSelectorField, buildIconField } from './sharedFields';

/** Fields on a template that can be pushed to markers */
const APPLY_FIELDS: (keyof MarkerTemplate)[] = [
	'direction',
	'textPlacement',
	'color',
	'transparency',
	'icon',
	'iconColor',
	'iconRotation',
	'useBaseMarker',
	'shape',
];

/** Human-readable labels for each field */
const FIELD_LABELS: Record<string, string> = {
	direction: 'Pin direction',
	textPlacement: 'Text placement',
	color: 'Pin color',
	transparency: 'Pin transparency',
	icon: 'Icon',
	iconColor: 'Icon color',
	iconRotation: 'Icon rotation',
	useBaseMarker: 'Use pin shape',
	shape: 'Pin shape',
};

/** Get the fields that changed between snapshot and current template */
function getChangedFields(
	snapshot: Partial<Record<keyof MarkerTemplate, unknown>>,
	current: MarkerTemplate,
): (keyof MarkerTemplate)[] {
	return APPLY_FIELDS.filter((key) => {
		const oldVal = snapshot[key];
		const newVal = current[key];
		return oldVal !== newVal;
	});
}

export class TemplateEditModal extends Modal {
	private plugin: TTRPGMapsPlugin;
	private original: MarkerTemplate;
	private draft: MarkerTemplate;
	private snapshot: Partial<Record<keyof MarkerTemplate, unknown>>;
	private onSaved: () => void;
	private isNew: boolean;
	private changedIndicators: Map<string, HTMLElement> = new Map();

	constructor(app: App, plugin: TTRPGMapsPlugin, template: MarkerTemplate, onSaved: () => void, isNew = false) {
		super(app);
		this.plugin = plugin;
		this.original = template;
		// `transparency` is optional, so templates saved before it existed read as
		// undefined. Normalize once here: otherwise the slider writes a numeric 0
		// and the dirty check below sees `undefined !== 0` as a change forever.
		this.draft = { ...template, transparency: template.transparency ?? 0 };
		this.onSaved = onSaved;
		this.isNew = isNew;
		// Snapshot original values for dirty tracking (from the normalized draft)
		this.snapshot = {};
		for (const key of APPLY_FIELDS) {
			this.snapshot[key] = this.draft[key];
		}
	}

	/** Return an error message if the name is invalid, or null if valid */
	private validateName(name: string): string | null {
		const trimmed = name.trim();
		if (!trimmed) return 'Name cannot be empty.';
		const duplicate = this.plugin.settings.markerTemplates.find(
			(t) => t.id !== this.draft.id && t.name.trim().toLowerCase() === trimmed.toLowerCase(),
		);
		if (duplicate) return 'A template with this name already exists.';
		return null;
	}

	private renderPreview(container: HTMLElement): void {
		container.empty();
		const wrapper = container.createDiv({ cls: 'ttrpgmap-edit-preview-wrapper' });
		wrapper.dataset.direction = this.draft.direction;
		wrapper.dataset.textPlacement = this.draft.textPlacement;

		createPinElement(wrapper, {
			pinClass: 'ttrpgmap-edit-preview-pin',
			svgClass: 'ttrpgmap-pin-svg',
			color: this.draft.color,
			transparency: this.draft.transparency ?? 0,
			icon: this.draft.icon,
			iconColor: this.draft.iconColor,
			iconRotation: this.draft.iconRotation,
			iconClass: 'ttrpgmap-edit-preview-icon',
			useBaseMarker: this.draft.useBaseMarker,
			shape: this.draft.shape,
		});

		buildMarkerLabel(wrapper, 'Example Note', null, 'Example Description', 'ttrpgmap-edit-preview-label');
	}

	/** Update dirty indicators on all tracked fields */
	private updateDirtyIndicators(): void {
		const changed = getChangedFields(this.snapshot, this.draft);
		// Group fields by their shared indicator element
		const elements = new Map<HTMLElement, string[]>();
		for (const [key, el] of this.changedIndicators) {
			let keys = elements.get(el);
			if (!keys) {
				keys = [];
				elements.set(el, keys);
			}
			keys.push(key);
		}
		// Show indicator if any of its fields changed
		for (const [el, keys] of elements) {
			const dirty = keys.some((k) => changed.includes(k as keyof MarkerTemplate));
			if (dirty) {
				el.removeClass('ttrpgmap-hidden');
			} else {
				el.addClass('ttrpgmap-hidden');
			}
		}
	}

	/** Add a red dot indicator to a setting and track it */
	private addDirtyIndicator(setting: Setting, ...fields: string[]): void {
		const dot = setting.nameEl.createSpan({ cls: 'ttrpgmap-dirty-indicator', text: ' *' });
		dot.addClass('ttrpgmap-hidden');
		for (const f of fields) {
			this.changedIndicators.set(f, dot);
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('ttrpgmap-modal--x-wide');
		this.changedIndicators.clear();

		const headerGroup = contentEl.createDiv({ cls: 'setting-group' });
		this.titleEl.setText(this.isNew ? 'Create template' : 'Edit template');

		const layout = headerGroup.createDiv({ cls: 'ttrpgmap-modal-layout' });
		const mainCol = layout.createDiv({ cls: 'ttrpgmap-modal-main' });
		const previewContainer = layout.createDiv({ cls: 'ttrpgmap-edit-preview' });
		this.renderPreview(previewContainer);

		const items = mainCol.createDiv({ cls: 'setting-items' });

		const onChanged = () => {
			this.renderPreview(previewContainer);
			this.updateDirtyIndicators();
		};

		const ctx = {
			app: this.app,
			contentEl: items,
			state: this.draft,
			onChanged,
		};

		// ── Name ──
		const isPredefined = PREDEFINED_TEMPLATE_IDS.has(this.draft.id);
		let nameError: HTMLElement;
		new Setting(items)
			.setName('Name')
			.addText((text) => {
				text.setValue(this.draft.name);
				if (isPredefined) {
					text.setDisabled(true);
				} else {
					text.onChange((value) => {
						this.draft.name = value;
						const err = this.validateName(value);
						nameError.setText(err ?? '');
						if (err) {
							nameError.removeClass('ttrpgmap-hidden');
						} else {
							nameError.addClass('ttrpgmap-hidden');
						}
					});
					if (this.isNew) {
						activeWindow.setTimeout(() => {
							text.inputEl.focus();
							text.inputEl.select();
						}, 0);
					}
				}
			})
			.then((s) => {
				nameError = s.controlEl.createDiv({ cls: 'ttrpgmap-field-error' });
				nameError.addClass('ttrpgmap-hidden');
			});

		// ── Shared fields ──
		const tpSetting = buildTextPlacementField(ctx);
		this.addDirtyIndicator(tpSetting, 'textPlacement');

		const pinSetting = buildPinSelectorField(ctx);
		this.addDirtyIndicator(pinSetting, 'direction', 'color', 'transparency', 'useBaseMarker', 'shape');

		const { setting: iconSetting } = buildIconField(ctx);
		this.addDirtyIndicator(iconSetting, 'icon', 'iconColor', 'iconRotation');

		// ── Actions ──
		const footer = mainCol.createDiv({ cls: 'modal-button-container ttrpgmap-action-row' });
		if (!this.isNew) {
			const updateBtn = footer.createEl('button', { cls: 'mod-warning ttrpgmap-btn-warning', text: 'Save & update markers' });
			updateBtn.addEventListener('click', () => this.saveAndUpdateMarkers());
		}
		const cancelBtn = footer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
		const saveBtn = footer.createEl('button', { cls: 'mod-cta', text: 'Save' });
		saveBtn.addEventListener('click', () => this.saveTemplate());
	}

	/** Save the template without updating existing markers */
	private saveTemplate(): void {
		const nameErr = this.validateName(this.draft.name);
		if (nameErr) {
			new Notice(nameErr);
			return;
		}
		Object.assign(this.original, this.draft);
		void this.plugin.dataManager.saveSettings(this.plugin.settings);
		this.onSaved();
		this.close();
	}

	/** Validate, confirm, then push changed fields to all markers using this template */
	private saveAndUpdateMarkers(): void {
		const nameErr = this.validateName(this.draft.name);
		if (nameErr) {
			new Notice(nameErr);
			return;
		}
		const changed = getChangedFields(this.snapshot, this.draft);
		// With no pending edits this still re-syncs markers to the template: you
		// may have saved a change earlier and only now decided to push it out, so
		// fall back to every templated field rather than refusing to do anything.
		const fields = changed.length > 0 ? changed : [...APPLY_FIELDS];
		new ConfirmApplyModal(
			this.app,
			this.draft.name,
			fields.map((f) => FIELD_LABELS[f] || f),
			() => this.applyToMarkers(fields),
		).open();
	}

	/** Push the given fields from the draft to all markers across all maps */
	private applyToMarkers(changed: (keyof MarkerTemplate)[]): void {
		Object.assign(this.original, this.draft);
		void this.plugin.dataManager.saveSettings(this.plugin.settings);

		void (async () => {
			const allStates = await this.plugin.dataManager.loadAllMapStates();
			let count = 0;
			for (const state of allStates) {
				let stateChanged = false;
				for (const marker of state.markers) {
					if (marker.templateId !== this.draft.id) continue;
					// Hot zones carry their own geometry and no template. Applying a
					// template here would overwrite their color/transparency and, worse,
					// rewrite `shape` and turn the polygon into a pin.
					if (marker.shape === 'area') continue;
					for (const field of changed) {
						(marker as unknown as Record<string, unknown>)[field] = this.draft[field];
					}
					stateChanged = true;
					count++;
				}
				if (stateChanged) {
					this.plugin.dataManager.saveMapState(state.mapId, state);
				}
			}

			await this.plugin.dataManager.flushSaves();
			new Notice(`Updated ${count} marker${count !== 1 ? 's' : ''} using "${this.draft.name}".`);
			this.plugin.triggerMapRefresh();
			this.onSaved();
			this.close();
		})();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class ConfirmApplyModal extends Modal {
	private templateName: string;
	private fieldLabels: string[];
	private onConfirm: () => void;

	constructor(app: App, templateName: string, fieldLabels: string[], onConfirm: () => void) {
		super(app);
		this.templateName = templateName;
		this.fieldLabels = fieldLabels;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		const group = contentEl.createDiv({ cls: 'setting-group' });
		new Setting(group).setName('Confirm apply').setHeading();
		const items = group.createDiv({ cls: 'setting-items' });

		items.createEl('p', {
			text: `The following changes will be applied to all markers using the "${this.templateName}" template:`,
		});

		const list = items.createEl('ul', { cls: 'ttrpgmap-confirm-list' });
		for (const label of this.fieldLabels) {
			list.createEl('li', { text: label });
		}

		items.createEl('p', {
			text: 'This will override custom values on those fields. Are you sure?',
			cls: 'ttrpgmap-muted',
		});

		const applyFooter = contentEl.createDiv({ cls: 'modal-button-container' });
		const applyCancelBtn = applyFooter.createEl('button', { text: 'Cancel' });
		applyCancelBtn.addEventListener('click', () => this.close());
		const applyBtn = applyFooter.createEl('button', { cls: 'mod-warning ttrpgmap-btn-warning', text: 'Yes, apply' });
		applyBtn.addEventListener('click', () => {
			void this.onConfirm();
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
