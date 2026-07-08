/**
 * Pure map-space geometry helpers for the player viewer.
 *
 * Extracted from AtlasViewer so the coordinate math — grid-line generation,
 * route distance, travel-time formatting — can be unit-tested in isolation.
 * Leaflet is imported type-only: this module does no rendering and carries no
 * runtime leaflet/react dependency.
 */
import type { LatLngExpression } from "leaflet";
import type { GridOverlay, MapDocument, Point } from "@/atlas/content/schema";

/** Human phrasing for a route's travel mode, e.g. "on foot". */
export const ROUTE_MODE_LABEL: Record<string, string> = {
  foot: "on foot",
  horse: "on horseback",
  ship: "by ship",
  cart: "by cart",
  fly: "flying",
  custom: "",
};

/** Total polyline length in map pixels (sum of segment lengths). */
export function routeDistancePx(points: Point[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    d += Math.hypot(dx, dy);
  }
  return d;
}

/** Format a duration in hours as "N min" / "N h" / "N days" for route tooltips. */
export function formatTravelTime(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${hours.toFixed(hours < 4 ? 1 : 0)} h`;
  const days = hours / 24;
  return `${days.toFixed(days < 4 ? 1 : 0)} days`;
}

/**
 * Generate the grid overlay lines for a map in Leaflet lat/lng space
 * (lat = height - y, the flat-CRS convention used by the viewer).
 * Square grids emit vertical + horizontal lines; hex grids emit one closed
 * pointy-top hexagon polyline per cell.
 */
export function gridLines(map: MapDocument, grid: GridOverlay): LatLngExpression[][] {
  const lines: LatLngExpression[][] = [];
  if (grid.kind === "square") {
    for (let x = 0; x <= map.width; x += grid.size) {
      lines.push([
        [0, x],
        [map.height, x],
      ]);
    }
    for (let y = 0; y <= map.height; y += grid.size) {
      lines.push([
        [y, 0],
        [y, map.width],
      ]);
    }
    return lines;
  }
  // pointy-top hex grid
  const r = grid.size;
  const w = Math.sqrt(3) * r;
  const h = 2 * r;
  const dy = (3 / 4) * h;
  for (let row = 0, py = 0; py <= map.height + h; row++, py = row * dy) {
    const offset = row % 2 === 0 ? 0 : w / 2;
    for (let px = -offset; px <= map.width + w; px += w) {
      const cx = px + w / 2;
      const cy = py;
      const verts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 3) * i - Math.PI / 2;
        const vx = cx + r * Math.cos(ang);
        const vy = cy + r * Math.sin(ang);
        verts.push([map.height - vy, vx]);
      }
      verts.push(verts[0]);
      lines.push(verts);
    }
  }
  return lines;
}
