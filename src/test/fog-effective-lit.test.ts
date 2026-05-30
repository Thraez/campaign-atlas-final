import { describe, it, expect } from "vitest";
import { pointInPolygon, isLit, effectivePolygons } from "@/atlas/fog/effectiveLit";
import type { Point, FogOverlay } from "@/atlas/content/schema";

// Convenience fixtures
const SQUARE: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
const INNER_SQUARE: Point[] = [[3, 3], [7, 3], [7, 7], [3, 7]];
const TRIANGLE: Point[] = [[0, 0], [10, 0], [5, 10]];

function fog(overrides: Partial<FogOverlay>): FogOverlay {
  return {
    mapId: "test-map",
    enabled: true,
    reveals: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// pointInPolygon
// ---------------------------------------------------------------------------

describe("pointInPolygon", () => {
  it("returns false for a polygon with fewer than 3 points", () => {
    expect(pointInPolygon(5, 5, [[0, 0], [10, 0]])).toBe(false);
  });

  it("returns false for an empty polygon", () => {
    expect(pointInPolygon(0, 0, [])).toBe(false);
  });

  it("returns true for a point clearly inside a unit square", () => {
    expect(pointInPolygon(5, 5, SQUARE)).toBe(true);
  });

  it("returns false for a point clearly outside a unit square", () => {
    expect(pointInPolygon(15, 15, SQUARE)).toBe(false);
  });

  it("returns true for a point inside a triangle", () => {
    expect(pointInPolygon(5, 4, TRIANGLE)).toBe(true);
  });

  it("returns false for a point outside a triangle", () => {
    expect(pointInPolygon(0, 9, TRIANGLE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// effectivePolygons
// ---------------------------------------------------------------------------

describe("effectivePolygons", () => {
  it("passes through valid (>= 3 point) polygons unchanged", () => {
    const f = fog({ reveals: [SQUARE, TRIANGLE] });
    const { reveals } = effectivePolygons(f);
    expect(reveals).toHaveLength(2);
  });

  it("filters out reveal polygons with fewer than 3 points", () => {
    const tooShort: Point[] = [[0, 0], [5, 0]];
    const f = fog({ reveals: [SQUARE, tooShort] });
    const { reveals } = effectivePolygons(f);
    expect(reveals).toHaveLength(1);
    expect(reveals[0]).toBe(SQUARE);
  });

  it("filters out conceal polygons with fewer than 3 points", () => {
    const tooShort: Point[] = [[3, 3]];
    const f = fog({ reveals: [SQUARE], conceals: [INNER_SQUARE, tooShort] });
    const { conceals } = effectivePolygons(f);
    expect(conceals).toHaveLength(1);
    expect(conceals[0]).toBe(INNER_SQUARE);
  });

  it("treats missing conceals as an empty list", () => {
    const f = fog({ reveals: [SQUARE] });
    delete (f as Partial<FogOverlay>).conceals;
    const { conceals } = effectivePolygons(f);
    expect(conceals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isLit
// ---------------------------------------------------------------------------

describe("isLit", () => {
  it("returns true when fog is disabled, regardless of position", () => {
    const f = fog({ enabled: false, reveals: [] });
    expect(isLit(500, 500, f)).toBe(true);
  });

  it("returns false when fog is enabled and the point is in no reveal", () => {
    const f = fog({ reveals: [SQUARE] });
    expect(isLit(50, 50, f)).toBe(false);
  });

  it("returns true when the point is inside a reveal and no conceal covers it", () => {
    const f = fog({ reveals: [SQUARE] });
    expect(isLit(5, 5, f)).toBe(true);
  });

  it("returns false when the point is inside a reveal but also inside a conceal", () => {
    const f = fog({ reveals: [SQUARE], conceals: [INNER_SQUARE] });
    // (5,5) is inside both SQUARE and INNER_SQUARE — conceal wins
    expect(isLit(5, 5, f)).toBe(false);
  });

  it("returns true for a point inside a reveal but outside the conceal polygon", () => {
    const f = fog({ reveals: [SQUARE], conceals: [INNER_SQUARE] });
    // (1,1) is inside SQUARE but outside INNER_SQUARE — lit
    expect(isLit(1, 1, f)).toBe(true);
  });
});
