import type { FogOverlay, Point } from "@/atlas/content/schema";

export const DEFAULT_FEATHER_PX = 16;

function pointInPolygon(x: number, y: number, poly: Point[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const hit = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** A point is lit iff fog is disabled, OR it is inside some reveal and
 *  inside no conceal. Geometry uses the strict boundary — feather is
 *  visual only (see redactFogMap). */
export function isLit(x: number, y: number, fog: FogOverlay): boolean {
  if (!fog.enabled) return true;
  const inReveal = fog.reveals.some((p) => pointInPolygon(x, y, p));
  if (!inReveal) return false;
  const inConceal = (fog.conceals ?? []).some((p) => pointInPolygon(x, y, p));
  return !inConceal;
}

/** Returns reveal and conceal polygon sets filtered to >=3 points.
 *  Used by the build-time mask rasterizer (redactFogMap) to prepare
 *  geometry for rasterization. No polygon clipping here — the mask
 *  is built by rasterizing reveals opaque, then punching conceals transparent. */
export function effectivePolygons(fog: FogOverlay): {
  reveals: Point[][]; conceals: Point[][];
} {
  const ok = (p: Point[]) => p.length >= 3;
  return {
    reveals: fog.reveals.filter(ok),
    conceals: (fog.conceals ?? []).filter(ok),
  };
}

export { pointInPolygon };
