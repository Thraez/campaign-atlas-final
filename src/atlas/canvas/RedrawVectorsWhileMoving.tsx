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
 * On each `zoom` event that is not part of Leaflet's own zoom animation (a
 * wheel or button zoom, which ends in one CSS transition and redraws at its
 * end), every renderer redraws: re-projects and re-clips its paths for the
 * current camera (`_reset`, Leaflet 1.9's viewreset handler). Calm-mode jumps
 * have no in-between frames and are right already.
 */
export function RedrawVectorsWhileMoving() {
  const map = useMap();
  useEffect(() => {
    const onZoom = () => {
      if ((map as unknown as { _animatingZoom?: boolean })._animatingZoom) return;
      const each = (map as Partial<L.Map>).eachLayer;
      if (!each) return;
      each.call(map, (layer) => {
        if (layer instanceof L.Renderer) (layer as unknown as { _reset: () => void })._reset();
      });
    };
    map.on("zoom", onZoom);
    return () => {
      map.off("zoom", onZoom);
    };
  }, [map]);
  return null;
}
