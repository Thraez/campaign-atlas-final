import type { LatLngBoundsLiteral } from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { whenMapHasSize } from "./whenMapHasSize";

/**
 * Fit the whole map to the container when a map opens or the active map
 * changes. Never re-fits on other re-renders or data changes.
 *
 * `skip` (a pending deep-link fly) leaves the view alone so the fly target
 * wins. The min zoom is lowered if the whole map would not fit above it. The fit waits until the container has a size.
 *
 * Player-safe: no editor imports. Used by the viewer and the editor.
 */
export function FitMapOnOpen({
  mapId,
  mapWidth,
  mapHeight,
  skip = false,
}: {
  mapId: string;
  mapWidth: number;
  mapHeight: number;
  skip?: boolean;
}) {
  const map = useMap();
  const seenMapIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (seenMapIdRef.current === mapId) return;
    // Mark the map as seen only once this runs, so a run cancelled while the
    // map had no size is rescheduled by the next run of this effect.
    return whenMapHasSize(map, () => {
      seenMapIdRef.current = mapId;
      const bounds: LatLngBoundsLiteral = [
        [0, 0],
        [mapHeight, mapWidth],
      ];
      // fitBounds is clamped by minZoom; a huge map needs a lower floor to fit.
      // Also done on a deep-link open so its zoom (cz) below the floor survives.
      const fitZoom = map.getBoundsZoom(bounds);
      if (Number.isFinite(fitZoom) && fitZoom < map.getMinZoom()) map.setMinZoom(fitZoom);
      if (!skip) map.fitBounds(bounds, { animate: false });
    });
  }, [mapId, mapWidth, mapHeight, skip, map]);

  return null;
}
