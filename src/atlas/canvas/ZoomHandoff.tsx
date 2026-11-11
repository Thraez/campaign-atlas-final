/**
 * The shared canvas's zoom handoff (R-32): after a zoom the user made (wheel,
 * pinch, double-click, keyboard, the zoom buttons) settles, asks the pure
 * `nextView` whether to show another view of the tree, and if so hands the
 * new view and its camera to the caller. The swap itself is the caller's
 * (AtlasCanvas is controlled): it renders the new view and camera, and
 * CanvasCamera applies that camera without animation, so the same ground
 * stays under the centre.
 *
 * A move the canvas makes itself (a fit, an explicit camera) never hands off:
 * only a zoom that follows a user input event on the map does. A new view
 * starts with no pending input.
 *
 * PLAYER-SAFE: import nothing editor- or viewer-only.
 */
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { MapTree } from "../ocean/mapTree";
import { nextView, type TreeView, type ViewCamera } from "../ocean/zoomHandoff";
import { fromLatLng } from "./canvasGeometry";

/** DOM events that start a user zoom (or a pan, which clears on its moveend). */
const USER_INPUT = ["wheel", "touchstart", "dblclick", "keydown", "mousedown", "pointerdown"];

export function ZoomHandoff({
  tree,
  view,
  viewKey,
  viewHeight,
  onViewChange,
}: {
  tree: MapTree;
  view: TreeView;
  /** Changes whenever the view (and so the coordinate space) changes. */
  viewKey: string;
  viewHeight: number;
  onViewChange?: (view: TreeView, camera: ViewCamera) => void;
}) {
  const map = useMap();
  const latest = useRef({ tree, view, onViewChange });
  useEffect(() => {
    latest.current = { tree, view, onViewChange };
  });

  useEffect(() => {
    let userInput = false;
    const el = map.getContainer();
    const mark = () => {
      userInput = true;
    };
    for (const e of USER_INPUT) el.addEventListener(e, mark, { capture: true, passive: true });
    const onZoomEnd = () => {
      if (!userInput) return;
      userInput = false;
      const { tree: t, view: v, onViewChange: report } = latest.current;
      if (!report) return;
      const size = map.getSize();
      const camera = { center: fromLatLng(viewHeight, map.getCenter()), zoom: map.getZoom() };
      const r = nextView(t, v, camera, { width: size.x, height: size.y });
      if (r.kind === "handoff") report(r.view, r.camera);
    };
    // Leaflet fires zoomend before moveend; a pan has only moveend.
    const onMoveEnd = () => {
      userInput = false;
    };
    map.on("zoomend", onZoomEnd);
    map.on("moveend", onMoveEnd);
    return () => {
      for (const e of USER_INPUT) el.removeEventListener(e, mark, { capture: true });
      map.off("zoomend", onZoomEnd);
      map.off("moveend", onMoveEnd);
    };
  }, [map, viewKey, viewHeight]);

  return null;
}
