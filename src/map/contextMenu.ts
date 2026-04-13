import { Menu } from 'obsidian';
import { MarkerTemplate, TemplateFolder, MarkerLayer, DEFAULT_LAYER_ID } from '../types';

interface ContextMenuOpts {
	templates: MarkerTemplate[];
	folders: TemplateFolder[];
	layers: MarkerLayer[];
	onPlace: (templateId: string, layerId: string | null) => void;
}

/**
 * Populate a Menu with "Place marker" items organized by template and folder.
 * When multiple layers exist, each template expands into a layer submenu.
 */
export function buildPlaceMarkerMenu(menu: Menu, opts: ContextMenuOpts): void {
	const { templates, folders, layers, onPlace } = opts;
	const hasMultipleLayers = layers.length > 1;
	const defaultTemplate = templates.find((t) => t.id === 'default') ?? templates[0];

	const addTemplateItem = (target: Menu, template: MarkerTemplate) => {
		target.addItem((item) => {
			item.setTitle(template.name);
			item.setIcon(template.shape === 'hotspot' ? 'circle-dashed' : 'map-pin');
			if (hasMultipleLayers) {
				const sub = item.setSubmenu();
				for (const layer of layers) {
					sub.addItem((subItem) => {
						subItem.setTitle(layer.name);
						subItem.onClick(() => onPlace(template.id, layer.id === DEFAULT_LAYER_ID ? null : layer.id));
					});
				}
			} else {
				item.onClick(() => onPlace(template.id, null));
			}
		});
	};

	if (defaultTemplate) {
		menu.addItem((item) => {
			item.setTitle('Place marker');
			item.setIcon('map-pin');
			if (hasMultipleLayers) {
				const sub = item.setSubmenu();
				for (const layer of layers) {
					sub.addItem((subItem) => {
						subItem.setTitle(layer.name);
						subItem.onClick(() => onPlace(defaultTemplate.id, layer.id === DEFAULT_LAYER_ID ? null : layer.id));
					});
				}
			} else {
				item.onClick(() => onPlace(defaultTemplate.id, null));
			}
		});
	}

	if (templates.length > 1) {
		menu.addSeparator();

		const sortByName = <T extends { name: string }>(items: T[]): T[] =>
			[...items].sort((a, b) => a.name.localeCompare(b.name));

		const topLevel = sortByName(templates.filter((t) => !t.folderId));
		for (const template of topLevel) {
			addTemplateItem(menu, template);
		}

		for (const folder of sortByName(folders)) {
			const folderTemplates = sortByName(templates.filter((t) => t.folderId === folder.id));
			if (folderTemplates.length === 0) continue;
			menu.addItem((item) => {
				item.setTitle(folder.name);
				item.setIcon('folder');
				const sub = item.setSubmenu();
				for (const template of folderTemplates) {
					addTemplateItem(sub, template);
				}
			});
		}
	}
}
