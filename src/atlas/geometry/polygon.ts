import type { Point } from "@/atlas/content/schema";

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Ray-casting point-in-polygon. Coordinates are map coords [x, y]. */
export function pointInPolygon(x: number, y: number, poly: Point[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function bboxOf(points: Point[]): BBox | null {
  if (points.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function rectArea(b: BBox): number {
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
}

export function rectIntersectArea(a: BBox, b: BBox): number {
  const w = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const h = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  return w * h;
}

/** Arithmetic mean of the vertices. Coordinates are map coords [x, y]. */
export function centroid(points: Point[]): Point {
  if (!points.length) return [0, 0];
  let sx = 0,
    sy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
  }
  return [sx / points.length, sy / points.length];
}

// ---------------------------------------------------------------------------
// Containment (ADR-0004 rule 9): what a hidden region hides. Polygons are
// even-odd, as `pointInPolygon` reads them, so a self-intersecting one is
// tested the way the fog code draws it. A point on a polygon's edge counts as
// inside it (fail closed); two areas "touch" when they share interior, so
// neighbours sharing only an edge don't.
// ---------------------------------------------------------------------------

/** Relative tolerance for "on a line": generous, so near-misses read as touching (fail closed). */
const ON_LINE = 1e-9;

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** -1, 0 or 1: which side of the line a->b the point c lies on (0: on the line, within tolerance). */
function orient(a: Point, b: Point, c: Point): number {
  const v = cross(a, b, c);
  const scale = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - a[0], c[1] - a[1]);
  if (Math.abs(v) <= ON_LINE * scale) return 0;
  return v > 0 ? 1 : -1;
}

/** True when c, known to be on the line a->b, lies within the segment's box. */
function withinBox(a: Point, b: Point, c: Point): boolean {
  const tol = ON_LINE * (Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) + 1);
  return (
    c[0] >= Math.min(a[0], b[0]) - tol &&
    c[0] <= Math.max(a[0], b[0]) + tol &&
    c[1] >= Math.min(a[1], b[1]) - tol &&
    c[1] <= Math.max(a[1], b[1]) + tol
  );
}

/** True when the point lies on the segment a-b, its ends included. */
export function pointOnSegment(p: Point, a: Point, b: Point): boolean {
  if (a[0] === b[0] && a[1] === b[1]) return p[0] === a[0] && p[1] === a[1];
  return orient(a, b, p) === 0 && withinBox(a, b, p);
}

/** True when the segments a-b and c-d share any point (closed: touching ends and collinear overlap count). */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) return true;
  return (
    pointOnSegment(c, a, b) ||
    pointOnSegment(d, a, b) ||
    pointOnSegment(a, c, d) ||
    pointOnSegment(b, c, d)
  );
}

/** True when the segments cross at one point inside both (no shared end, no end on the other, not collinear). */
export function segmentsCrossProperly(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function ring(poly: readonly Point[]): [Point, Point][] {
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length]] as [Point, Point]);
}

/** True when (x, y) lies on one of the polygon's edges (its closing edge included). */
export function pointOnPolygonEdge(x: number, y: number, poly: readonly Point[]): boolean {
  return ring(poly).some(([a, b]) => pointOnSegment([x, y], a, b));
}

/** Inside (even-odd) or on the edge: how a hiding region tests a pin (rule 9, edge counts as inside). */
export function pointInOrOnPolygon(x: number, y: number, poly: readonly Point[]): boolean {
  return pointOnPolygonEdge(x, y, poly) || pointInPolygon(x, y, poly as Point[]);
}

/** Inside (even-odd) and not on any edge. */
export function pointStrictlyInPolygon(x: number, y: number, poly: readonly Point[]): boolean {
  return pointInPolygon(x, y, poly as Point[]) && !pointOnPolygonEdge(x, y, poly);
}

/**
 * True when any part of the path through `points` lies inside `poly` or on its
 * edge: a vertex in or on it, or a segment meeting any of its edges (crossing
 * into it, touching a corner, running along an edge). A segment that meets no
 * edge stays in one face, so with both ends outside it is outside.
 */
export function pathReachesPolygon(points: readonly Point[], poly: readonly Point[]): boolean {
  if (points.some(([x, y]) => pointInOrOnPolygon(x, y, poly))) return true;
  const edges = ring(poly);
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (edges.some(([c, d]) => segmentsIntersect(a, b, c, d))) return true;
  }
  return false;
}

/**
 * One point inside every face of the arrangement of the polygons' edges that
 * meets the box: the box is cut into vertical slabs at every vertex and every
 * crossing (no edges cross inside a slab), each slab into the trapezoids
 * between the edges that span it, and each trapezoid's middle is taken. A
 * point so taken is on no edge, so `pointInPolygon` reads it exactly. The same
 * construction as the fog code's `frameUnderFog`.
 */
function faceSamples(polys: readonly (readonly Point[])[], box: BBox): Point[] {
  const segments = polys.flatMap((p) => (p.length >= 2 ? ring(p) : []));
  const cuts = new Set<number>([box.minX, box.maxX]);
  const addCut = (x: number) => {
    if (x > box.minX && x < box.maxX) cuts.add(x);
  };
  for (const [a, b] of segments) {
    addCut(a[0]);
    addCut(b[0]);
  }
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const x = crossingX(segments[i], segments[j]);
      if (x !== null) addCut(x);
    }
  }
  const xs = [...cuts].sort((a, b) => a - b);
  const out: Point[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const [x0, x1] = [xs[i], xs[i + 1]];
    if (x1 - x0 <= 1e-12 * (Math.abs(x0) + 1)) continue;
    const xm = (x0 + x1) / 2;
    const hits = [box.minY, box.maxY];
    for (const [a, b] of segments) {
      const lo = Math.min(a[0], b[0]);
      const hi = Math.max(a[0], b[0]);
      if (xm <= lo || xm >= hi) continue;
      hits.push(a[1] + ((b[1] - a[1]) * (xm - a[0])) / (b[0] - a[0]));
    }
    const ys = hits.filter((y) => y >= box.minY && y <= box.maxY).sort((a, b) => a - b);
    for (let k = 0; k + 1 < ys.length; k++) {
      if (ys[k + 1] - ys[k] <= 1e-12 * (Math.abs(ys[k]) + 1)) continue;
      out.push([xm, (ys[k] + ys[k + 1]) / 2]);
    }
  }
  return out;
}

/** The x of the single point where two non-parallel segments cross, or null. */
function crossingX([p1, p2]: [Point, Point], [p3, p4]: [Point, Point]): number | null {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (d === 0) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return p1[0] + t * (p2[0] - p1[0]);
}

function boxesOverlap(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

/**
 * True when any edge of `a` runs through the interior of `b`: each edge is
 * cut at every point where it meets an edge of `b` (a crossing, or a vertex of
 * `b` on it), and a piece whose middle is strictly inside `b` lies inside it,
 * since no piece meets `b`'s boundary between its ends. Catches an edge that
 * enters `b` only through `b`'s vertices, which no proper crossing sees.
 */
function edgeRunsInside(a: readonly Point[], b: readonly Point[]): boolean {
  if (a.length < 2 || b.length < 3) return false;
  const eb = ring(b);
  for (const [p, q] of ring(a)) {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const along = (c: Point) => ((c[0] - p[0]) * dx + (c[1] - p[1]) * dy) / len2;
    const ts = [0, 1];
    for (const [r, s] of eb) {
      if (pointOnSegment(r, p, q)) ts.push(along(r));
      if (pointOnSegment(s, p, q)) ts.push(along(s));
      if (segmentsCrossProperly(p, q, r, s)) {
        const d = dx * (s[1] - r[1]) - dy * (s[0] - r[0]);
        if (d !== 0) ts.push(((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d);
      }
    }
    const sorted = ts.map((t) => Math.min(1, Math.max(0, t))).sort((x, y) => x - y);
    for (let i = 0; i + 1 < sorted.length; i++) {
      if (sorted[i + 1] <= sorted[i]) continue;
      const t = (sorted[i] + sorted[i + 1]) / 2;
      if (pointStrictlyInPolygon(p[0] + t * dx, p[1] + t * dy, b)) return true;
    }
  }
  return false;
}

/**
 * True when the two areas share interior (rule 9's "touches"): a vertex of
 * either strictly inside the other, two edges properly crossing, an edge of
 * either running through the other's interior (entering only through its
 * vertices, say), or any face of their edges' arrangement inside both (so an
 * identical area, or one overlapping along a collinear edge, touches). Two
 * neighbours that only share an edge, or a vertex, don't. An area with no
 * width (all on a line, or a zero-width spike) touches wherever an edge of it
 * passes through the other's interior: Leaflet draws its stroke there.
 */
export function polygonsTouch(a: readonly Point[], b: readonly Point[]): boolean {
  const ba = bboxOf(a as Point[]);
  const bb = bboxOf(b as Point[]);
  if (!ba || !bb || !boxesOverlap(ba, bb)) return false;
  if (a.some(([x, y]) => pointStrictlyInPolygon(x, y, b))) return true;
  if (b.some(([x, y]) => pointStrictlyInPolygon(x, y, a))) return true;
  const ea = a.length >= 2 ? ring(a) : [];
  const eb = b.length >= 2 ? ring(b) : [];
  for (const [p, q] of ea)
    for (const [r, s] of eb) if (segmentsCrossProperly(p, q, r, s)) return true;
  if (edgeRunsInside(a, b) || edgeRunsInside(b, a)) return true;
  if (a.length < 3 || b.length < 3) return false;
  const box: BBox = {
    minX: Math.max(ba.minX, bb.minX),
    minY: Math.max(ba.minY, bb.minY),
    maxX: Math.min(ba.maxX, bb.maxX),
    maxY: Math.min(ba.maxY, bb.maxY),
  };
  return faceSamples([a, b], box).some(
    ([x, y]) => pointInPolygon(x, y, a as Point[]) && pointInPolygon(x, y, b as Point[]),
  );
}

/**
 * True when the polygon encloses any area (even-odd): some face of its own
 * edges' arrangement is inside it. False for fewer than 3 points, points all
 * on one line, or a ring that retraces itself.
 */
export function polygonHasArea(poly: readonly Point[]): boolean {
  if (poly.length < 3) return false;
  const box = bboxOf(poly as Point[]);
  if (!box) return false;
  return faceSamples([poly], box).some(([x, y]) => pointInPolygon(x, y, poly as Point[]));
}

/**
 * True when `inner` lies strictly inside `outer`, sharing no boundary: no edge
 * of one meets an edge of the other (not even at one vertex), every vertex of
 * `inner` is strictly inside `outer`, and every face of their arrangement
 * inside `inner` is inside `outer`. An identical area is not a container. An
 * `outer` with no area contains nothing.
 */
export function polygonContainsStrictly(outer: readonly Point[], inner: readonly Point[]): boolean {
  if (outer.length < 3 || inner.length === 0) return false;
  const bo = bboxOf(outer as Point[]);
  const bi = bboxOf(inner as Point[]);
  if (!bo || !bi) return false;
  if (bi.minX < bo.minX || bi.maxX > bo.maxX || bi.minY < bo.minY || bi.maxY > bo.maxY)
    return false;
  if (!inner.every(([x, y]) => pointStrictlyInPolygon(x, y, outer))) return false;
  const eo = ring(outer);
  const ei = inner.length >= 2 ? ring(inner) : [];
  for (const [p, q] of eo) for (const [r, s] of ei) if (segmentsIntersect(p, q, r, s)) return false;
  if (inner.length < 3) return true;
  return faceSamples([outer, inner], bi).every(
    ([x, y]) => !pointInPolygon(x, y, inner as Point[]) || pointInPolygon(x, y, outer as Point[]),
  );
}
