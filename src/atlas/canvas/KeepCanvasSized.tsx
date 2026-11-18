import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { keepMapSized } from "../map/keepMapSized";

/** Re-measures the canvas whenever its container changes size (R-37: the side panel toggling). */
export function KeepCanvasSized() {
  const map = useMap();
  useEffect(() => keepMapSized(map), [map]);
  return null;
}
