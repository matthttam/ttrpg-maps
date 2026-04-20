import { App, Modal } from 'obsidian';

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
		let settled = false;
		const finish = (result: boolean) => {
			if (settled) return;
			settled = true;
			resolve(result);
			modal.close();
		};
		modal.titleEl.setText(title);
		modal.contentEl.createEl('p', { text: message });
		const footer = modal.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancelBtn = footer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => finish(false));
		const actionBtn = footer.createEl('button', { cls: warning ? 'mod-warning' : 'mod-cta', text: actionText });
		actionBtn.addEventListener('click', () => finish(true));
		const origOnClose = modal.onClose.bind(modal);
		modal.onClose = () => {
			if (!settled) {
				settled = true;
				resolve(false);
			}
			origOnClose();
		};
		modal.open();
	});
}
