import { describe, it, expect } from "vitest";
import {
  pixelDistance,
  unitsPerPixel,
  pixelsToUnits,
  polylinePixelDistance,
  polylineUnitsDistance,
  segmentDistances,
} from "./distance";
import { DistanceScale, MapPoint } from "./types";

describe("pixelDistance", () => {
  it("returns 0 for identical points", () => {
    expect(pixelDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it("calculates horizontal distance", () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(100);
  });

  it("calculates vertical distance", () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 0, y: 50 })).toBe(50);
  });

  it("calculates diagonal distance (3-4-5 triangle)", () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("is order-independent", () => {
    const a: MapPoint = { x: 10, y: 20 };
    const b: MapPoint = { x: 40, y: 60 };
    expect(pixelDistance(a, b)).toBe(pixelDistance(b, a));
  });

  it("handles negative coordinates", () => {
    expect(pixelDistance({ x: -3, y: -4 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe("unitsPerPixel", () => {
  it("returns correct ratio", () => {
    const scale: DistanceScale = {
      pointA: { x: 0, y: 0 },
      pointB: { x: 100, y: 0 },
      units: 50,
      unitLabel: "feet",
    };
    expect(unitsPerPixel(scale)).toBe(0.5);
  });

  it("returns null for zero pixel distance", () => {
    const scale: DistanceScale = {
      pointA: { x: 5, y: 5 },
      pointB: { x: 5, y: 5 },
      units: 100,
      unitLabel: "feet",
    };
    expect(unitsPerPixel(scale)).toBeNull();
  });

  it("handles diagonal calibration line", () => {
    const scale: DistanceScale = {
      pointA: { x: 0, y: 0 },
      pointB: { x: 3, y: 4 },
      units: 10,
      unitLabel: "miles",
    };
    // 5 pixels = 10 miles, so 2 miles per pixel
    expect(unitsPerPixel(scale)).toBe(2);
  });
});

describe("pixelsToUnits", () => {
  const scale: DistanceScale = {
    pointA: { x: 0, y: 0 },
    pointB: { x: 200, y: 0 },
    units: 100,
    unitLabel: "feet",
  };

  it("converts pixel distance to units", () => {
    // 200px = 100 feet, so 0.5 feet/px
    expect(pixelsToUnits(400, scale)).toBe(200);
  });

  it("returns 0 for 0 pixels", () => {
    expect(pixelsToUnits(0, scale)).toBe(0);
  });

  it("returns null for uncalibrated scale (zero distance)", () => {
    const badScale: DistanceScale = {
      pointA: { x: 0, y: 0 },
      pointB: { x: 0, y: 0 },
      units: 100,
      unitLabel: "feet",
    };
    expect(pixelsToUnits(50, badScale)).toBeNull();
  });
});

describe("polylinePixelDistance", () => {
  it("returns 0 for empty array", () => {
    expect(polylinePixelDistance([])).toBe(0);
  });

  it("returns 0 for single point", () => {
    expect(polylinePixelDistance([{ x: 0, y: 0 }])).toBe(0);
  });

  it("returns distance for two points", () => {
    expect(polylinePixelDistance([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
  });

  it("sums distances for multiple segments", () => {
    const points: MapPoint[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },  // segment 1: 100px
      { x: 100, y: 50 },  // segment 2: 50px
    ];
    expect(polylinePixelDistance(points)).toBe(150);
  });

  it("handles a square path", () => {
    const points: MapPoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(polylinePixelDistance(points)).toBe(30);
  });
});

describe("polylineUnitsDistance", () => {
  const scale: DistanceScale = {
    pointA: { x: 0, y: 0 },
    pointB: { x: 100, y: 0 },
    units: 50,
    unitLabel: "feet",
  };

  it("converts total polyline distance to units", () => {
    const points: MapPoint[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }, // 100px = 50 feet
      { x: 100, y: 100 }, // 100px = 50 feet
    ];
    expect(polylineUnitsDistance(points, scale)).toBe(100);
  });

  it("returns 0 for single point", () => {
    expect(polylineUnitsDistance([{ x: 0, y: 0 }], scale)).toBe(0);
  });

  it("returns null for bad scale", () => {
    const badScale: DistanceScale = {
      pointA: { x: 0, y: 0 },
      pointB: { x: 0, y: 0 },
      units: 10,
      unitLabel: "feet",
    };
    expect(polylineUnitsDistance([{ x: 0, y: 0 }, { x: 10, y: 0 }], badScale)).toBeNull();
  });
});

describe("segmentDistances", () => {
  const scale: DistanceScale = {
    pointA: { x: 0, y: 0 },
    pointB: { x: 100, y: 0 },
    units: 50,
    unitLabel: "feet",
  };

  it("returns empty array for less than 2 points", () => {
    expect(segmentDistances([], scale)).toEqual([]);
    expect(segmentDistances([{ x: 0, y: 0 }], scale)).toEqual([]);
  });

  it("returns one distance for two points", () => {
    const result = segmentDistances([{ x: 0, y: 0 }, { x: 100, y: 0 }], scale);
    expect(result).toEqual([50]);
  });

  it("returns per-segment distances for multiple points", () => {
    const points: MapPoint[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },   // 100px = 50 feet
      { x: 100, y: 200 },  // 200px = 100 feet
    ];
    const result = segmentDistances(points, scale);
    expect(result).toEqual([50, 100]);
  });

  it("segment distances sum to total polyline distance", () => {
    const points: MapPoint[] = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 80 },
      { x: 0, y: 80 },
    ];
    const segments = segmentDistances(points, scale)!;
    const total = polylineUnitsDistance(points, scale)!;
    const segmentSum = segments.reduce((a, b) => a + b, 0);
    expect(segmentSum).toBeCloseTo(total, 10);
  });

  it("returns null for bad scale", () => {
    const badScale: DistanceScale = {
      pointA: { x: 0, y: 0 },
      pointB: { x: 0, y: 0 },
      units: 10,
      unitLabel: "feet",
    };
    expect(segmentDistances([{ x: 0, y: 0 }, { x: 10, y: 0 }], badScale)).toBeNull();
  });
});
