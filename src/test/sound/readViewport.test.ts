import { describe, it, expect } from "vitest";
import { readViewport } from "@/atlas/sound/readViewport";

// Mock just the slice of the Leaflet map API we use.
const mockMap = (center: { lat: number; lng: number }, sw: { lat: number; lng: number }, ne: { lat: number; lng: number }) => ({
  getCenter: () => center,
  getBounds: () => ({ getSouthWest: () => sw, getNorthEast: () => ne }),
});

describe("readViewport", () => {
  it("un-flips lat→y for the centre and the viewport corners", () => {
    const mapHeight = 1000;
    // Centre at map (x=300, y=200) => lat = 1000-200 = 800, lng = 300
    const map = mockMap({ lat: 800, lng: 300 }, { lat: 100, lng: 50 }, { lat: 900, lng: 700 });
    const { cx, cy, view } = readViewport(map, mapHeight);
    expect(cx).toBe(300);
    expect(cy).toBe(200); // 1000 - 800
    // sw.lat=100 (south) => maxY = 1000-100 = 900 ; ne.lat=900 (north) => minY = 1000-900 = 100
    expect(view).toEqual({ minX: 50, maxX: 700, minY: 100, maxY: 900 });
  });
});
