// src/atlas/editor/mapClickTool.ts
//
// Decides which editor tool owns a click on the map. The editor gates the
// ruler and pin placement on this; the drawing layers (region, route, fog,
// sound area) keep their own click handlers, which only act while drawing.
// Order: an active drawing beats a pending pin, and both pause the ruler.

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
  if (s.drawingRegion || s.drawingRoute || s.drawingFog || s.drawingSoundscape) return "draw";
  if (s.placingPin) return "place-pin";
  if (s.rulerOn) return "ruler";
  return null;
}
