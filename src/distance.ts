import { MapPoint, DistanceScale, RoundingMode } from "./types";

/** Euclidean distance between two points in pixels */
export function pixelDistance(a: MapPoint, b: MapPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the units-per-pixel ratio from a calibrated distance scale.
 * Returns null if the scale points are identical (zero pixel distance).
 */
export function unitsPerPixel(scale: DistanceScale): number | null {
  const px = pixelDistance(scale.pointA, scale.pointB);
  if (px === 0) return null;
  return scale.units / px;
}

/**
 * Convert a pixel distance to map units using a calibrated scale.
 * Returns null if the scale is not calibrated.
 */
export function pixelsToUnits(px: number, scale: DistanceScale): number | null {
  const ratio = unitsPerPixel(scale);
  if (ratio === null) return null;
  return px * ratio;
}

/**
 * Calculate the total distance of a multiline path (array of points) in pixels.
 */
export function polylinePixelDistance(points: MapPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += pixelDistance(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Calculate the total distance of a multiline path in map units.
 * Returns null if the scale is not calibrated.
 */
export function polylineUnitsDistance(points: MapPoint[], scale: DistanceScale): number | null {
  const px = polylinePixelDistance(points);
  return pixelsToUnits(px, scale);
}

/**
 * Calculate per-segment distances for a multiline path in map units.
 * Returns an array of distances, one per segment (length = points.length - 1).
 * Returns null if the scale is not calibrated.
 */
export function segmentDistances(points: MapPoint[], scale: DistanceScale): number[] | null {
  if (points.length < 2) return [];
  const ratio = unitsPerPixel(scale);
  if (ratio === null) return null;

  const distances: number[] = [];
  for (let i = 1; i < points.length; i++) {
    distances.push(pixelDistance(points[i - 1], points[i]) * ratio);
  }
  return distances;
}

/**
 * Round a distance value to a multiple according to the rounding mode.
 * Returns the original value if mode is "none" or multiple is <= 0.
 */
export function applyRounding(value: number, mode: RoundingMode, multiple: number): number {
  if (mode === "none" || multiple <= 0) return value;
  if (mode === "up") return Math.ceil(value / multiple) * multiple;
  if (mode === "down") return Math.floor(value / multiple) * multiple;
  if (mode === "closest") return Math.round(value / multiple) * multiple;
  return value;
}
