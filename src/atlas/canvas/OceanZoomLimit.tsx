import type { Map } from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { whenMapHasSize } from "../map/whenMapHasSize";

/** How far below the fit-all zoom the ocean lets the user zoom out. */
export const OCEAN_ZOOM_OUT_MARGIN = 1;

/** The canvas's floor for maps; the ocean raises it (`AtlasCanvas` `minZoom`). */
export const CANVAS_MIN_ZOOM = -6;

/**
 * The ocean's minimum zoom: a little below the zoom that fits `fitWidth` x
 * `fitHeight` in `size`. CRS.Simple: pixels = units * 2^zoom. Never lower
 * than the canvas floor; null when there is nothing to compute from.
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
 * Stops the ocean zooming out to a few pixels (the R-36 playtest reached
 * zoom -5.7): its floor is `oceanMinZoom`, recomputed when the map resizes.
 * Other views get the canvas floor back; `FitMapOnOpen` lowers it again if a
 * map would not fit above it. Place before `CanvasCamera` (so a handed-over
 * camera is clamped, not bounced) and before `FitMapOnOpen`.
 */
export function OceanZoomLimit({
  ocean,
  fitWidth,
  fitHeight,
  viewKey,
}: {
  ocean: boolean;
  fitWidth: number;
  fitHeight: number;
  viewKey: string;
}) {
  const map = useMap();
  useEffect(() => {
    if (!ocean) {
      setFloor(map, CANVAS_MIN_ZOOM);
      return;
    }
    const apply = () => {
      const size = map.getSize();
      if (!(size.x > 0 && size.y > 0)) return;
      const min = oceanMinZoom(size, fitWidth, fitHeight);
      if (min !== null) setFloor(map, min);
    };
    const cancel = whenMapHasSize(map, apply);
    map.on("resize", apply);
    return () => {
      cancel();
      map.off("resize", apply);
    };
  }, [map, ocean, fitWidth, fitHeight, viewKey]);
  return null;
}
