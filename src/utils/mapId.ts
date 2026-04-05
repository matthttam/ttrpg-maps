/** Generate a stable map ID from the image path */
export function generateMapId(imagePath: string): string {
  let hash = 0;
  for (let i = 0; i < imagePath.length; i++) {
    const char = imagePath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return "map_" + Math.abs(hash).toString(36);
}

/** Generate a unique marker ID */
export function generateMarkerId(): string {
  return `marker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
