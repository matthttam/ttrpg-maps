import { describe, it, expect } from "vitest";
import { generateMapId, generateMarkerId } from "../../src/utils/mapId";

describe("generateMapId", () => {
  it("generates a string starting with map_", () => {
    const id = generateMapId("maps/world.png");
    expect(id).toMatch(/^map_/);
  });

  it("generates consistent IDs for the same path", () => {
    const id1 = generateMapId("maps/dungeon.webp");
    const id2 = generateMapId("maps/dungeon.webp");
    expect(id1).toBe(id2);
  });

  it("generates different IDs for different paths", () => {
    const id1 = generateMapId("maps/world.png");
    const id2 = generateMapId("maps/dungeon.png");
    expect(id1).not.toBe(id2);
  });

  it("handles empty string", () => {
    const id = generateMapId("");
    expect(id).toBe("map_0");
  });

  it("handles paths with special characters", () => {
    const id = generateMapId("maps/My World Map (v2).png");
    expect(id).toMatch(/^map_[a-z0-9]+$/);
  });
});

describe("generateMarkerId", () => {
  it("generates a string starting with marker_", () => {
    const id = generateMarkerId();
    expect(id).toMatch(/^marker_/);
  });

  it("generates unique IDs on successive calls", () => {
    const id1 = generateMarkerId();
    const id2 = generateMarkerId();
    expect(id1).not.toBe(id2);
  });

  it("contains a timestamp and random suffix", () => {
    const id = generateMarkerId();
    expect(id).toMatch(/^marker_\d+_[a-z0-9]+$/);
  });
});
