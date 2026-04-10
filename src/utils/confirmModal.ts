import { App, Modal, Setting } from 'obsidian';

/**
 * Show a confirmation modal and return a promise that resolves to true (confirmed) or false (cancelled).
 */
export function confirmAction(
	app: App,
	title: string,
	message: string,
	actionText: string,
	warning = true,
): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const modal = new Modal(app);
		modal.titleEl.setText(title);
		modal.contentEl.createEl('p', { text: message });
		new Setting(modal.contentEl)
			.addButton((btn) =>
				btn.setButtonText('Cancel').onClick(() => {
					resolve(false);
					modal.close();
				}),
			)
			.addButton((btn) => {
				btn.setButtonText(actionText).onClick(() => {
					resolve(true);
					modal.close();
				});
				if (warning) btn.setWarning();
			});
		modal.open();
	});
}
