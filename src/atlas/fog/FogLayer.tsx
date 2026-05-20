/**
 * Fog visual editor layer.
 *
 * Renders the canon-shaped fog (whole-map polygon with reveal holes) so the
 * DM sees what players would see, plus a draft draw preview for the active
 * polygon/circle reveal in progress.
 *
 * Z-order: rendered AFTER routes, BEFORE pins/labels/handles.
 */
import { useMemo, useState } from "react";
import { CircleMarker, Polygon, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { MapDocument, Point } from "@/atlas/content/schema";
import type { FogDraftAPI } from "./useFogDraft";

interface Props {
  map: MapDocument;
  api: FogDraftAPI;
  /** When false, hides the dim layer (still allows reveal authoring). */
  preview?: boolean;
  /**
   * When true, renders the fog as a fully opaque "undiscovered" backdrop
   * (player view). When false (default), renders as the translucent DM
   * planning overlay.
   */
  playerMode?: boolean;
}

function DrawingClicks({ api, map, onCircleAnchor }: { api: FogDraftAPI; map: MapDocument; onCircleAnchor: (p: Point) => void }) {
  useMapEvents({
    click(e) {
      if (!api.tool) return;
      const x = Math.round(e.latlng.lng);
      const y = Math.round(map.height - e.latlng.lat);
      if (api.tool === "polygon" || api.tool === "fog-polygon") {
        api.addDraftPoint([x, y]);
      } else if (api.tool === "circle" || api.tool === "fog-circle") {
        // First click sets center; the panel handles radius separately.
        if (api.draftPoints.length === 0) {
          api.addDraftPoint([x, y]);
          onCircleAnchor([x, y]);
        }
      }
    },
  });
  return null;
}

export function FogLayer({ map, api, preview = true, playerMode = false }: Props) {
  const H = map.height;
  const xy2ll = (x: number, y: number): [number, number] => [H - y, x];
  const [_circleAnchor, setCircleAnchor] = useState<Point | null>(null);
  void _circleAnchor;

  const fog = api.fog;

  // Outer rectangle + reveal holes + conceal re-fills (evenodd: outer→fog, reveals→clear, conceals→fog again).
  const fogPositions = useMemo<L.LatLngExpression[][]>(() => {
    const outer: L.LatLngExpression[] = [
      [0, 0], [0, map.width], [H, map.width], [H, 0],
    ];
    const reveals: L.LatLngExpression[][] = fog.reveals.map((poly) =>
      poly.map(([x, y]) => xy2ll(x, y))
    );
    const conceals: L.LatLngExpression[][] = (fog.conceals ?? []).map((poly) =>
      poly.map(([x, y]) => xy2ll(x, y))
    );
    return [outer, ...reveals, ...conceals];
  }, [fog.reveals, fog.conceals, H, map.width]);

  return (
    <>
      <DrawingClicks api={api} map={map} onCircleAnchor={setCircleAnchor} />

      {(preview || playerMode) && fog.enabled && (
        <Polygon
          positions={fogPositions}
          pathOptions={{
            color: "transparent",
            fillColor: playerMode ? "#1a1a2e" : (fog.color ?? "rgba(0,0,0,0.55)"),
            // fillOpacity stays 1 in both modes. DM semi-transparency comes from
            // the rgba alpha in fog.color (e.g. "rgba(0,0,0,0.55)"), not from this
            // property. SVG composites fill × fillOpacity, so 0.55 × 1 = 0.55.
            fillOpacity: 1,
            weight: 0,
            interactive: false,
            fillRule: "evenodd",
          } as L.PathOptions}
        />
      )}

      {/* Outline existing reveals so DM can see boundaries even when fog is off. */}
      {fog.reveals.map((poly, i) => (
        <Polyline
          key={`reveal-outline-${i}`}
          positions={poly.map(([x, y]) => xy2ll(x, y)).concat([xy2ll(poly[0][0], poly[0][1])])}
          pathOptions={{ color: "hsl(var(--accent))", weight: 1, opacity: 0.6, dashArray: "3,3", interactive: false }}
        />
      ))}

      {/* Outline existing conceals so DM can see re-fogged areas even when fog is off. */}
      {(fog.conceals ?? []).map((poly, i) => (
        <Polyline
          key={`conceal-outline-${i}`}
          positions={poly.map(([x, y]) => xy2ll(x, y)).concat([xy2ll(poly[0][0], poly[0][1])])}
          pathOptions={{ color: "hsl(var(--destructive))", weight: 1, opacity: 0.6, dashArray: "3,3", interactive: false }}
        />
      ))}

      {/* Draft polygon preview (reveal = primary color, conceal = destructive color). */}
      {(api.tool === "polygon" || api.tool === "fog-polygon") && api.draftPoints.length > 0 && (
        <>
          {api.draftPoints.length >= 3 ? (
            <Polygon
              positions={api.draftPoints.map(([x, y]) => xy2ll(x, y))}
              pathOptions={{
                color: api.tool === "fog-polygon" ? "hsl(var(--destructive))" : "hsl(var(--primary))",
                dashArray: "4,4", fillOpacity: 0.12, weight: 2
              }}
            />
          ) : (
            <Polyline
              positions={api.draftPoints.map(([x, y]) => xy2ll(x, y))}
              pathOptions={{
                color: api.tool === "fog-polygon" ? "hsl(var(--destructive))" : "hsl(var(--primary))",
                dashArray: "4,4", weight: 2
              }}
            />
          )}
          {api.draftPoints.map((p, i) => (
            <CircleMarker key={`draft-${i}`} center={xy2ll(p[0], p[1])} radius={4}
              pathOptions={{
                color: api.tool === "fog-polygon" ? "hsl(var(--destructive))" : "hsl(var(--primary))",
                fillColor: api.tool === "fog-polygon" ? "hsl(var(--destructive))" : "hsl(var(--primary))",
                fillOpacity: 1
              }} />
          ))}
        </>
      )}

      {/* Circle anchor preview (reveal = primary color, conceal = destructive color). */}
      {(api.tool === "circle" || api.tool === "fog-circle") && api.draftPoints.length === 1 && (
        <CircleMarker center={xy2ll(api.draftPoints[0][0], api.draftPoints[0][1])} radius={5}
          pathOptions={{
            color: api.tool === "fog-circle" ? "hsl(var(--destructive))" : "hsl(var(--primary))",
            fillColor: api.tool === "fog-circle" ? "hsl(var(--destructive))" : "hsl(var(--primary))",
            fillOpacity: 1
          }} />
      )}
    </>
  );
}
