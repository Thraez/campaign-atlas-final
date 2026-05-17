export function mapClickToAtlasCoord(
  lng: number,
  lat: number,
  mapHeight: number
): { x: number; y: number } {
  return { x: Math.round(lng), y: Math.round(mapHeight - lat) };
}
