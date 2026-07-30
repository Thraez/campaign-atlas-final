/**
 * Tests for src/atlas/map/coords.ts — the flat-CRS atlas↔Leaflet convention.
 */
import { describe, it, expect } from "vitest";
import { atlasToLatLng, latLngToAtlas } from "@/atlas/map/coords";

describe("atlasToLatLng", () => {
  it("flips y against map height for lat, passes x through as lng", () => {
    expect(atlasToLatLng(120, 80, 1000)).toEqual([920, 120]);
  });
  it("origin (0,0) maps to [height, 0]", () => {
    expect(atlasToLatLng(0, 0, 1000)).toEqual([1000, 0]);
  });
});

describe("latLngToAtlas", () => {
  it("passes lng through as x, flips lat against map height for y", () => {
    expect(latLngToAtlas(120, 920, 1000)).toEqual({ x: 120, y: 80 });
  });
});

describe("round-trip", () => {
  it("atlasToLatLng then latLngToAtlas returns the original point", () => {
    const height = 1500;
    for (const [x, y] of [
      [0, 0],
      [42.5, 917.25],
      [1500, 0],
      [0, 1500],
    ] as const) {
      const [lat, lng] = atlasToLatLng(x, y, height);
      expect(latLngToAtlas(lng, lat, height)).toEqual({ x, y });
    }
  });
});
