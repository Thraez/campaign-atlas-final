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
 * Stops the ocean zooming out to a few pixels (the R-36 playtest reached
 * zoom -5.7): its floor is `oceanMinZoom`. Other views get the canvas floor
 * back; `FitMapOnOpen` lowers it again if a map would not fit above it.
 * Place before `FitMapOnOpen` so the fit sees the right floor.
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
      map.setMinZoom(CANVAS_MIN_ZOOM);
      return;
    }
    return whenMapHasSize(map, () => {
      const min = oceanMinZoom(map.getSize(), fitWidth, fitHeight);
      if (min !== null) map.setMinZoom(min);
    });
  }, [map, ocean, fitWidth, fitHeight, viewKey]);
  return null;
}
