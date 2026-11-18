/**
 * The canvas's glide (P-06): a breadcrumb click or the Reset button moves the
 * camera with a short `flyTo` / `flyToBounds` (`GLIDE_SECONDS`) instead of a
 * jump, so the player sees where they went. Calm mode and the OS's reduced
 * motion setting keep the jump.
 *
 * The caller asks by bumping `AtlasCanvas`'s `glide` counter in the same
 * update as the camera or view change. `GlideRequest` (the canvas's first
 * child, so its effect runs before the others in the commit) turns the bump
 * into a one-commit request; `CanvasCamera` (an explicit camera) or the fit
 * (`FitMapOnOpen`'s `fit`) takes it. A request nobody takes is dropped after
 * the commit.
 *
 * A crumb always shows another view (an ancestor). Sequence: cut to the
 * ancestor at the camera showing the same ground as now (`ancestorCamera`,
 * what a zoom hand-back would land on), then glide in the ancestor's pixels
 * to its camera (remembered, or fitted). A view change that is not up the
 * tree jumps.
 *
 * A glide is the canvas's own move, never a handoff: the explicit camera has
 * already cleared the user-input flag, and `flying` tells `ZoomHandoff` that
 * the zoomstart it is about to see is the glide's, so the glide (landed, or
 * stopped by a drag) ends without a handoff. A wheel or pinch that stops it
 * is a zoom of its own and hands off as usual (ZoomHandoff).
 *
 * PLAYER-SAFE: import nothing editor- or viewer-only.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import { useMap } from "react-leaflet";
import type { MapTree } from "../ocean/mapTree";
import type { TreeView, ViewCamera } from "../ocean/zoomHandoff";
import { fromLatLng } from "./canvasGeometry";
import { ancestorCamera, type GlideControl } from "./canvasMotion";

export function GlideRequest({
  tree,
  view,
  viewKey,
  viewHeight,
  glide,
  reduceMotion,
  control,
}: {
  tree: MapTree;
  view: TreeView;
  viewKey: string;
  viewHeight: number;
  /** The caller's counter; a change asks this commit's camera move to glide. */
  glide: number;
  reduceMotion: boolean;
  control: MutableRefObject<GlideControl>;
}) {
  const map = useMap();
  const shown = useRef({ view, viewKey, viewHeight });
  const seen = useRef(glide);
  useEffect(() => {
    // The view on screen until this commit's moves (this effect runs first).
    const before = shown.current;
    shown.current = { view, viewKey, viewHeight };
    if (seen.current === glide) return;
    seen.current = glide;
    if (reduceMotion) return;
    let start: ViewCamera | null = null;
    if (before.viewKey !== viewKey) {
      const size = map.getSize();
      if (!(size.x > 0 && size.y > 0)) return;
      const now = { center: fromLatLng(before.viewHeight, map.getCenter()), zoom: map.getZoom() };
      start = ancestorCamera(tree, before.view, now, view);
      if (!start || ![start.center[0], start.center[1], start.zoom].every(Number.isFinite)) return;
    }
    control.current.request = { start };
    // Only this commit's move glides.
    queueMicrotask(() => {
      control.current.request = null;
    });
  }, [map, tree, view, viewKey, viewHeight, glide, reduceMotion, control]);
  return null;
}
