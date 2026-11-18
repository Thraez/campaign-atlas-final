/**
 * The zoom handoff's pure helpers (`ZoomHandoff`): the zoom's anchor, the
 * limits a view will have once shown, and how soon after input a pan's
 * moveend still belongs to that input. Kept out of the component file.
 *
 * PLAYER-SAFE: import nothing editor- or viewer-only.
 */
import type { MapTree } from "../ocean/mapTree";
import type { TreeView } from "../ocean/zoomHandoff";
import type { Point } from "../content/schema";
import { oceanFitBox } from "./canvasGeometry";
import { CANVAS_MIN_ZOOM, oceanMinZoom } from "./OceanZoomLimit";

/**
 * How soon after user input a pan's moveend still belongs to that input (the
 * fling a wheel, pinch or double-click stops). Leaflet's wheel zoom waits up to
 * 40 ms (`wheelDebounceTime`) before it stops the pan; a pinch and a
 * double-click stop it at once. A keyboard pan animates for 250 ms, so its own
 * moveend still clears the flag.
 */
export const INPUT_STOP_WINDOW_MS = 150;

/**
 * The zoom limits `view` will have once shown: the ocean's floor
 * (`OceanZoomLimit`), else the canvas floor; `maxZoom` above.
 */
export function viewZoomLimits(
  tree: MapTree,
  view: TreeView,
  size: { x: number; y: number },
  maxZoom: number,
): [number, number] {
  if (view.kind === "ocean" && tree.ocean) {
    const box = oceanFitBox(tree);
    const w = box ? box.maxX - box.minX : tree.ocean.width;
    const h = box ? box.maxY - box.minY : tree.ocean.height;
    return [oceanMinZoom(size, w, h) ?? CANVAS_MIN_ZOOM, maxZoom];
  }
  return [CANVAS_MIN_ZOOM, maxZoom];
}

/**
 * The zoom's anchor: the view point that sat at the same screen point before
 * and after a zoom from (`c0`, `z0`) to (`c1`, `z1`) (Leaflet's wheel and
 * double-click zoom about the pointer, a pinch about its centre), and its
 * screen offset from the centre. A zoom about the centre gives the centre.
 * Null when there is no such point on the screen (no zoom change, or a pan
 * moved the map during the zoom): the caller then uses the centre.
 * Screen px = view px * 2^zoom; both are measured from the centre.
 */
export function zoomAnchor(
  c0: Point,
  z0: number,
  c1: Point,
  z1: number,
  size: { x: number; y: number },
): { point: Point; offset: Point } | null {
  const d = 2 ** -z0 - 2 ** -z1;
  if (!Number.isFinite(d) || Math.abs(d) < 1e-12) return null;
  const offset: Point = [(c1[0] - c0[0]) / d, (c1[1] - c0[1]) / d];
  // A pixel of slack for rounding at the edge.
  if (Math.abs(offset[0]) > size.x / 2 + 1 || Math.abs(offset[1]) > size.y / 2 + 1) return null;
  const k0 = 2 ** -z0;
  return { point: [c0[0] + offset[0] * k0, c0[1] + offset[1] * k0], offset };
}
