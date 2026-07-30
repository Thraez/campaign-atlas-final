/**
 * Single home of the flat-CRS atlas↔Leaflet coordinate convention used
 * throughout the editor and viewer: lng = x, lat = mapHeight − y. Pure math,
 * no rendering — kept dependency-free so the player viewer can import it
 * safely alongside editor-only call sites.
 */

/** Atlas pixel coords → Leaflet [lat, lng]. */
export function atlasToLatLng(x: number, y: number, height: number): [number, number] {
  return [height - y, x];
}

/** Leaflet lat/lng → atlas pixel coords. */
export function latLngToAtlas(lng: number, lat: number, height: number): { x: number; y: number } {
  return { x: lng, y: height - lat };
}
