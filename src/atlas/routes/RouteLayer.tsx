/**
 * Route visual editor layer for the placement editor.
 *
 * Renders effective routes as polylines, supports selection, drag-handles for
 * coordinate waypoints (entity-ref waypoints are read-only — they follow
 * their entity placement), and an in-progress draft preview while drawing.
 *
 * Z-order rule: rendered AFTER regions, BEFORE fog/pins/labels/handles.
 */
import { useMemo } from "react";
import { CircleMarker, Marker, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { MapDocument, Point } from "@/atlas/content/schema";
import type { RouteDraftAPI, Waypoint } from "./useRouteDraft";

interface Props {
  map: MapDocument;
  api: RouteDraftAPI;
  visible?: boolean;
}

const handleIcon = (kind: "coord" | "entity") =>
  L.divIcon({
    className: "atlas-route-handle",
    html: `<div style="width:10px;height:10px;border-radius:${kind === "entity" ? "2px" : "9999px"};background:${kind === "entity" ? "hsl(var(--accent))" : "#fff"};border:2px solid hsl(var(--primary));box-shadow:0 0 0 1px rgba(0,0,0,0.4)"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });

const midpointIcon = L.divIcon({
  className: "atlas-route-midpoint-handle",
  html: `<div style="width:8px;height:8px;border-radius:9999px;background:hsl(var(--primary) / 0.25);border:1.5px dashed hsl(var(--primary));cursor:copy"></div>`,
  iconSize: [8, 8],
  iconAnchor: [4, 4],
});

function DrawingClicks({ api, map }: { api: RouteDraftAPI; map: MapDocument }) {
  useMapEvents({
    click(e) {
      if (!api.drawing) return;
      const x = Math.round(e.latlng.lng);
      const y = Math.round(map.height - e.latlng.lat);
      api.addDraftPoint([x, y]);
    },
  });
  return null;
}

export function RouteLayer({ map, api, visible = true }: Props) {
  const H = map.height;
  const xy2ll = (x: number, y: number): [number, number] => [H - y, x];

  const routes = api.effective;
  const selected = useMemo(
    () => routes.find((r) => r.id === api.selectedId) ?? null,
    [routes, api.selectedId],
  );

  const draftPts = useMemo(() => {
    return api.draftWaypoints.map((w) => api.resolveWaypoint(w)).filter((p): p is Point => !!p);
  }, [api]);

  return (
    <>
      <DrawingClicks api={api} map={map} />

      {visible &&
        routes.map((r) => {
          const pts = api.resolveRoute(r);
          if (pts.length < 2) return null;
          const isSelected = r.id === api.selectedId;
          return (
            <Polyline
              key={r.id}
              positions={pts.map(([x, y]) => xy2ll(x, y))}
              pathOptions={{
                color: r.color ?? "#cfd6dc",
                weight: (r.weight ?? 3) + (isSelected ? 1 : 0),
                opacity: 0.95,
                dashArray: r.dashed ? "8 6" : undefined,
                lineCap: "round",
                lineJoin: "round",
              }}
              eventHandlers={{
                click: (e) => {
                  if (api.drawing) return;
                  L.DomEvent.stopPropagation(e);
                  api.setSelectedId(r.id);
                },
              }}
            />
          );
        })}

      {/* Selected route — draggable handles for coord waypoints, square markers for entity refs. */}
      {visible &&
        selected &&
        !api.drawing &&
        selected.waypoints.map((w: Waypoint, i) => {
          const p = api.resolveWaypoint(w);
          if (!p) return null;
          const isEntity = !Array.isArray(w);
          return (
            <Marker
              key={`wp-${selected.id}-${i}`}
              position={xy2ll(p[0], p[1])}
              icon={handleIcon(isEntity ? "entity" : "coord")}
              draggable={!isEntity}
              eventHandlers={
                !isEntity
                  ? {
                      dragend: (ev) => {
                        const ll = (ev.target as L.Marker).getLatLng();
                        api.moveWaypoint(selected.id, i, [
                          Math.round(ll.lng),
                          Math.round(H - ll.lat),
                        ]);
                      },
                      contextmenu: (ev) => {
                        L.DomEvent.preventDefault(ev.originalEvent);
                        api.removeWaypoint(selected.id, i);
                      },
                    }
                  : undefined
              }
            />
          );
        })}

      {/* Midpoints of the selected route's segments — click to insert a new coord
          waypoint there via insertWaypointAfter, splitting the segment in two. */}
      {visible &&
        selected &&
        !api.drawing &&
        selected.waypoints.slice(0, -1).map((w, i) => {
          const p1 = api.resolveWaypoint(w);
          const p2 = api.resolveWaypoint(selected.waypoints[i + 1]);
          if (!p1 || !p2) return null;
          const midX = (p1[0] + p2[0]) / 2;
          const midY = (p1[1] + p2[1]) / 2;
          return (
            <Marker
              key={`mid-${selected.id}-${i}`}
              position={xy2ll(midX, midY)}
              icon={midpointIcon}
              eventHandlers={{
                click: (ev) => {
                  L.DomEvent.stopPropagation(ev);
                  api.insertWaypointAfter(selected.id, i, [Math.round(midX), Math.round(midY)]);
                },
              }}
            />
          );
        })}

      {/* In-progress draft preview. */}
      {api.drawing && draftPts.length > 0 && (
        <>
          {draftPts.length >= 2 && (
            <Polyline
              positions={draftPts.map(([x, y]) => xy2ll(x, y))}
              pathOptions={{ color: "hsl(var(--primary))", dashArray: "4,4", weight: 2 }}
            />
          )}
          {draftPts.map((p, i) => (
            <CircleMarker
              key={`draft-${i}`}
              center={xy2ll(p[0], p[1])}
              radius={4}
              pathOptions={{
                color: "hsl(var(--primary))",
                fillColor: "hsl(var(--primary))",
                fillOpacity: 1,
              }}
            />
          ))}
        </>
      )}
    </>
  );
}
