import L from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";

/**
 * Q-02: vectors (child frames, the caller's routes and regions) drawn right
 * at every frame of a glide or pinch, not only when it lands.
 *
 * Leaflet's SVG renderer clips paths to the viewport (plus padding) when a
 * move ends, and during a flyTo or flyToBounds (the crumb, Reset, the fit on
 * open) or a pinch only scales that picture with CSS. Gliding out from a deep
 * zoom, the clip's edge then showed as a small dashed rectangle and routes cut
 * off short, at the old scale, until the glide landed. Pins, labels and map
 * pictures already update every frame.
 *
 * From the second `zoom` event of a zoom on (the in-between frames of a glide
 * or pinch), outside Leaflet's own zoom animation, every renderer redraws:
 * re-projects and re-clips its paths for the current camera (`_reset`,
 * Leaflet 1.9's viewreset handler). The one `zoom` of a calm-mode jump and
 * the one at the end of a wheel or button zoom's CSS transition are skipped:
 * Leaflet redraws those itself when the move ends.
 */
export function RedrawVectorsWhileMoving() {
  const map = useMap();
  useEffect(() => {
    let zooms = 0;
    const onZoomStart = () => {
      zooms = 0;
    };
    const onZoom = () => {
      if ((map as unknown as { _animatingZoom?: boolean })._animatingZoom) return;
      zooms += 1;
      if (zooms < 2) return;
      const each = (map as Partial<L.Map>).eachLayer;
      if (!each) return;
      each.call(map, (layer) => {
        if (!(layer instanceof L.Renderer)) return;
        const r = layer as unknown as { _reset?: unknown };
        if (typeof r._reset === "function") r._reset();
      });
    };
    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomStart);
    map.on("zoom", onZoom);
    return () => {
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomStart);
      map.off("zoom", onZoom);
    };
  }, [map]);
  return null;
}
