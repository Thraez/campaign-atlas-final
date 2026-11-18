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
 * only a zoom that follows a user input event on the map does. Input arms a
 * flag; a pan's moveend, a new view, a new fit request and every explicit
 * camera the canvas applies (`disarm`, from CanvasCamera) clear it. So a click
 * or a Tab that moves nothing can't make the caller's next move a handoff.
 * Callers move the map through `camera`; a layer that calls `map.setView`
 * itself bypasses the disarm.
 *
 * A pan's moveend that lands while a zoom is in flight (between zoomstart and
 * zoomend, a fling's inertia) is ignored, so it can't disarm that zoom (R-40).
 *
 * The zoom's direction (zoom at zoomstart against zoomend) and the map's zoom
 * limits go to `nextView`: a zoom in only enters, a zoom out only leaves.
 *
 * The anchor (P-04): a wheel, double-click or pinch zooms about the pointer,
 * not the centre, so zooming at a child frame's edge slides the frame off the
 * centre and the zoom dead-ended at max zoom with the frame under the cursor.
 * `nextView` is asked first about the zoom's anchor (`zoomAnchor`: the ground
 * that stayed put on screen), then, if that stays, about the centre as before.
 * A handoff found by the anchor keeps the anchor's ground under the same
 * screen point. A zoom about the centre (keyboard, buttons) has the centre as
 * its anchor, so it behaves exactly as before.
 *
 * PLAYER-SAFE: import nothing editor- or viewer-only.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import { useMap } from "react-leaflet";
import type { MapTree } from "../ocean/mapTree";
import { nextView, type TreeView, type ViewCamera } from "../ocean/zoomHandoff";
import type { Point } from "../content/schema";
import { fromLatLng } from "./canvasGeometry";

/** DOM events that start a user zoom (or a pan, which clears on its moveend). */
const USER_INPUT = ["wheel", "touchstart", "dblclick", "keydown", "mousedown", "pointerdown"];

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

export function ZoomHandoff({
  tree,
  view,
  viewKey,
  viewHeight,
  fitKey,
  armed,
  onViewChange,
}: {
  tree: MapTree;
  view: TreeView;
  /** Changes whenever the view (and so the coordinate space) changes. */
  viewKey: string;
  viewHeight: number;
  /** Changes on every fit request: a fit is the canvas's move, not the user's. */
  fitKey: string;
  /** The user-input flag, shared with AtlasCanvas so CanvasCamera can clear it. */
  armed: MutableRefObject<boolean>;
  onViewChange?: (view: TreeView, camera: ViewCamera) => void;
}) {
  const map = useMap();
  const latest = useRef({ tree, view, onViewChange });
  useEffect(() => {
    latest.current = { tree, view, onViewChange };
  });

  // A new fit request is the canvas's own move.
  useEffect(() => {
    armed.current = false;
  }, [armed, fitKey]);

  useEffect(() => {
    armed.current = false;
    // The zoom in flight: its zoom and centre at zoomstart; null between zooms.
    let zoomFrom: { zoom: number; center: Point } | null = null;
    const el = map.getContainer();
    const mark = () => {
      armed.current = true;
    };
    for (const e of USER_INPUT) el.addEventListener(e, mark, { capture: true, passive: true });
    const onZoomStart = () => {
      zoomFrom = { zoom: map.getZoom(), center: fromLatLng(viewHeight, map.getCenter()) };
    };
    const onZoomEnd = () => {
      const from = zoomFrom;
      zoomFrom = null;
      if (!armed.current) return;
      armed.current = false;
      const { tree: t, view: v, onViewChange: report } = latest.current;
      if (!report) return;
      const size = map.getSize();
      const zoom = map.getZoom();
      const center = fromLatLng(viewHeight, map.getCenter());
      const direction =
        from === null || from.zoom === zoom ? undefined : zoom > from.zoom ? "in" : "out";
      if (from !== null && direction === undefined) return;
      const viewport = { width: size.x, height: size.y };
      const opts = { direction, minZoom: map.getMinZoom(), maxZoom: map.getMaxZoom() } as const;
      // The anchor first (the ground under the pointer), then the centre.
      const anchor = from && zoomAnchor(from.center, from.zoom, center, zoom, size);
      if (anchor) {
        const r = nextView(t, v, { center: anchor.point, zoom }, viewport, opts);
        if (r.kind === "handoff") {
          // Keep the anchor's ground at the same screen offset from the centre.
          const k = 2 ** -r.camera.zoom;
          const c = r.camera.center;
          report(r.view, {
            center: [c[0] - anchor.offset[0] * k, c[1] - anchor.offset[1] * k],
            zoom: r.camera.zoom,
          });
          return;
        }
      }
      const r = nextView(t, v, { center, zoom }, viewport, opts);
      if (r.kind === "handoff") report(r.view, r.camera);
    };
    // Leaflet fires zoomend before moveend; a pan has only moveend. A pan's
    // moveend during a zoom (a fling ending mid-zoom) leaves that zoom armed.
    const onMoveEnd = () => {
      if (zoomFrom !== null) return;
      armed.current = false;
    };
    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);
    map.on("moveend", onMoveEnd);
    return () => {
      for (const e of USER_INPUT) el.removeEventListener(e, mark, { capture: true });
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomEnd);
      map.off("moveend", onMoveEnd);
    };
  }, [map, viewKey, viewHeight, armed]);

  return null;
}
