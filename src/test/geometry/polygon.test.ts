import { describe, it, expect } from "vitest";
import { pointInPolygon, bboxOf, rectArea, rectIntersectArea } from "@/atlas/geometry/polygon";
import type { Point } from "@/atlas/content/schema";

const square: Point[] = [[0, 0], [100, 0], [100, 100], [0, 100]];

describe("pointInPolygon", () => {
  it("is true for an interior point", () => expect(pointInPolygon(50, 50, square)).toBe(true));
  it("is false for an exterior point", () => expect(pointInPolygon(150, 50, square)).toBe(false));
  it("is false for a degenerate polygon", () => expect(pointInPolygon(0, 0, [[0, 0], [1, 1]])).toBe(false));
});

describe("bboxOf / rectArea / rectIntersectArea", () => {
  it("computes a bbox", () => expect(bboxOf(square)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 }));
  it("returns null for empty points", () => expect(bboxOf([])).toBeNull());
  it("computes rect area", () => expect(rectArea({ minX: 0, minY: 0, maxX: 10, maxY: 20 })).toBe(200));
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
});
