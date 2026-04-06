import { App, Notice } from "obsidian";
import * as JSZipModule from "jszip";
const JSZip = (JSZipModule as { default?: typeof JSZipModule }).default ?? JSZipModule;
import type TTRPGMapsPlugin from "../main";
import { MapExportManifest } from "../types";
import { generateMapId } from "./mapId";
import { serializeMapConfig, writeConfigToCodeBlock } from "./configSerializer";
import { FolderPickerModal } from "../modals/FolderPickerModal";

/** Import a map from an exported ZIP file */
export function importMap(
  app: App,
  plugin: TTRPGMapsPlugin,
  sourcePath: string,
  sectionInfo: { lineStart: number; lineEnd: number },
): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".zip";
  input.addEventListener("change", () => { void (async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      // Parse manifest
      const manifestFile = zip.file("manifest.json");
      if (!manifestFile) {
        new Notice("Invalid map export: missing manifest.json.");
        return;
      }
      const raw = JSON.parse(await manifestFile.async("text"));
      if (!validateManifest(raw)) {
        new Notice("Invalid map export: manifest is incomplete.");
        return;
      }
      const manifest = raw;

      // Extract image
      const imageEntry = zip.file(manifest.imageFilename);
      if (!imageEntry) {
        new Notice("Invalid map export: image file missing from archive.");
        return;
      }
      const imageData = await imageEntry.async("arraybuffer");

      // Prompt user for destination folder
      new FolderPickerModal(app, async (folderPath) => {
        try {
          // Normalize folder path
          const folder = folderPath === "/" ? "" : folderPath.replace(/\/+$/, "");

          // Resolve unique image path
          const imagePath = await resolveUniquePath(app, folder, manifest.imageFilename);

          // Ensure folder exists
          if (folder && !(await app.vault.adapter.exists(folder))) {
            await app.vault.createFolder(folder);
          }

          // Write image to vault
          await app.vault.createBinary(imagePath, imageData);

          // Generate new map ID from the new image path
          const newMapId = generateMapId(imagePath);

          // Update config with new image path and ID
          const config = { ...manifest.config, image: imagePath, id: newMapId };

          // Update state with new map ID
          const state = { ...manifest.state, mapId: newMapId };

          // Write code block
          const configLines = serializeMapConfig(config);
          await writeConfigToCodeBlock(app, sourcePath, sectionInfo, configLines);

          // Save sidecar state
          plugin.dataManager.saveMapState(newMapId, state);
          await plugin.dataManager.flushSaves();

          new Notice("Map imported successfully.");
        } catch (e) {
          console.error("[ttrpg-maps] Import failed:", e);
          new Notice("Map import failed. Check the console for details.");
        }
      }).open();
    } catch (e) {
      console.error("[ttrpg-maps] Failed to read export file:", e);
      new Notice("Failed to read the export file.");
    }
  })(); });
  input.click();
}

/** Validate that a parsed manifest has the required fields */
export function validateManifest(data: unknown): data is MapExportManifest {
  if (data == null || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return (
    obj.config != null &&
    obj.state != null &&
    typeof obj.imageFilename === "string" &&
    obj.imageFilename.length > 0
  );
}

/** Find a unique file path, appending (2), (3), etc. if needed */
export async function resolveUniquePath(app: App, folder: string, filename: string): Promise<string> {
  const dotIdx = filename.lastIndexOf(".");
  const baseName = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
  const ext = dotIdx > 0 ? filename.slice(dotIdx) : "";

  let candidate = folder ? `${folder}/${filename}` : filename;
  let n = 2;
  while (await app.vault.adapter.exists(candidate)) {
    const suffixed = `${baseName} (${n})${ext}`;
    candidate = folder ? `${folder}/${suffixed}` : suffixed;
    n++;
  }
  return candidate;
}
