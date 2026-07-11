/**
 * On-map draw capture + context outlines for sound areas.
 *
 * A thin Leaflet child (modelled on `RegionLayer`): while the soundscape
 * draft is in drawing mode it captures map clicks into
 * `api.addDraftPoint([x, y])`; otherwise clicks pass through normally so
 * placement interactions keep working. It also renders the in-progress
 * polyline/polygon and the existing sound-area outlines for context
 * (sound-only zones by their own points, ride-on areas by their region's).
 *
 * Coordinates: map coords are `[x, y]` with a top-left origin; Leaflet's flat
 * CRS is y-up, so we flip with `y = mapHeight - lat` on capture and
 * `lat = mapHeight - y` on render — exactly as `RegionLayer` does.
 *
 * EDITOR-ONLY. Mounted solely inside `AtlasPlacementEditor`'s
 * `<MapContainer>`; never import this from the player runtime
 * (`src/atlas/sound/`), AtlasViewer, or Landing.
 */
import { useMemo } from "react";
import { CircleMarker, Polygon, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { MapDocument, Point, SoundArea } from "@/atlas/content/schema";
import type { SoundscapeDraftAPI } from "./useSoundscapeDraft";

interface Props {
  map: MapDocument;
  api: SoundscapeDraftAPI;
}

/** Outline colour for existing sound areas (distinct from region green). */
const SOUND_COLOR = "#5eb1e8";

/**
 * Convert a Leaflet click position to a map point: keep lng as x, flip
 * lat→y against the map height, and round to integer map pixels
 * (matches `RegionLayer`'s draw capture).
 */
export function clickToMapPoint(
  latlng: { lat: number; lng: number },
  mapHeight: number,
): Point {
  return [Math.round(latlng.lng), Math.round(mapHeight - latlng.lat)];
}

/** Captures map clicks ONLY while drawing — placement clicks pass through normally. */
function DrawingClicks({ api, map }: { api: SoundscapeDraftAPI; map: MapDocument }) {
  useMapEvents({
    click(e) {
      if (!api.drawing) return;
      api.addDraftPoint(clickToMapPoint(e.latlng, map.height));
    },
  });
  return null;
}

/** Resolve the polygon an area occupies: its own points, or its region's (ride-on). */
function areaPoints(a: SoundArea, map: MapDocument): Point[] | null {
  if (a.regionId) {
    const region = (map.regions ?? []).find((r) => r.id === a.regionId);
    return region && region.points.length >= 3 ? region.points : null;
  }
  return a.points && a.points.length >= 3 ? a.points : null;
}

export function SoundAreaLayer({ map, api }: Props) {
  const H = map.height;
  const xy2ll = (x: number, y: number): [number, number] => [H - y, x];

  const outlines = useMemo(
    () =>
      (api.effective.areas ?? [])
        .map((a) => ({ area: a, points: areaPoints(a, map) }))
        .filter((o): o is { area: SoundArea; points: Point[] } => o.points !== null),
    [api.effective.areas, map],
  );

  return (
    <>
      <DrawingClicks api={api} map={map} />

      {/* Existing sound-area outlines for context. */}
      {outlines.map(({ area, points }) => {
        const isSelected = area.id === api.selectedId;
        return (
          <Polygon
            key={area.id}
            positions={points.map(([x, y]) => xy2ll(x, y))}
            pathOptions={{
              color: SOUND_COLOR,
              weight: isSelected ? 2.5 : 1.5,
              dashArray: "6,4",
              fillColor: SOUND_COLOR,
              fillOpacity: isSelected ? 0.12 : 0.06,
              opacity: 0.8,
            }}
            eventHandlers={{
              click: (e) => {
                if (api.drawing) return;
                L.DomEvent.stopPropagation(e);
                api.setSelectedId(area.id);
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
              pathOptions={{
                color: "hsl(var(--primary))",
                dashArray: "4,4",
                fillOpacity: 0.12,
                weight: 2,
              }}
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
