import type { MapDocument, Point, SoundBed } from "@/atlas/content/schema";
import { type BBox, bboxOf, pointInPolygon, rectArea, rectIntersectArea } from "@/atlas/geometry/polygon";

export interface PreparedArea {
  id: string;
  points: Point[];
  bbox: BBox;
  bboxArea: number;
  bed: SoundBed;
}

/** Fraction of the screen an area must cover before it can play. */
export const FILL_MIN = 0.5;
/** Stickiness: the active area is kept until coverage falls below FILL_MIN×this. */
export const HYSTERESIS = 0.85;

export function prepareAreas(map: MapDocument): PreparedArea[] {
  const areas = map.soundscape?.areas ?? [];
  const regionPoints = new Map<string, Point[]>();
  for (const r of map.regions ?? []) regionPoints.set(r.id, r.points);

  const out: PreparedArea[] = [];
  for (const a of areas) {
    const points = a.points ?? (a.regionId ? regionPoints.get(a.regionId) : undefined);
    if (!points || points.length < 3) continue;
    const bbox = bboxOf(points);
    if (!bbox) continue;
    out.push({ id: a.id, points, bbox, bboxArea: rectArea(bbox), bed: a.bed });
  }
  return out;
}

/** A viewport rectangle in map coords (same shape as a BBox). */
export type ViewRect = BBox;

/**
 * The active bed = the smallest eligible area whose polygon contains the screen
 * centre and which covers at least FILL_MIN of the screen. Nesting falls out of
 * "smallest wins". Hysteresis keeps the previous winner sticky at the boundary.
 * Pure: callers pass plain numbers (see readViewport).
 */
export function selectActiveBed(
  areas: PreparedArea[],
  cx: number,
  cy: number,
  view: ViewRect,
  prevId: string | null,
): string | null {
  const viewArea = rectArea(view);
  if (viewArea <= 0) return prevId;

  const coverage = (a: PreparedArea) => rectIntersectArea(a.bbox, view) / viewArea;
  const contains = (a: PreparedArea) => pointInPolygon(cx, cy, a.points);

  const eligible = areas.filter((a) => contains(a) && coverage(a) >= FILL_MIN);

  if (eligible.length === 0) {
    // Dead-band: keep the previous winner if it is still close to eligible.
    const prev = prevId ? areas.find((a) => a.id === prevId) : undefined;
    if (prev && contains(prev) && coverage(prev) >= FILL_MIN * HYSTERESIS) return prevId;
    return null;
  }

  eligible.sort((a, b) => a.bboxArea - b.bboxArea || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const smallest = eligible[0];

  // Keep the previous winner if nothing strictly smaller has become eligible,
  // so equal-size siblings don't flicker as the camera nudges across a border.
  if (prevId && prevId !== smallest.id) {
    const prev = eligible.find((a) => a.id === prevId);
    if (prev && smallest.bboxArea >= prev.bboxArea) return prevId;
  }
  return smallest.id;
}
