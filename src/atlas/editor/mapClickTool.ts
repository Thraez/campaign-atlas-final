// src/atlas/editor/mapClickTool.ts
//
// Decides which editor tool owns a click on the map, so one click never both
// drops a ruler point and adds a drawing vertex. Placing a pin or drawing
// (region, route, fog, sound area) pauses the ruler; the ruler resumes when
// that ends.

export type MapClickTool = "place-pin" | "draw" | "ruler" | null;

export interface MapClickState {
  placingPin: boolean;
  drawingRegion: boolean;
  drawingRoute: boolean;
  drawingFog: boolean;
  drawingSoundscape: boolean;
  rulerOn: boolean;
}

export function resolveMapClickTool(s: MapClickState): MapClickTool {
  if (s.placingPin) return "place-pin";
  if (s.drawingRegion || s.drawingRoute || s.drawingFog || s.drawingSoundscape) return "draw";
  if (s.rulerOn) return "ruler";
  return null;
}
