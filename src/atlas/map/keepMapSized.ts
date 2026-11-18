import type { Map as LeafletMap } from "leaflet";

type ResizableMap = Pick<LeafletMap, "invalidateSize" | "getContainer">;

/**
 * Keep Leaflet's cached size in step with its container for as long as the map
 * lives; returns a cleanup. Leaflet only re-measures on a window resize, so a
 * container that changes width on its own (the viewer's side panel opening or
 * closing) would leave the map drawing, fitting and limiting zoom for the old
 * width. `invalidateSize` fires Leaflet's `resize`, which `OceanZoomLimit`
 * listens to. A no-op where `ResizeObserver` is missing.
 *
 * Player-safe: no editor imports.
 */
export function keepMapSized(map: ResizableMap): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
  observer.observe(map.getContainer());
  return () => observer.disconnect();
}
