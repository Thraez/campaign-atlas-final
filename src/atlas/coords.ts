import { WorldSettings } from "./types";

// World coords to Leaflet LatLng (CRS.Simple).
// We use [y_inverted, x] so Y=0 is top of world and Y=height is bottom.
export const w2ll = (world: WorldSettings, x: number, y: number): [number, number] => [
  world.height - y,
  x,
];
export const ll2w = (world: WorldSettings, lat: number, lng: number): [number, number] => [
  lng,
  world.height - lat,
];

export const worldBounds = (w: WorldSettings): [[number, number], [number, number]] => [
  [0, 0],
  [w.height, w.width],
];

// Shortest horizontal distance considering wrap
export function worldDistance(w: WorldSettings, ax: number, ay: number, bx: number, by: number): number {
  let dx = Math.abs(bx - ax);
  if (w.wrapX) dx = Math.min(dx, w.width - dx);
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function worldUnitsToKm(w: WorldSettings, units: number): number {
  return units * w.kmPerWorldUnit;
}

// Clamp a point so it stays within world bounds. Wrap X if enabled.
export function clampPoint(w: WorldSettings, x: number, y: number): [number, number] {
  let cx = x;
  if (w.wrapX) {
    cx = ((x % w.width) + w.width) % w.width;
  } else {
    cx = Math.max(0, Math.min(w.width, x));
  }
  const cy = Math.max(0, Math.min(w.height, y));
  return [cx, cy];
}

const finiteOr = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;

// Normalize a layer frame so its full rectangle stays inside the flat world.
// Layers never wrap like globe tiles: if they cross an edge, dragging/resizing
// clamps the whole image back into the authored world area.
export function normalizeLayerFrame(
  w: WorldSettings,
  frame: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  const worldWidth = Math.max(1, finiteOr(w.width, 1));
  const worldHeight = Math.max(1, finiteOr(w.height, 1));
  const width = Math.min(worldWidth, Math.max(1, finiteOr(frame.width, 1)));
  const height = Math.min(worldHeight, Math.max(1, finiteOr(frame.height, 1)));
  const x = Math.max(0, Math.min(worldWidth - width, finiteOr(frame.x, 0)));
  const y = Math.max(0, Math.min(worldHeight - height, finiteOr(frame.y, 0)));
  return { x, y, width, height };
}

// Returns one or two world-space line segments connecting (ax,ay)→(bx,by),
// taking the shortest horizontal path when the world wraps in X. When the
// wrapped path is shorter, the connection is split into two segments that
// exit one edge and re-enter the opposite edge at the interpolated Y.
export function shortestPathSegments(
  w: WorldSettings,
  ax: number, ay: number, bx: number, by: number
): [number, number][][] {
  if (!w.wrapX) return [[[ax, ay], [bx, by]]];
  const direct = Math.abs(bx - ax);
  const wrapped = w.width - direct;
  if (direct <= wrapped) return [[[ax, ay], [bx, by]]];
  // Wrap path: travel opposite direction. Compute Y at the seam crossing.
  const dir = bx >= ax ? -1 : 1; // -1 means exit left edge, +1 exit right
  const exitX = dir > 0 ? w.width : 0;
  const enterX = dir > 0 ? 0 : w.width;
  const distToEdge = dir > 0 ? (w.width - ax) : ax;
  const t = wrapped > 0 ? distToEdge / wrapped : 0;
  const yEdge = ay + (by - ay) * t;
  return [
    [[ax, ay], [exitX, yEdge]],
    [[enterX, yEdge], [bx, by]],
  ];
}

export const clampLayerCenter = (
  w: WorldSettings,
  x: number, y: number, width: number, height: number
): { x: number; y: number } => {
  const frame = normalizeLayerFrame(w, { x, y, width, height });
  return { x: frame.x, y: frame.y };
};
