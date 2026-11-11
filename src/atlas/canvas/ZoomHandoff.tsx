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
 * The zoom's direction (zoom at zoomstart against zoomend) and the map's zoom
 * limits go to `nextView`: a zoom in only enters, a zoom out only leaves.
 *
 * PLAYER-SAFE: import nothing editor- or viewer-only.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
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
    let zoomFrom: number | null = null;
    const el = map.getContainer();
    const mark = () => {
      armed.current = true;
    };
    for (const e of USER_INPUT) el.addEventListener(e, mark, { capture: true, passive: true });
    const onZoomStart = () => {
      zoomFrom = map.getZoom();
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
      const camera = { center: fromLatLng(viewHeight, map.getCenter()), zoom };
      const direction = from === null || from === zoom ? undefined : zoom > from ? "in" : "out";
      if (from !== null && direction === undefined) return;
      const r = nextView(
        t,
        v,
        camera,
        { width: size.x, height: size.y },
        {
          direction,
          minZoom: map.getMinZoom(),
          maxZoom: map.getMaxZoom(),
        },
      );
      if (r.kind === "handoff") report(r.view, r.camera);
    };
    // Leaflet fires zoomend before moveend; a pan has only moveend.
    const onMoveEnd = () => {
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
