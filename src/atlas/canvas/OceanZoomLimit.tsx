import type { Map } from "leaflet";
import { useEffect, type MutableRefObject } from "react";
import { useMap } from "react-leaflet";
import type { Point } from "../content/schema";
import { whenMapHasSize } from "../map/whenMapHasSize";
import { fromLatLng, toLatLng } from "./canvasGeometry";
import { GLIDE_SECONDS } from "./canvasMotion";

/**
 * How far below the fit-all zoom the ocean lets the user zoom out. Zero since
 * Q-01: the floor is the ocean fit itself (R-36 had one level below it, so the
 * wheel went past the view first load, the crumb and Reset show).
 */
export const OCEAN_ZOOM_OUT_MARGIN = 0;

/** The canvas's floor for maps; the ocean raises it (`AtlasCanvas` `minZoom`). */
export const CANVAS_MIN_ZOOM = -6;

/** Zooms this close count as the same (the floor and a fit computed from it). */
const SAME_ZOOM = 1e-6;

/** A camera less than this many screen px off the fit's centre is on it. */
const SAME_CENTRE_PX = 1;

/**
 * The ocean's minimum zoom: the zoom that fits `fitWidth` x `fitHeight` in
 * `size` (less `OCEAN_ZOOM_OUT_MARGIN`). CRS.Simple: pixels = units * 2^zoom.
 * Never lower than the canvas floor; null when there is nothing to compute from.
 */
export function oceanMinZoom(
  size: { x: number; y: number },
  fitWidth: number,
  fitHeight: number,
): number | null {
  const ratio = Math.min(size.x / fitWidth, size.y / fitHeight);
  const fit = Math.log2(ratio);
  if (!Number.isFinite(fit)) return null;
  return Math.max(CANVAS_MIN_ZOOM, fit - OCEAN_ZOOM_OUT_MARGIN);
}

/**
 * Set the floor without Leaflet's `setMinZoom`, which calls an animated
 * `setZoom(floor)` when the floor rises above the current zoom (a visible
 * bounce). Leaflet's own `getMinZoom` reads `options.minZoom`; `zoomlevelschange`
 * tells the controls. `setView`/`fitBounds` then clamp to it without animation,
 * and a zoom already below the floor is moved to it at once.
 */
function setFloor(map: Map, min: number) {
  map.options.minZoom = min;
  map.fire("zoomlevelschange");
  if (map.getZoom() < min) map.setZoom(min, { animate: false });
}

/**
 * Stops the ocean zooming out past its fit (R-36, Q-01): the floor is
 * `oceanMinZoom`, the same zoom as the ocean fit (`oceanFitBox`) that first
 * load, the Ocean crumb and Reset show, recomputed when the map resizes.
 *
 * One ocean view (Q-01): at the floor the camera is the fit.
 * - A zoom that settles at the floor (a wheel, pinch, keyboard or zoom-button
 *   zoom-out, or a hand-back from a map clamped to it) slides to the fit's
 *   centre (`GLIDE_SECONDS`; a jump in calm mode). The fit, Reset and the
 *   crumb land there already, so they don't move.
 * - A resize (the window, the side panel) while the camera is at the floor
 *   re-fits: new floor, fit centre, no animation. Elsewhere the zoom is only
 *   raised to a floor that rose above it, as before.
 * These are the canvas's own moves: they clear the user-input flag (`armed`),
 * so they never hand off.
 *
 * Other views get the canvas floor back; `FitMapOnOpen` lowers it again if a
 * map would not fit above it. Place before `CanvasCamera` (so a handed-over
 * camera is clamped, not bounced) and before `FitMapOnOpen`.
 */
export function OceanZoomLimit({
  ocean,
  fitWidth,
  fitHeight,
  fitCenter,
  viewHeight,
  viewKey,
  reduceMotion = false,
  armed,
}: {
  ocean: boolean;
  fitWidth: number;
  fitHeight: number;
  /** The fit box's centre in the view's pixels; without it the floor is only a floor. */
  fitCenter?: Point;
  viewHeight?: number;
  viewKey: string;
  reduceMotion?: boolean;
  /** ZoomHandoff's user-input flag, cleared before this moves the map. */
  armed?: MutableRefObject<boolean>;
}) {
  const map = useMap();
  const cx = fitCenter?.[0];
  const cy = fitCenter?.[1];
  useEffect(() => {
    if (!ocean) {
      setFloor(map, CANVAS_MIN_ZOOM);
      return;
    }
    const centre: Point | null =
      cx !== undefined && cy !== undefined && viewHeight !== undefined ? [cx, cy] : null;
    let floor: number | null = null;
    const atFloor = () => floor !== null && map.getZoom() <= floor + SAME_ZOOM;
    const offCentre = (c: Point) => {
      const now = fromLatLng(viewHeight!, map.getCenter());
      const k = 2 ** map.getZoom();
      return Math.hypot(now[0] - c[0], now[1] - c[1]) * k >= SAME_CENTRE_PX;
    };
    const apply = () => {
      const size = map.getSize();
      if (!(size.x > 0 && size.y > 0)) return;
      const min = oceanMinZoom(size, fitWidth, fitHeight);
      if (min === null) return;
      const wasAtFloor = atFloor();
      floor = min;
      if (wasAtFloor && centre) {
        // The fit stays the fit across a resize.
        map.options.minZoom = min;
        map.fire("zoomlevelschange");
        if (armed) armed.current = false;
        map.setView(toLatLng(viewHeight!, centre), min, { animate: false });
        return;
      }
      if (map.getZoom() < min && armed) armed.current = false;
      setFloor(map, min);
    };
    // A zoom that settles at the floor ends on the fit (after ZoomHandoff's
    // own zoomend listener, which is attached first).
    const settle = () => {
      if (!centre || !atFloor() || !offCentre(centre)) return;
      if (armed) armed.current = false;
      map.panTo(toLatLng(viewHeight!, centre), {
        animate: !reduceMotion,
        duration: GLIDE_SECONDS,
      });
    };
    const cancel = whenMapHasSize(map, apply);
    map.on("resize", apply);
    map.on("zoomend", settle);
    return () => {
      cancel();
      map.off("resize", apply);
      map.off("zoomend", settle);
    };
  }, [map, ocean, fitWidth, fitHeight, cx, cy, viewHeight, viewKey, reduceMotion, armed]);
  return null;
}
