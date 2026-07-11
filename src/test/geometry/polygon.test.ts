import { describe, it, expect } from "vitest";
import { pointInPolygon, bboxOf, rectArea, rectIntersectArea } from "@/atlas/geometry/polygon";
import type { Point } from "@/atlas/content/schema";

const square: Point[] = [[0, 0], [100, 0], [100, 100], [0, 100]];

describe("pointInPolygon", () => {
  it("is true for an interior point", () => expect(pointInPolygon(50, 50, square)).toBe(true));
  it("is false for an exterior point", () => expect(pointInPolygon(150, 50, square)).toBe(false));
  it("is false for a degenerate polygon", () => expect(pointInPolygon(0, 0, [[0, 0], [1, 1]])).toBe(false));
  it("is false for an empty polygon (length < 3 guard)", () => expect(pointInPolygon(0, 0, [])).toBe(false));
  it("is false for a single-point polygon (length < 3 guard)", () => expect(pointInPolygon(0, 0, [[0, 0] as Point])).toBe(false));
});

describe("bboxOf / rectArea / rectIntersectArea", () => {
  it("computes a bbox", () => expect(bboxOf(square)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 }));
  it("returns null for empty points", () => expect(bboxOf([])).toBeNull());
  it("non-axis-aligned triangle: each vertex contributes a different extreme", () => {
    // [10,80]: minX=10; [90,20]: minY=20 and maxX=90; [50,90]: maxY=90
    const tri: Point[] = [[10, 80], [90, 20], [50, 90]];
    expect(bboxOf(tri)).toEqual({ minX: 10, minY: 20, maxX: 90, maxY: 90 });
  });
  it("bboxOf: single-point collapses min and max to that point", () => {
    expect(bboxOf([[5, 7]])).toEqual({ minX: 5, minY: 7, maxX: 5, maxY: 7 });
  });
  it("computes rect area", () => expect(rectArea({ minX: 0, minY: 0, maxX: 10, maxY: 20 })).toBe(200));
  it("rectArea: zero-width rect returns 0 (Math.max guard)", () => {
    expect(rectArea({ minX: 10, minY: 0, maxX: 10, maxY: 20 })).toBe(0);
  });
  it("rectArea: inverted axes return 0 (Math.max guard)", () => {
    expect(rectArea({ minX: 20, minY: 0, maxX: 10, maxY: 10 })).toBe(0);
  });
  it("computes overlap area of two rects", () => {
    const a = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const b = { minX: 50, minY: 50, maxX: 150, maxY: 150 };
    expect(rectIntersectArea(a, b)).toBe(2500); // 50x50 overlap
  });
  it("returns 0 for disjoint rects", () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: 20, minY: 20, maxX: 30, maxY: 30 };
    expect(rectIntersectArea(a, b)).toBe(0);
  });
  it("rectIntersectArea: touching edge (no gap, no overlap) returns 0", () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: 10, minY: 0, maxX: 20, maxY: 10 }; // a.maxX === b.minX
    expect(rectIntersectArea(a, b)).toBe(0);
  });
  it("rectIntersectArea: inner rect fully inside outer returns inner's area", () => {
    const outer = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const inner = { minX: 20, minY: 20, maxX: 60, maxY: 50 }; // 40×30 = 1200
    expect(rectIntersectArea(outer, inner)).toBe(1200);
  });
});
