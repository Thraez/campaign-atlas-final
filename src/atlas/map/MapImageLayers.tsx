/**
 * A map's image layers as Leaflet image overlays, in zIndex order, shifted
 * `dx` map units sideways. `WrappedWorld` (the viewer) and `AtlasCanvas` (R-31)
 * both draw a map's images through this, so they draw them the same way.
 *
 * PLAYER-SAFE: the player bundle imports this file. Import nothing editor-only.
 */
import { ImageOverlay } from "react-leaflet";
import type L from "leaflet";
import type { MapDocument } from "@/atlas/content/schema";
import { normalizeAtlasAssetUrl } from "@/atlas/url";

export function MapImageLayers({
  map,
  dx = 0,
  pane,
}: {
  map: Pick<MapDocument, "layers" | "height">;
  dx?: number;
  /** Leaflet pane for the overlays; Leaflet's default (`overlayPane`) when unset. */
  pane?: string;
}) {
  const H = map.height;
  return (
    <>
      {[...map.layers]
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((layer) => (
          <ImageOverlay
            key={`${layer.id}-${dx}`}
            url={normalizeAtlasAssetUrl(layer.src)}
            bounds={
              [
                [H - (layer.y + layer.height), layer.x + dx],
                [H - layer.y, layer.x + layer.width + dx],
              ] as L.LatLngBoundsLiteral
            }
            opacity={layer.opacity}
            {...(pane ? { pane } : {})}
          />
        ))}
    </>
  );
}
