/**
 * Visual region layer for the editor map.
 *
 * Renders effective regions as polygons, with selection, vertex handles,
 * mid-point "add vertex" handles, and an in-progress draft polyline while
 * drawing. All geometry is in map coordinates (y-up); we flip to Leaflet's
 * (lat = height - y, lng = x) on render.
 *
 * Z-order rule: this component must be rendered AFTER the base ImageOverlay
 * layers but BEFORE routes, fog, pins, labels, and editor handles.
 */
import { useMemo } from "react";
import { CircleMarker, Marker, Polygon, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { MapDocument, Point, Region } from "@/atlas/content/schema";
import type { RegionDraftAPI } from "./useRegionDraft";

interface Props {
  map: MapDocument;
  api: RegionDraftAPI;
  /** Hide all region geometry (DM toggle). */
  visible?: boolean;
}

const handleIcon = (selected: boolean) =>
  L.divIcon({
    className: "atlas-region-vertex",
    html: `<div style="width:10px;height:10px;border-radius:9999px;background:${selected ? "hsl(var(--primary))" : "#fff"};border:2px solid hsl(var(--primary));box-shadow:0 0 0 1px rgba(0,0,0,0.4)"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });

const midpointIcon = () =>
  L.divIcon({
    className: "atlas-region-midpoint",
    html: `<div style="width:8px;height:8px;border-radius:9999px;background:hsl(var(--background));border:1px dashed hsl(var(--primary));opacity:0.7"></div>`,
    iconSize: [8, 8],
    iconAnchor: [4, 4],
  });

function midpoint(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Captures map clicks ONLY when in drawing mode — placement clicks still pass through normally. */
function DrawingClicks({ api, map }: { api: RegionDraftAPI; map: MapDocument }) {
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

export function RegionLayer({ map, api, visible = true }: Props) {
  const H = map.height;
  const xy2ll = (x: number, y: number): [number, number] => [H - y, x];

  const regions = api.effective;

  // Pre-flatten so we can render selected vertex/midpoint handles only for the
  // selected region (keeps the map readable).
  const selected = useMemo(() => regions.find((r) => r.id === api.selectedId) ?? null, [regions, api.selectedId]);

  return (
    <>
      <DrawingClicks api={api} map={map} />

      {visible && regions.map((r) => {
        const positions = r.points.map(([x, y]) => xy2ll(x, y));
        const color = r.color ?? "#7fb069";
        const isSelected = r.id === api.selectedId;
        return (
          <Polygon
            key={r.id}
            positions={positions}
            pathOptions={{
              color,
              weight: isSelected ? 2.5 : 1.5,
              fillColor: color,
              fillOpacity: r.fillOpacity ?? 0.15,
              opacity: r.strokeOpacity ?? 0.7,
              dashArray: isSelected ? undefined : undefined,
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

      {/* Vertex + midpoint handles for the SELECTED region only. */}
      {visible && selected && !api.drawing && selected.points.map((p, i) => (
        <Marker
          key={`vx-${selected.id}-${i}`}
          position={xy2ll(p[0], p[1])}
          icon={handleIcon(true)}
          draggable
          eventHandlers={{
            dragend: (ev) => {
              const ll = (ev.target as L.Marker).getLatLng();
              api.movePoint(selected.id, i, [Math.round(ll.lng), Math.round(H - ll.lat)]);
            },
            contextmenu: (ev) => {
              L.DomEvent.preventDefault(ev);
              api.deletePoint(selected.id, i);
            },
          }}
        />
      ))}
      {visible && selected && !api.drawing && selected.points.map((p, i) => {
        const next = selected.points[(i + 1) % selected.points.length];
        const mid = midpoint(p, next);
        return (
          <Marker
            key={`mid-${selected.id}-${i}`}
            position={xy2ll(mid[0], mid[1])}
            icon={midpointIcon()}
            eventHandlers={{
              click: (ev) => {
                L.DomEvent.stopPropagation(ev);
                api.insertPointAfter(selected.id, i, [Math.round(mid[0]), Math.round(mid[1])]);
              },
            }}
          />
        );
      })}

      {/* Draft polyline / polygon while drawing. */}
      {api.drawing && api.draftPoints.length > 0 && (
        <>
          {api.draftPoints.length >= 3 ? (
            <Polygon
              positions={api.draftPoints.map(([x, y]) => xy2ll(x, y))}
              pathOptions={{ color: "hsl(var(--primary))", dashArray: "4,4", fillOpacity: 0.12, weight: 2 }}
            />
          ) : (
            <Polyline
              positions={api.draftPoints.map(([x, y]) => xy2ll(x, y))}
              pathOptions={{ color: "hsl(var(--primary))", dashArray: "4,4", weight: 2 }}
            />
          )}
          {api.draftPoints.map((p, i) => (
            <CircleMarker
              key={`draft-${i}`}
              center={xy2ll(p[0], p[1])}
              radius={4}
              pathOptions={{ color: "hsl(var(--primary))", fillColor: "hsl(var(--primary))", fillOpacity: 1 }}
            />
          ))}
        </>
      )}
    </>
  );
}
