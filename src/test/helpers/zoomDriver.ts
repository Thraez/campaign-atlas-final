// Drives R-32's `nextView` the way the canvas does: the user zooms about the
// centre, the zoom settles, the canvas asks `nextView` and swaps on a handoff.
// Counts the handoffs and records the views passed through.

import type { MapTree } from "@/atlas/ocean/mapTree";
import { nextView, type TreeView, type ViewCamera, type Viewport } from "@/atlas/ocean/zoomHandoff";

export interface Drive {
  view: TreeView;
  camera: ViewCamera;
  handoffs: number;
  /** Every view handed over to, in order. */
  trail: string[];
}

export const label = (v: TreeView) => (v.kind === "ocean" ? "ocean" : v.mapId);

export const start = (view: TreeView, camera: ViewCamera): Drive => ({
  view,
  camera,
  handoffs: 0,
  trail: [label(view)],
});

/** One settled zoom of `dz` levels about the centre, then the canvas's handoff check. */
export function zoomBy(tree: MapTree, s: Drive, dz: number, vp: Viewport): Drive {
  const camera = { center: s.camera.center, zoom: s.camera.zoom + dz };
  const r = nextView(tree, s.view, camera, vp);
  if (r.kind === "stay") return { ...s, camera };
  return {
    view: r.view,
    camera: r.camera,
    handoffs: s.handoffs + 1,
    trail: [...s.trail, label(r.view)],
  };
}

/** Zoom in steps of `dz` until `done` holds; throws after `cap` steps. */
export function zoomUntil(
  tree: MapTree,
  s: Drive,
  dz: number,
  vp: Viewport,
  done: (d: Drive) => boolean,
  cap = 400,
): Drive {
  let cur = s;
  for (let i = 0; i < cap; i++) {
    if (done(cur)) return cur;
    cur = zoomBy(tree, cur, dz, vp);
  }
  throw new Error(
    `zoomUntil: not done after ${cap} steps (at ${label(cur.view)} z${cur.camera.zoom})`,
  );
}
