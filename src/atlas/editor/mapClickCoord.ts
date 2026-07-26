import { latLngToAtlas } from "@/atlas/map/coords";

export function mapClickToAtlasCoord(
  lng: number,
  lat: number,
  mapHeight: number,
): { x: number; y: number } {
  const { x, y } = latLngToAtlas(lng, lat, mapHeight);
  return { x: Math.round(x), y: Math.round(y) };
}
