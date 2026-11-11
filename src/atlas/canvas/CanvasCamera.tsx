/**
 * The shared canvas's camera (R-31): applies an explicit camera from the
 * caller, and reports every settled move back in the view's own pixels.
 * Fitting ("fit") is `FitMapOnOpen`'s job; see AtlasCanvas.
 *
 * PLAYER-SAFE: import nothing editor- or viewer-only.
 */
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { Point } from "../content/schema";
import { whenMapHasSize } from "../map/whenMapHasSize";
import { fromLatLng, toLatLng } from "./canvasGeometry";

/** A camera in a view's own pixels (top-left origin) and Leaflet zoom. */
export interface CanvasCameraState {
  center: Point;
  zoom: number;
}

const near = (a: CanvasCameraState, b: CanvasCameraState) =>
  Math.abs(a.center[0] - b.center[0]) < 0.5 &&
  Math.abs(a.center[1] - b.center[1]) < 0.5 &&
  Math.abs(a.zoom - b.zoom) < 1e-6;

export function CanvasCamera({
  viewKey,
  viewHeight,
  camera,
  onCameraChange,
  reduceMotion,
}: {
  /** Changes whenever the view (and so the coordinate space) changes. */
  viewKey: string;
  viewHeight: number;
  /** null: leave the camera alone (the canvas is fitting). */
  camera: CanvasCameraState | null;
  onCameraChange?: (camera: CanvasCameraState) => void;
  reduceMotion: boolean;
}) {
  const map = useMap();
  const reported = useRef<CanvasCameraState | null>(null);
  const lastViewKey = useRef(viewKey);
  const onChangeRef = useRef(onCameraChange);
  useEffect(() => {
    onChangeRef.current = onCameraChange;
  });

  useEffect(() => {
    const update = () => {
      const cam = { center: fromLatLng(viewHeight, map.getCenter()), zoom: map.getZoom() };
      reported.current = cam;
      onChangeRef.current?.(cam);
    };
    // Leaflet fires moveend after every pan and every zoom.
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
    };
  }, [map, viewKey, viewHeight]);

  const cx = camera?.center[0];
  const cy = camera?.center[1];
  const zoom = camera?.zoom;
  useEffect(() => {
    const viewChanged = lastViewKey.current !== viewKey;
    lastViewKey.current = viewKey;
    if (cx === undefined || cy === undefined || zoom === undefined) return;
    if (![cx, cy, zoom].every(Number.isFinite)) return;
    const target = { center: [cx, cy] as Point, zoom };
    // The caller handing back what the canvas just reported: nothing to do.
    if (!viewChanged && reported.current && near(reported.current, target)) return;
    return whenMapHasSize(map, () => {
      map.setView(toLatLng(viewHeight, target.center), zoom, {
        animate: !reduceMotion && !viewChanged,
      });
    });
  }, [map, viewKey, viewHeight, cx, cy, zoom, reduceMotion]);

  return null;
}
