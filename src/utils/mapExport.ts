import { App, Notice } from "obsidian";
import * as JSZipModule from "jszip";
const JSZip = (JSZipModule as { default?: typeof JSZipModule }).default ?? JSZipModule;
import type TTRPGMapsPlugin from "../main";
import { MapConfig, MapState, MapExportManifest } from "../types";

/** Export a map (config + state + image) as a downloadable ZIP file */
export async function exportMap(
  app: App,
  plugin: TTRPGMapsPlugin,
  config: MapConfig,
  state: MapState,
): Promise<void> {
  // Flush any pending sidecar writes so state is current
  await plugin.dataManager.flushSaves();

  // Resolve and read the image file
  const imageFile = app.vault.getFileByPath(config.image);
  if (!imageFile) {
    new Notice("Export failed: image not found in vault.");
    return;
  }
  const imageData = await app.vault.readBinary(imageFile);
  const imageFilename = imageFile.name;

  // Build manifest
  const manifest: MapExportManifest = {
    pluginVersion: plugin.manifest.version,
    config,
    state,
    imageFilename,
  };

  // Create ZIP
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file(imageFilename, imageData);

  const blob = await zip.generateAsync({ type: "blob" });

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ttrpg-map-${config.id}.zip`;
  a.click();
  URL.revokeObjectURL(url);

  new Notice("Map exported successfully.");
}
