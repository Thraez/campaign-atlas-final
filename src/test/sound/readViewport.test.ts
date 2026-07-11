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

  it("handles mapHeight=0 — all y values are negated lats", () => {
    // With a zero-height map the y-flip formula still holds: cy = 0 - lat.
    const map = mockMap({ lat: -50, lng: 100 }, { lat: -100, lng: 50 }, { lat: 0, lng: 150 });
    const { cx, cy, view } = readViewport(map, 0);
    expect(cx).toBe(100);
    expect(cy).toBe(50); // 0 - (-50)
    expect(view).toEqual({ minX: 50, maxX: 150, minY: 0, maxY: 100 });
  });

  it("passes through negative/oversized x values when the viewport exceeds the map width", () => {
    // readViewport does not clamp; callers are responsible for handling out-of-bounds values.
    const mapHeight = 500;
    const map = mockMap({ lat: 250, lng: 0 }, { lat: 0, lng: -100 }, { lat: 500, lng: 1100 });
    const { cx, cy, view } = readViewport(map, mapHeight);
    expect(cx).toBe(0);
    expect(cy).toBe(250); // 500 - 250
    expect(view).toEqual({ minX: -100, maxX: 1100, minY: 0, maxY: 500 });
  });

  it("places centre at y=0 when the Leaflet lat equals mapHeight (northwest corner)", () => {
    // lat = mapHeight → cy = mapHeight - mapHeight = 0 (top of map).
    const mapHeight = 800;
    const map = mockMap({ lat: 800, lng: 0 }, { lat: 750, lng: -20 }, { lat: 800, lng: 20 });
    const { cx, cy, view } = readViewport(map, mapHeight);
    expect(cx).toBe(0);
    expect(cy).toBe(0);
    expect(view).toEqual({ minX: -20, maxX: 20, minY: 0, maxY: 50 });
  });

  it("passes through negative minY when viewport extends beyond the north edge (no clamping)", () => {
    // ne.lat > mapHeight means the viewport's north edge is above the map top.
    // minY = mapHeight - ne.lat becomes negative; readViewport does not clamp to 0.
    const mapHeight = 500;
    const map = mockMap({ lat: 400, lng: 200 }, { lat: 50, lng: 100 }, { lat: 600, lng: 300 });
    const { cx, cy, view } = readViewport(map, mapHeight);
    expect(cx).toBe(200);
    expect(cy).toBe(100); // 500 - 400
    expect(view.minY).toBe(-100); // 500 - 600: negative, not clamped
    expect(view.maxY).toBe(450);  // 500 - 50
  });

  it("passes through maxY exceeding mapHeight when viewport extends beyond the south edge (no clamping)", () => {
    // sw.lat < 0 means the viewport's south edge is below the map bottom.
    // maxY = mapHeight - sw.lat exceeds mapHeight; readViewport does not clamp.
    const mapHeight = 500;
    const map = mockMap({ lat: 100, lng: 200 }, { lat: -80, lng: 100 }, { lat: 200, lng: 300 });
    const { cx, cy, view } = readViewport(map, mapHeight);
    expect(cx).toBe(200);
    expect(cy).toBe(400); // 500 - 100
    expect(view.minY).toBe(300); // 500 - 200
    expect(view.maxY).toBe(580); // 500 - (-80): exceeds mapHeight, not clamped
  });

  it("passes through out-of-bounds y in both directions simultaneously (no clamping)", () => {
    // Viewport extends past both north and south map edges at once.
    const mapHeight = 400;
    const map = mockMap({ lat: 200, lng: 0 }, { lat: -50, lng: -10 }, { lat: 450, lng: 10 });
    const { view } = readViewport(map, mapHeight);
    expect(view.minY).toBe(-50);  // 400 - 450: negative
    expect(view.maxY).toBe(450);  // 400 - (-50): > mapHeight
  });
});
