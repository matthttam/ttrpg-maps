import { App } from 'obsidian';

/**
 * Helpers for jumping from a modal into the plugin's own settings tab and
 * pulse-highlighting the thing the user asked for, matching the scroll-and-flash
 * behavior the map settings modal uses.
 */

/** The settings modal, or the document as a fallback. */
function settingsRoot(): HTMLElement {
	return activeDocument.querySelector<HTMLElement>('.modal.mod-settings') ?? activeDocument.body;
}

/** Scroll an element into view and flash it. */
function pulseHighlight(el: HTMLElement): void {
	el.scrollIntoView({ behavior: 'smooth', block: 'center' });
	el.addClass('ttrpgmap-setting-highlight');
	el.addEventListener(
		'animationend',
		() => {
			el.removeClass('ttrpgmap-setting-highlight');
		},
		{ once: true },
	);
}

function openPluginTab(app: App, pluginId: string): void {
	app.setting.open();
	app.setting.openTabById(pluginId);
}

/** Open the plugin's settings tab and highlight a section heading by name. */
export function openPluginSettingsSection(app: App, pluginId: string, sectionName: string): void {
	openPluginTab(app, pluginId);

	// The tab renders synchronously, but give Obsidian a frame to lay it out
	// before measuring for the scroll.
	activeWindow.setTimeout(() => {
		for (const nameEl of Array.from(settingsRoot().querySelectorAll<HTMLElement>('.setting-item-name'))) {
			if (nameEl.textContent === sectionName) {
				const target = nameEl.closest<HTMLElement>('.setting-item');
				if (target) pulseHighlight(target);
				return;
			}
		}
	}, 50);
}

/**
 * Open the plugin's settings tab and highlight one specific marker template row,
 * expanding its folder first if that folder is collapsed.
 */
export function openTemplateInSettings(app: App, pluginId: string, templateId: string): void {
	openPluginTab(app, pluginId);

	activeWindow.setTimeout(() => {
		const rows = Array.from(settingsRoot().querySelectorAll<HTMLElement>('.ttrpgmap-template-row'));
		// Compare via dataset rather than an attribute selector so template IDs
		// never need CSS escaping.
		const row = rows.find((el) => el.dataset.templateId === templateId);
		if (!row) return;

		// If the template sits in a collapsed folder, expand it by clicking the
		// folder header so the template manager's own collapse state stays in sync.
		const contents = row.closest<HTMLElement>('.ttrpgmap-folder-contents');
		if (contents?.hasClass('ttrpgmap-hidden')) {
			contents.parentElement?.querySelector<HTMLElement>('.ttrpgmap-folder-name-row')?.click();
		}

		pulseHighlight(row);
	}, 50);
}
