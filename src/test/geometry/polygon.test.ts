import { describe, it, expect } from "vitest";
import {
  pointInPolygon,
  bboxOf,
  rectArea,
  rectIntersectArea,
  centroid,
  pathReachesPolygon,
  pointInOrOnPolygon,
  pointOnPolygonEdge,
  pointStrictlyInPolygon,
  polygonContainsStrictly,
  polygonsTouch,
  segmentsCrossProperly,
  segmentsIntersect,
} from "@/atlas/geometry/polygon";
import type { Point } from "@/atlas/content/schema";

const square: Point[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

describe("pointInPolygon", () => {
  it("is true for an interior point", () => expect(pointInPolygon(50, 50, square)).toBe(true));
  it("is false for an exterior point", () => expect(pointInPolygon(150, 50, square)).toBe(false));
  it("is false for a degenerate polygon", () =>
    expect(
      pointInPolygon(0, 0, [
        [0, 0],
        [1, 1],
      ]),
    ).toBe(false));
  it("is false for an empty polygon (length < 3 guard)", () =>
    expect(pointInPolygon(0, 0, [])).toBe(false));
  it("is false for a single-point polygon (length < 3 guard)", () =>
    expect(pointInPolygon(0, 0, [[0, 0] as Point])).toBe(false));
});

describe("bboxOf / rectArea / rectIntersectArea", () => {
  it("computes a bbox", () =>
    expect(bboxOf(square)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 }));
  it("returns null for empty points", () => expect(bboxOf([])).toBeNull());
  it("non-axis-aligned triangle: each vertex contributes a different extreme", () => {
    // [10,80]: minX=10; [90,20]: minY=20 and maxX=90; [50,90]: maxY=90
    const tri: Point[] = [
      [10, 80],
      [90, 20],
      [50, 90],
    ];
    expect(bboxOf(tri)).toEqual({ minX: 10, minY: 20, maxX: 90, maxY: 90 });
  });
  it("bboxOf: single-point collapses min and max to that point", () => {
    expect(bboxOf([[5, 7]])).toEqual({ minX: 5, minY: 7, maxX: 5, maxY: 7 });
  });
  it("computes rect area", () =>
    expect(rectArea({ minX: 0, minY: 0, maxX: 10, maxY: 20 })).toBe(200));
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

describe("centroid", () => {
  it("averages the vertices of a square", () => expect(centroid(square)).toEqual([50, 50]));
  it("returns [0, 0] for an empty point list", () => expect(centroid([])).toEqual([0, 0]));
  it("returns the single point for a one-point list", () =>
    expect(centroid([[7, 3]])).toEqual([7, 3]));
  it("averages an asymmetric triangle", () => {
    const tri: Point[] = [
      [0, 0],
      [90, 0],
      [0, 60],
    ];
    expect(centroid(tri)).toEqual([30, 20]);
  });
});

// ---------------------------------------------------------------------------
// Containment helpers (ADR-0004 rule 9, R-11e). The hiding region's edge
// counts as inside; areas "touch" when they share interior.
// ---------------------------------------------------------------------------

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
/** A concave "U": the notch x 40..60, y 0..70 is outside. */
const U: Point[] = [
  [0, 0],
  [40, 0],
  [40, 70],
  [60, 70],
  [60, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];
/** A self-intersecting bow tie: two triangles meeting at (50, 50); even-odd. */
const BOW_TIE: Point[] = [
  [0, 0],
  [100, 100],
  [100, 0],
  [0, 100],
];
/** A pentagram (star) drawn in one stroke: even-odd leaves its centre outside. */
const STAR: Point[] = [0, 2, 4, 1, 3].map((k) => {
  const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
  return [500 + 400 * Math.cos(a), 500 + 400 * Math.sin(a)] as Point;
});

describe("pointOnPolygonEdge / pointInOrOnPolygon / pointStrictlyInPolygon", () => {
  it("a point on an edge or a vertex is on the edge, and counts as in-or-on, not strictly in", () => {
    for (const [x, y] of [
      [50, 0],
      [100, 50],
      [0, 0],
      [100, 100],
    ]) {
      expect(pointOnPolygonEdge(x, y, square)).toBe(true);
      expect(pointInOrOnPolygon(x, y, square)).toBe(true);
      expect(pointStrictlyInPolygon(x, y, square)).toBe(false);
    }
  });
  it("interior and exterior points", () => {
    expect(pointInOrOnPolygon(50, 50, square)).toBe(true);
    expect(pointStrictlyInPolygon(50, 50, square)).toBe(true);
    expect(pointInOrOnPolygon(100.001, 50, square)).toBe(false);
  });
  it("concave: the notch is outside, its rim is on the edge", () => {
    expect(pointInOrOnPolygon(50, 30, U)).toBe(false);
    expect(pointInOrOnPolygon(50, 70, U)).toBe(true);
    expect(pointStrictlyInPolygon(50, 80, U)).toBe(true);
  });
  it("self-intersecting (even-odd): the star's centre is outside, its points inside", () => {
    expect(pointInOrOnPolygon(500, 500, STAR)).toBe(false);
    expect(pointStrictlyInPolygon(500, 150, STAR)).toBe(true);
    // The bow tie's crossing point lies on two of its edges.
    expect(pointInOrOnPolygon(50, 50, BOW_TIE)).toBe(true);
    expect(pointInOrOnPolygon(50, 20, BOW_TIE)).toBe(false);
    expect(pointInOrOnPolygon(20, 50, BOW_TIE)).toBe(true);
  });
});

describe("segment helpers", () => {
  it("segmentsIntersect is closed: touching at an end and collinear overlap count", () => {
    expect(segmentsIntersect([0, 0], [10, 0], [10, 0], [20, 5])).toBe(true);
    expect(segmentsIntersect([0, 0], [10, 0], [5, 0], [20, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [10, 0], [11, 0], [20, 0])).toBe(false);
    expect(segmentsIntersect([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true);
  });
  it("segmentsCrossProperly: only interiors crossing at one point", () => {
    expect(segmentsCrossProperly([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true);
    expect(segmentsCrossProperly([0, 0], [10, 0], [10, 0], [20, 5])).toBe(false); // shared end
    expect(segmentsCrossProperly([0, 0], [10, 0], [5, 0], [5, 5])).toBe(false); // T: end on the other
    expect(segmentsCrossProperly([0, 0], [10, 0], [5, 0], [20, 0])).toBe(false); // collinear
  });
});

describe("pathReachesPolygon (routes)", () => {
  it("a vertex inside or on the edge reaches it", () => {
    expect(
      pathReachesPolygon(
        [
          [50, 50],
          [200, 200],
        ],
        square,
      ),
    ).toBe(true);
    expect(
      pathReachesPolygon(
        [
          [100, 50],
          [200, 50],
        ],
        square,
      ),
    ).toBe(true);
  });
  it("a segment crossing a concave polygon with no vertex inside reaches it", () => {
    // Crosses the U's left arm (x 0..40) at y 50, both ends outside.
    expect(
      pathReachesPolygon(
        [
          [-10, 50],
          [50, 50],
        ],
        U,
      ),
    ).toBe(true);
    // Through the notch only: outside.
    expect(
      pathReachesPolygon(
        [
          [45, -10],
          [55, 60],
        ],
        U,
      ),
    ).toBe(false);
  });
  it("a segment that only touches a corner, or runs along an edge, reaches it (edge counts as inside)", () => {
    expect(
      pathReachesPolygon(
        [
          [-10, 110],
          [10, 90],
        ],
        rect(0, 0, 100, 100),
      ),
    ).toBe(true);
    expect(
      pathReachesPolygon(
        [
          [-50, 0],
          [150, 0],
        ],
        square,
      ),
    ).toBe(true);
    expect(
      pathReachesPolygon(
        [
          [-50, -1],
          [150, -1],
        ],
        square,
      ),
    ).toBe(false);
  });
  it("self-intersecting hiding polygon: a path through the star's outside centre only is clear, one crossing an arm isn't", () => {
    expect(
      pathReachesPolygon(
        [
          [480, 500],
          [520, 500],
        ],
        STAR,
      ),
    ).toBe(false);
    expect(
      pathReachesPolygon(
        [
          [500, 500],
          [500, 50],
        ],
        STAR,
      ),
    ).toBe(true);
  });
});

describe("polygonsTouch (areas share interior)", () => {
  it("disjoint: no", () =>
    expect(polygonsTouch(rect(0, 0, 10, 10), rect(20, 0, 30, 10))).toBe(false));
  it("a shared edge only: no", () => {
    expect(polygonsTouch(rect(0, 0, 10, 10), rect(10, 0, 20, 10))).toBe(false);
    // A shorter neighbour along part of the edge.
    expect(polygonsTouch(rect(0, 0, 10, 10), rect(10, 2, 20, 8))).toBe(false);
  });
  it("a vertex on the other's edge only: no", () => {
    const tri: Point[] = [
      [10, 5],
      [20, 0],
      [20, 10],
    ];
    expect(polygonsTouch(rect(0, 0, 10, 10), tri)).toBe(false);
  });
  it("collinear overlapping edges with interiors on the same side: yes", () => {
    expect(polygonsTouch(rect(0, 0, 10, 10), rect(5, 0, 15, 10))).toBe(true);
    expect(polygonsTouch(rect(0, 0, 10, 10), rect(2, 0, 8, 4))).toBe(true);
  });
  it("an identical area: yes", () => expect(polygonsTouch(square, [...square])).toBe(true));
  it("crossing with no vertex inside the other (a plus sign): yes", () => {
    expect(polygonsTouch(rect(40, 0, 60, 100), rect(0, 40, 100, 60))).toBe(true);
  });
  it("one inside the other: yes", () =>
    expect(polygonsTouch(square, rect(40, 40, 60, 60))).toBe(true));
  it("self-intersecting (even-odd): a square in the star's outside centre doesn't touch it", () => {
    expect(polygonsTouch(rect(490, 490, 510, 510), STAR)).toBe(false);
    expect(polygonsTouch(rect(490, 140, 510, 160), STAR)).toBe(true);
  });
  it("a degenerate item (no area) crossing it: yes", () => {
    expect(
      polygonsTouch(
        [
          [-10, 50],
          [110, 50],
        ],
        square,
      ),
    ).toBe(true);
  });
  it("a rotated frame reaching in by its turned corner: yes", () => {
    const c = Math.SQRT1_2;
    // A 100 x 100 square turned 45 degrees about (0, 0): its corner at (0, 141) reaches into the zone.
    const turned: Point[] = [
      [0, 0],
      [100 * c, 100 * c],
      [0, 200 * c],
      [-100 * c, 100 * c],
    ];
    expect(polygonsTouch(turned, rect(-10, 130, 10, 160))).toBe(true);
    expect(polygonsTouch(turned, rect(80, 0, 100, 20))).toBe(false);
  });
});

describe("polygonContainsStrictly (an area wholly containing a hiding region)", () => {
  it("strictly inside, sharing no boundary: yes", () =>
    expect(polygonContainsStrictly(square, rect(40, 40, 60, 60))).toBe(true));
  it("an identical area: no (not a container)", () =>
    expect(polygonContainsStrictly(square, [...square])).toBe(false));
  it("sharing part of an edge, or one vertex: no", () => {
    expect(polygonContainsStrictly(square, rect(0, 40, 60, 60))).toBe(false);
    const tri: Point[] = [
      [0, 0],
      [60, 40],
      [40, 60],
    ];
    expect(polygonContainsStrictly(square, tri)).toBe(false);
  });
  it("partly outside: no", () =>
    expect(polygonContainsStrictly(square, rect(90, 40, 110, 60))).toBe(false));
  it("concave container: a zone poking into the notch isn't contained", () => {
    expect(polygonContainsStrictly(U, rect(10, 80, 90, 90))).toBe(true);
    expect(polygonContainsStrictly(U, rect(10, 60, 90, 90))).toBe(false);
  });
  it("self-intersecting container: the star doesn't contain its own outside centre", () => {
    expect(polygonContainsStrictly(STAR, rect(490, 490, 510, 510))).toBe(false);
    expect(polygonContainsStrictly(STAR, rect(495, 140, 505, 150))).toBe(true);
  });
  it("a container with no area contains nothing", () =>
    expect(
      polygonContainsStrictly(
        [
          [0, 0],
          [100, 100],
        ],
        rect(40, 40, 41, 41),
      ),
    ).toBe(false));
});
