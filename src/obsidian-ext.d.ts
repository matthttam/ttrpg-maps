import 'obsidian';

declare module 'obsidian' {
	interface MenuItem {
		setSubmenu(): Menu;
	}

	interface App {
		setting: {
			open(): void;
			openTabById(id: string): void;
		};
	}
}
