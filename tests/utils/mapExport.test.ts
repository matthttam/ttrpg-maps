import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from 'obsidian';
import { exportMap } from '../../src/utils/mapExport';
import { MapConfig, MapState, MapExportManifest } from '../../src/types';

// Mock fflate so tests can inspect what was zipped without touching the real codec.
const mockZipSync = vi.fn();
vi.mock('fflate', () => ({
	zipSync: (data: Record<string, Uint8Array>) => mockZipSync(data),
	strToU8: (s: string) => new TextEncoder().encode(s),
	strFromU8: (u: Uint8Array) => new TextDecoder().decode(u),
}));

function createMockApp() {
	const app = new App();
	(app.vault as any).getFileByPath = vi.fn();
	(app.vault as any).readBinary = vi.fn();
	return app;
}

function createMockPlugin() {
	return {
		manifest: { version: '0.3.0' },
		dataManager: {
			flushSaves: vi.fn().mockResolvedValue(undefined),
			loadMapState: vi.fn().mockResolvedValue({
				mapId: 'map_abc123',
				markers: [],
				layers: [{ id: 'default', name: 'Default Layer', zoomMin: null, zoomMax: null }],
				distanceScale: null,
			}),
		},
	} as any;
}

const testConfig: MapConfig = {
	id: 'map_abc123',
	image: 'maps/dungeon.png',
	height: '500',
	width: '800',
	zoomMin: 50,
	zoomMax: 200,
	zoomStep: 10,
};

const testState: MapState = {
	mapId: 'map_abc123',
	markers: [],
	layers: [{ id: 'default', name: 'Default Layer', zoomMin: null, zoomMax: null }],
	distanceScale: null,
};

describe('exportMap', () => {
	let app: App;
	let plugin: ReturnType<typeof createMockPlugin>;

	beforeEach(() => {
		vi.clearAllMocks();
		app = createMockApp();
		plugin = createMockPlugin();
		// Mock URL and anchor click
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
			if (tag === 'a') {
				return { href: '', download: '', click: vi.fn() } as any;
			}
			return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
		});
	});

	it('flushes pending saves before exporting', async () => {
		(app.vault.getFileByPath as any).mockReturnValue({ path: 'maps/dungeon.png', name: 'dungeon.png' });
		(app.vault as any).readBinary.mockResolvedValue(new ArrayBuffer(8));
		mockZipSync.mockReturnValue(new Uint8Array([1, 2, 3]));

		await exportMap(app, plugin, testConfig, testState);

		expect(plugin.dataManager.flushSaves).toHaveBeenCalledOnce();
	});

	it('shows notice and returns when image not found', async () => {
		(app.vault.getFileByPath as any).mockReturnValue(null);

		await exportMap(app, plugin, testConfig, testState);

		expect(mockZipSync).not.toHaveBeenCalled();
	});

	it('adds manifest.json and image to the ZIP', async () => {
		const imageData = new ArrayBuffer(16);
		(app.vault.getFileByPath as any).mockReturnValue({ path: 'maps/dungeon.png', name: 'dungeon.png' });
		(app.vault as any).readBinary.mockResolvedValue(imageData);
		mockZipSync.mockReturnValue(new Uint8Array([1, 2, 3]));

		await exportMap(app, plugin, testConfig, testState);

		expect(mockZipSync).toHaveBeenCalledOnce();
		const archive: Record<string, Uint8Array> = mockZipSync.mock.calls[0][0];
		expect(Object.keys(archive).sort()).toEqual(['dungeon.png', 'manifest.json']);

		const manifest: MapExportManifest = JSON.parse(new TextDecoder().decode(archive['manifest.json']));
		expect(manifest.pluginVersion).toBe('0.3.0');
		expect(manifest.config).toEqual(testConfig);
		expect(manifest.state).toEqual(testState);
		expect(manifest.imageFilename).toBe('dungeon.png');

		// Image bytes match the input ArrayBuffer
		expect(archive['dungeon.png']).toBeInstanceOf(Uint8Array);
		expect(archive['dungeon.png'].byteLength).toBe(16);
	});

	it('wraps the zip bytes in a Blob and triggers download', async () => {
		const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
		(app.vault.getFileByPath as any).mockReturnValue({ path: 'maps/dungeon.png', name: 'dungeon.png' });
		(app.vault as any).readBinary.mockResolvedValue(new ArrayBuffer(8));
		mockZipSync.mockReturnValue(zipBytes);

		await exportMap(app, plugin, testConfig, testState);

		expect(URL.createObjectURL).toHaveBeenCalledOnce();
		const blobArg = (URL.createObjectURL as any).mock.calls[0][0] as Blob;
		expect(blobArg).toBeInstanceOf(Blob);
		expect(blobArg.type).toBe('application/zip');
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
	});

	it('uses map ID in the download filename', async () => {
		(app.vault.getFileByPath as any).mockReturnValue({ path: 'maps/dungeon.png', name: 'dungeon.png' });
		(app.vault as any).readBinary.mockResolvedValue(new ArrayBuffer(8));
		mockZipSync.mockReturnValue(new Uint8Array([1, 2, 3]));

		const createElementSpy = vi.spyOn(document, 'createElement');
		let anchor: any;
		createElementSpy.mockImplementation((tag: string) => {
			if (tag === 'a') {
				anchor = { href: '', download: '', click: vi.fn() };
				return anchor as any;
			}
			return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
		});

		await exportMap(app, plugin, testConfig, testState);

		expect(anchor.download).toBe('ttrpg-map-map_abc123.zip');
	});
});
