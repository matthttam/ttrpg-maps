import { App, Modal, Setting, Notice } from 'obsidian';
import type { UnitSystem, MeasurementUnit } from '../units';
import { getUnitsForSystem } from '../units';

export class ScaleCalibrationModal extends Modal {
	private units = 0;
	private unitLabel = 'units';
	private unitSystem: UnitSystem = 'custom';
	private unit: MeasurementUnit | undefined;
	private onSave: (units: number, unitLabel: string, unitSystem: UnitSystem, unit?: MeasurementUnit) => void;
	private onCancel: () => void;
	private saved = false;

	constructor(
		app: App,
		onSave: (units: number, unitLabel: string, unitSystem: UnitSystem, unit?: MeasurementUnit) => void,
		onCancel: () => void,
	) {
		super(app);
		this.onSave = onSave;
		this.onCancel = onCancel;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText('Set distance scale');

		const group = contentEl.createDiv({ cls: 'setting-group' });
		const items = group.createDiv({ cls: 'setting-items' });

		items.createEl('p', { text: 'You drew a reference line on the map. How many units does it represent?' });

		// Distance
		new Setting(items)
			.setName('Distance')
			.setDesc('How many units does this line represent?')
			.addText((text) => text.setPlaceholder('100').onChange((value) => (this.units = parseFloat(value) || 0)));

		// Measurement system
		new Setting(items).setName('Measurement system').addDropdown((dropdown) => {
			dropdown
				.addOption('imperial', 'Imperial')
				.addOption('metric', 'Metric')
				.addOption('custom', 'Custom')
				.setValue(this.unitSystem)
				.onChange((value) => {
					this.unitSystem = value as UnitSystem;
					this.rebuildUnitRow(unitRow, customLabelRow);
				});
		});

		// Unit row (dropdown for imperial/metric, free text for custom)
		const unitRow = new Setting(items);
		const customLabelRow = new Setting(items);
		unitRow.setName('Unit');
		this.rebuildUnitRow(unitRow, customLabelRow);

		// Buttons
		const footer = contentEl.createDiv({ cls: 'modal-button-container' });
		const cancelBtn = footer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => {
			this.saved = false;
			this.close();
		});
		const saveBtn = footer.createEl('button', { cls: 'mod-cta', text: 'Save scale' });
		saveBtn.addEventListener('click', () => {
			if (this.units <= 0) {
				new Notice('Please enter a positive distance.');
				return;
			}
			this.saved = true;
			this.onSave(this.units, this.unitLabel, this.unitSystem, this.unit);
			this.close();
		});
	}

	private rebuildUnitRow(unitRow: Setting, customLabelRow: Setting): void {
		unitRow.controlEl.empty();
		customLabelRow.controlEl.empty();
		customLabelRow.nameEl.empty();

		const systemUnits = getUnitsForSystem(this.unitSystem);

		if (systemUnits.length > 0) {
			// Imperial or metric: show unit dropdown
			customLabelRow.settingEl.addClass('ttrpgmap-hidden');
			unitRow.settingEl.removeClass('ttrpgmap-hidden');
			const defaultUnit = systemUnits[1]?.id ?? systemUnits[0].id; // default to ft / cm
			this.unit = this.unit && systemUnits.some((u) => u.id === this.unit) ? this.unit : defaultUnit;
			this.unitLabel = systemUnits.find((u) => u.id === this.unit)?.label ?? 'units';

			unitRow.addDropdown((dropdown) => {
				for (const u of systemUnits) {
					dropdown.addOption(u.id, u.label.charAt(0).toUpperCase() + u.label.slice(1));
				}
				dropdown.setValue(this.unit!).onChange((value) => {
					this.unit = value as MeasurementUnit;
					this.unitLabel = systemUnits.find((u) => u.id === value)?.label ?? 'units';
				});
			});
		} else {
			// Custom: show free-text label input
			unitRow.settingEl.addClass('ttrpgmap-hidden');
			customLabelRow.settingEl.removeClass('ttrpgmap-hidden');
			customLabelRow.setName('Unit label');
			this.unit = undefined;

			customLabelRow.addText((text) =>
				text
					.setPlaceholder('Units')
					.setValue(this.unitLabel === 'units' ? '' : this.unitLabel)
					.onChange((value) => (this.unitLabel = value || 'units')),
			);
		}
	}

	onClose(): void {
		if (!this.saved) {
			this.onCancel();
		}
		this.contentEl.empty();
	}
}
