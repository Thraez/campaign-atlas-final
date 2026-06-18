import type { FogOverlay } from "@/atlas/content/schema";
import { pointInPolygon } from "@/atlas/geometry/polygon";

export const DEFAULT_FEATHER_PX = 16;

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
