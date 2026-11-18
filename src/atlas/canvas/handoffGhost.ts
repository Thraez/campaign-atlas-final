/**
 * The soft handoff's maths (P-05). Pure: no React, no Leaflet.
 *
 * At a zoom handoff the canvas keeps a still copy of the old view's pictures
 * (the "ghost") and fades it out over the new view. The ghost is placed in the
 * new view's own pixels: the box the screen covers at the handed-over camera.
 * A handoff camera shows the same ground as the old one (`nextView`), so at
 * that camera the ghost sits exactly where the old pictures were, and the new
 * view's pictures sit under it where the old view drew them: a child map's
 * picture lands on its frame, a parent's picture around the child. Because the
 * ghost is ground in the new view, not a fixed screen image, it stays on that
 * ground if Leaflet clamps the zoom or the user pans or zooms during the fade.
 *
 * PLAYER-SAFE: import nothing editor- or viewer-only.
 */
import type { Point } from "../content/schema";
import type { Box } from "./canvasGeometry";

/** How long the old pictures take to fade out over the new ones. */
export const HANDOFF_FADE_MS = 250;

/**
 * How long the ghost waits, fully shown, for the new view's pictures to
 * finish loading before it fades anyway (a first visit fetches the child's
 * picture). A load error counts as done.
 */
export const HANDOFF_LOAD_WAIT_MS = 400;

/** A camera in a view's own pixels and Leaflet zoom (screen px = view px x 2^zoom). */
export interface GhostCamera {
  center: Point;
  zoom: number;
}

/** The box, in view pixels, that a `size` screen covers at `camera`. */
export function ghostBox(camera: GhostCamera, size: { x: number; y: number }): Box {
  const k = 2 ** -camera.zoom;
  const hw = (size.x / 2) * k;
  const hh = (size.y / 2) * k;
  const [cx, cy] = camera.center;
  return { minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh };
}

/** Where a view-pixel box shows on a `size` screen at `camera`: [x, y, width, height] in px. */
export function screenRect(
  box: Box,
  camera: GhostCamera,
  size: { x: number; y: number },
): [number, number, number, number] {
  const s = 2 ** camera.zoom;
  const x = (box.minX - camera.center[0]) * s + size.x / 2;
  const y = (box.minY - camera.center[1]) * s + size.y / 2;
  return [x, y, (box.maxX - box.minX) * s, (box.maxY - box.minY) * s];
}
