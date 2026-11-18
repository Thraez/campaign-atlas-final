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
 * A pan's moveend that comes just after input (within
 * `INPUT_STOP_WINDOW_MS`) keeps the flag: wheel, pinch and double-click stop a
 * running fling, and Leaflet fires that fling's moveend before the zoom's
 * zoomstart, so it would disarm the zoom (R-40). A moveend while a zoom is in
 * flight with no zoom animation running ends that zoom: in calm mode a pinch
 * never fires zoomend (P-04 review).
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
 * Feel (P-06): a zoom whose last input was a wheel event (a mouse notch, or a
 * trackpad scroll or pinch batch) hands off one level at most (`maxSteps` 1),
 * so one notch never crosses two handoffs. Other zooms chain as before. A
 * glide (a breadcrumb or Reset, `CanvasGlide`) marks its own zoomstart; that
 * zoom, and any user input during it, ends without a handoff.
 *
 * PLAYER-SAFE: import nothing editor- or viewer-only.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import { useMap } from "react-leaflet";
import type { MapTree } from "../ocean/mapTree";
import { nextView, type TreeView, type ViewCamera } from "../ocean/zoomHandoff";
import type { Point } from "../content/schema";
import { fromLatLng } from "./canvasGeometry";
import { INPUT_STOP_WINDOW_MS, anchoredHandoff, zoomAnchor } from "./zoomAnchor";
import type { GlideControl } from "./canvasMotion";

/** DOM events that start a user zoom (or a pan, which clears on its moveend). */
const USER_INPUT = ["wheel", "touchstart", "dblclick", "keydown", "mousedown", "pointerdown"];

export function ZoomHandoff({
  tree,
  view,
  viewKey,
  viewHeight,
  fitKey,
  armed,
  glide,
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
  /** P-06: marks the zoomstart of the canvas's own glide (CanvasGlide). */
  glide?: MutableRefObject<GlideControl>;
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
    // "glide": the canvas's own glide (P-06), which never hands off.
    let zoomFrom: { zoom: number; center: Point } | "glide" | null = null;
    // When the last user input came (performance.now()).
    let inputAt = -Infinity;
    // The last input's DOM event type: a wheel step hands off one level at most (P-06).
    let inputType = "";
    const el = map.getContainer();
    const mark = (e: Event) => {
      armed.current = true;
      inputAt = performance.now();
      inputType = e.type;
    };
    for (const e of USER_INPUT) el.addEventListener(e, mark, { capture: true, passive: true });
    // The first zoomstart of a zoom counts: a calm-mode pinch past a zoom limit
    // fires a second one at touchend (`_resetView` clamps the zoom back), which
    // would read the zoom's direction from that last step.
    const onZoomStart = () => {
      if (glide?.current.flying) {
        glide.current.flying = false;
        zoomFrom = "glide";
        return;
      }
      if (zoomFrom !== null) return;
      zoomFrom = { zoom: map.getZoom(), center: fromLatLng(viewHeight, map.getCenter()) };
    };
    // The zoom has settled: hand off if the user made it.
    const finish = () => {
      const from = zoomFrom;
      zoomFrom = null;
      if (!armed.current) return;
      armed.current = false;
      // A glide, or a user zoom or drag that cut one short: no handoff.
      if (from === "glide") return;
      const { tree: t, view: v, onViewChange: report } = latest.current;
      if (!report) return;
      const size = map.getSize();
      const zoom = map.getZoom();
      const center = fromLatLng(viewHeight, map.getCenter());
      const direction =
        from === null || from.zoom === zoom ? undefined : zoom > from.zoom ? "in" : "out";
      if (from !== null && direction === undefined) return;
      const viewport = { width: size.x, height: size.y };
      // One wheel step (a notch, or a 40 ms trackpad batch) crosses one handoff at most.
      const maxSteps = inputType === "wheel" ? 1 : undefined;
      const opts = {
        direction,
        minZoom: map.getMinZoom(),
        maxZoom: map.getMaxZoom(),
        maxSteps,
      } as const;
      // The anchor first (the ground under the pointer), then the centre.
      const anchor = from && zoomAnchor(from.center, from.zoom, center, zoom, size);
      if (anchor) {
        // Keeps the anchor's ground at the same screen offset from the centre.
        const a = anchoredHandoff(t, v, anchor, zoom, size, opts);
        if (a) {
          report(a.view, a.camera);
          return;
        }
      }
      const r = nextView(t, v, { center, zoom }, viewport, opts);
      if (r.kind === "handoff") report(r.view, r.camera);
    };
    const onZoomEnd = finish;
    // Leaflet fires zoomend before moveend; a pan has only moveend, which
    // clears the flag, with two exceptions:
    // - A zoom in flight whose zoomend never comes: in calm mode
    //   (zoomAnimation off) a pinch's touchend `_resetView`s at the zoom the
    //   pinch already shows, so it fires only moveend. That moveend ends the
    //   zoom. During a running zoom animation a moveend is ignored.
    // - The moveend of a pan stopped by the input that starts a zoom (R-40):
    //   wheel, pinch and double-click call `map._stop()`, which ends a running
    //   fling with a moveend before the zoom's zoomstart. A moveend this soon
    //   after input keeps the flag; an explicit camera still clears it.
    const onMoveEnd = () => {
      if (zoomFrom !== null) {
        if (!(map as unknown as { _animatingZoom?: boolean })._animatingZoom) finish();
        return;
      }
      if (performance.now() - inputAt <= INPUT_STOP_WINDOW_MS) return;
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
  }, [map, viewKey, viewHeight, armed, glide]);

  return null;
}
