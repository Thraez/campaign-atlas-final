import type { ViewRect } from "@/atlas/sound/resolveSoundscape";

interface LatLngLike { lat: number; lng: number }
export interface LeafletViewLike {
  getCenter(): LatLngLike;
  getBounds(): { getSouthWest(): LatLngLike; getNorthEast(): LatLngLike };
}

/** Convert Leaflet's flipped-lat view state into top-left-origin map coords. */
export function readViewport(map: LeafletViewLike, mapHeight: number): { cx: number; cy: number; view: ViewRect } {
  const c = map.getCenter();
  const cx = c.lng;
  const cy = mapHeight - c.lat;
  const b = map.getBounds();
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  const view: ViewRect = {
    minX: sw.lng,
    maxX: ne.lng,
    minY: mapHeight - ne.lat, // north (max lat) → top (min y)
    maxY: mapHeight - sw.lat, // south (min lat) → bottom (max y)
  };
  return { cx, cy, view };
}
