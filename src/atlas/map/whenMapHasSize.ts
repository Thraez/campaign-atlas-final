import type { Map as LeafletMap } from "leaflet";

type SizedMap = Pick<LeafletMap, "getSize" | "on" | "off" | "invalidateSize" | "getContainer">;

function hasSize(map: SizedMap): boolean {
  const size = map.getSize();
  return size.x > 0 && size.y > 0;
}

/**
 * Run `fn` once the map has a non-zero size; returns a cleanup that cancels
 * a pending run.
 *
 * A hidden container (e.g. a collapsed preview pane) has zero size, and
 * Leaflet's flyTo/setView/fitBounds then project to NaN and throw. While the
 * map has no size this waits for Leaflet's `resize` event; a ResizeObserver on
 * the container calls `invalidateSize`, which fires `resize` once the
 * container is shown again.
 *
 * Player-safe: no editor imports. The editor may use it too.
 */
export function whenMapHasSize(map: SizedMap, fn: () => void): () => void {
  if (hasSize(map)) {
    fn();
    return () => {};
  }
  const onResize = () => {
    if (!hasSize(map)) return;
    cleanup();
    fn();
  };
  const observer =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => map.invalidateSize({ pan: false }))
      : null;
  const cleanup = () => {
    map.off("resize", onResize);
    observer?.disconnect();
  };
  map.on("resize", onResize);
  observer?.observe(map.getContainer());
  return cleanup;
}
