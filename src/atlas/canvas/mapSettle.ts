/**
 * Q-02: where a map view's camera settles after a zoom in. Pure; the
 * component is `MapZoomSettle`.
 *
 * The rule: the shortest slide that leaves no sea on a side the map could
 * fill, and puts the whole map on screen along an axis where it is smaller
 * than the screen. Per axis, the centre is clamped to
 * [min(half, span - half), max(half, span - half)], where `half` is half the
 * screen in view pixels and `span` the map's size.
 */
import type { Point } from "../content/schema";

/** A slide shorter than this many screen px is no slide. */
export const SETTLE_SAME_PX = 1;

/**
 * The centre a map view's camera settles to, in the map's pixels, or null
 * when it is already there (within `SETTLE_SAME_PX` on screen).
 */
export function settledCentre(
  center: Point,
  zoom: number,
  mapWidth: number,
  mapHeight: number,
  size: { x: number; y: number },
): Point | null {
  const k = 2 ** zoom;
  if (!(k > 0 && size.x > 0 && size.y > 0 && mapWidth > 0 && mapHeight > 0)) return null;
  const axis = (c: number, span: number, screen: number) => {
    const half = screen / 2 / k;
    const lo = Math.min(half, span - half);
    const hi = Math.max(half, span - half);
    return Math.min(hi, Math.max(lo, c));
  };
  const x = axis(center[0], mapWidth, size.x);
  const y = axis(center[1], mapHeight, size.y);
  if (Math.hypot(x - center[0], y - center[1]) * k < SETTLE_SAME_PX) return null;
  return [x, y];
}

/** Whether `p` is inside the polygon `poly` (even-odd rule). */
export function insidePolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
