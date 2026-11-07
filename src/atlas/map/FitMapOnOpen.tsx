import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { whenMapHasSize } from "./whenMapHasSize";

/**
 * Fit the whole map to the container when a map opens or the active map
 * changes. Never re-fits on other re-renders or data changes.
 *
 * `skip` (a pending deep-link fly) marks the map as seen without fitting, so
 * the fly target wins. The fit waits until the container has a size.
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
    if (skip) {
      seenMapIdRef.current = mapId;
      return;
    }
    // Mark the map as seen only once the fit runs, so a fit cancelled while
    // the map had no size is rescheduled by the next run of this effect.
    return whenMapHasSize(map, () => {
      seenMapIdRef.current = mapId;
      map.fitBounds(
        [
          [0, 0],
          [mapHeight, mapWidth],
        ],
        { animate: false },
      );
    });
  }, [mapId, mapWidth, mapHeight, skip, map]);

  return null;
}
