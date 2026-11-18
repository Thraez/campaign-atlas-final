/**
 * The canvas's wheel zoom (P-06): Leaflet's ScrollWheelZoom with the canvas's
 * speed (`canvasMotion.ts`). The platform factor is Leaflet's own, which
 * Leaflet fixes when it loads, so it is computed once here at load too.
 * `wheelPxPerZoomLevel` undoes it for pixel-mode wheels; line- and page-mode
 * deltas, which Leaflet never divides by it, are scaled per event by
 * `canvasWheelDeltaScale`, so every wheel notch zooms the same.
 *
 * The canvas turns Leaflet's own handler off (`scrollWheelZoom={false}`) and
 * `useCanvasWheelZoom` runs this one in its place.
 *
 * PLAYER-SAFE: import nothing editor- or viewer-only.
 */
import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import {
  canvasWheelDeltaScale,
  canvasWheelPxPerZoomLevel,
  leafletWheelPxFactor,
} from "./canvasMotion";

/** Leaflet's `wheelPxFactor` on this device, as Leaflet computed it at load. */
export const WHEEL_PX_FACTOR = leafletWheelPxFactor(
  L.Browser as { linux?: boolean; chrome?: boolean; mac?: boolean },
  typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
);

/** The canvas's `wheelPxPerZoomLevel` (MapContainer option). */
export const CANVAS_WHEEL_PX_PER_ZOOM_LEVEL = canvasWheelPxPerZoomLevel(WHEEL_PX_FACTOR);

type WheelHandler = L.Handler & {
  _delta: number;
  _onWheelScroll(e: WheelEvent): void;
};
type WheelHandlerClass = new (map: L.Map) => WheelHandler;

const Base = (L.Map as unknown as { ScrollWheelZoom: WheelHandlerClass & typeof L.Handler })
  .ScrollWheelZoom;

/**
 * ScrollWheelZoom with line- and page-mode deltas scaled. Leaflet adds each
 * event's delta to `_delta` and zooms on the batch 40 ms later; this scales
 * the part the event added. Legacy EdgeHTML reads `wheelDeltaY`, unscaled.
 */
export const CanvasScrollWheelZoom = (
  Base as unknown as { extend(props: object): WheelHandlerClass }
).extend({
  _onWheelScroll(this: WheelHandler, e: WheelEvent) {
    const before = this._delta;
    (Base.prototype as WheelHandler)._onWheelScroll.call(this, e);
    if ((L.Browser as { edge?: boolean }).edge) return;
    const scale = canvasWheelDeltaScale(e.deltaMode, WHEEL_PX_FACTOR);
    if (scale !== 1) this._delta = before + (this._delta - before) * scale;
  },
});

/** Runs the canvas's wheel zoom on the map (a real Leaflet map only). */
export function useCanvasWheelZoom() {
  const map = useMap();
  useEffect(() => {
    if (!(map instanceof L.Map)) return;
    const handler = new CanvasScrollWheelZoom(map);
    handler.enable();
    return () => {
      handler.disable();
    };
  }, [map]);
}
