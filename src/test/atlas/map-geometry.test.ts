/**
 * Tests for src/atlas/map/geometry.ts — pure map-space geometry helpers.
 */
import { describe, it, expect } from "vitest";
import type { GridOverlay, MapDocument } from "@/atlas/content/schema";
import {
  ROUTE_MODE_LABEL,
  routeDistancePx,
  formatTravelTime,
  gridLines,
} from "@/atlas/map/geometry";

function makeMap(width: number, height: number): MapDocument {
  return {
    id: "m",
    worldId: "w",
    name: "M",
    width,
    height,
    oceanColor: "#000",
    wrapX: false,
    layers: [],
  } as MapDocument;
}

describe("routeDistancePx", () => {
  it("is 0 for an empty or single-point path", () => {
    expect(routeDistancePx([])).toBe(0);
    expect(routeDistancePx([[5, 5]])).toBe(0);
  });

  it("computes a 3-4-5 segment length", () => {
    expect(
      routeDistancePx([
        [0, 0],
        [3, 4],
      ]),
    ).toBe(5);
  });

  it("sums multiple segments", () => {
    expect(
      routeDistancePx([
        [0, 0],
        [3, 4], // +5
        [3, 4 + 12], // +12
      ]),
    ).toBe(17);
  });
});

describe("formatTravelTime", () => {
  it("renders sub-hour durations in minutes", () => {
    expect(formatTravelTime(0.5)).toBe("30 min");
    expect(formatTravelTime(0)).toBe("0 min");
  });

  it("renders hours with one decimal under 4h, whole above", () => {
    expect(formatTravelTime(1)).toBe("1.0 h");
    expect(formatTravelTime(3.5)).toBe("3.5 h");
    expect(formatTravelTime(10)).toBe("10 h");
  });

  it("renders multi-day durations in days", () => {
    expect(formatTravelTime(24)).toBe("1.0 days");
    expect(formatTravelTime(24 * 5)).toBe("5 days");
  });
});

describe("ROUTE_MODE_LABEL", () => {
  it("maps known modes and leaves custom blank", () => {
    expect(ROUTE_MODE_LABEL.foot).toBe("on foot");
    expect(ROUTE_MODE_LABEL.ship).toBe("by ship");
    expect(ROUTE_MODE_LABEL.custom).toBe("");
  });
});

describe("gridLines", () => {
  it("square grid emits vertical + horizontal lines at each step (inclusive)", () => {
    const grid: GridOverlay = { kind: "square", size: 50, enabled: true };
    const lines = gridLines(makeMap(100, 100), grid);
    // x = 0,50,100 (3 verticals) + y = 0,50,100 (3 horizontals) = 6
    expect(lines).toHaveLength(6);
    // First vertical spans full height at x=0.
    expect(lines[0]).toEqual([
      [0, 0],
      [100, 0],
    ]);
  });

  it("N117 — square grid horizontals flip lat (height - y) like every other conversion, even on non-multiple heights", () => {
    const grid: GridOverlay = { kind: "square", size: 30, enabled: true };
    const lines = gridLines(makeMap(100, 100), grid);
    // x = 0,30,60,90 (4 verticals) then y = 0,30,60,90 (4 horizontals) = 8.
    expect(lines).toHaveLength(8);
    // Horizontal at raw y=0 must sit at lat=height (100), not lat=0 (the pre-fix bug).
    expect(lines[4]).toEqual([
      [100, 0],
      [100, 100],
    ]);
    // Horizontal at raw y=90 (the partial step, doesn't reach height=100) must sit at lat=10.
    expect(lines[7]).toEqual([
      [10, 0],
      [10, 100],
    ]);
  });

  it("hex grid emits closed 7-vertex polylines (first === last)", () => {
    const grid: GridOverlay = { kind: "hex", size: 20, enabled: true };
    const lines = gridLines(makeMap(100, 100), grid);
    expect(lines.length).toBeGreaterThan(0);
    for (const poly of lines) {
      expect(poly).toHaveLength(7);
      expect(poly[0]).toEqual(poly[6]);
    }
  });
});
