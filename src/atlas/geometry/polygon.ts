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
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const hit = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function bboxOf(points: Point[]): BBox | null {
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
