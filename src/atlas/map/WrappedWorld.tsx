/**
 * One copy of the player map's world: image layers, regions, routes, grid and
 * pins, shifted `dx` map units sideways (wrapping maps draw three copies).
 *
 * Memoised: the viewer page re-renders on every pan, search keystroke and hover
 * peek, and none of those change what's drawn here. With the page's props
 * stable, the copy skips the render; when only pin state changes (the open pin,
 * visited places) the shapes are reused and `PinLayer` touches only the pins
 * that changed.
 *
 * PLAYER-SAFE: the player bundle imports this file. Import nothing editor-only.
 */
import { memo, useMemo } from "react";
import { ImageOverlay, Popup, Polyline } from "react-leaflet";
import type L from "leaflet";
import type { Entity, MapDocument, MapPlacement } from "@/atlas/content/schema";
import { normalizeAtlasAssetUrl } from "@/atlas/url";
import { gridLines } from "./geometry";
import { RegionShape, RouteShape } from "./featureShapes";
import { PlacementMarkers } from "./PinLayer";

export interface WrappedWorldProps {
  dx: number;
  map: MapDocument;
  placements: MapPlacement[];
  entityById: Map<string, Entity>;
  showGrid: boolean | null;
  onOpenEntity: (id: string, fly?: boolean) => void;
  visited: Set<string>;
  openId: string | null;
  onPinPeek?: (id: string, ev: MouseEvent) => void;
  onPinPeekLeave?: () => void;
  rulerActive?: boolean;
}

export const WrappedWorld = memo(function WrappedWorld({
  dx,
  map,
  placements,
  entityById,
  showGrid,
  onOpenEntity,
  visited,
  openId,
  onPinPeek,
  onPinPeekLeave,
  rulerActive,
}: WrappedWorldProps) {
  const H = map.height;
  const shapes = useMemo(
    () => (
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
            />
          ))}

        {(map.regions ?? []).map((region) => {
          const ent = region.entityId ? entityById.get(region.entityId) : undefined;
          return (
            <RegionShape
              key={`${region.id}-${dx}`}
              region={region}
              entityType={ent?.type}
              positions={region.points.map(([x, y]) => [H - y, x + dx] as [number, number])}
              eventHandlers={
                region.entityId && !rulerActive
                  ? { click: () => onOpenEntity(region.entityId!, false) }
                  : undefined
              }
            >
              <Popup>
                <div className="text-sm font-medium">{region.name}</div>
                {ent?.summary && <div className="text-xs opacity-70">{ent.summary}</div>}
              </Popup>
            </RegionShape>
          );
        })}

        {(map.routes ?? []).map((route) => {
          const points = route.resolvedPoints ?? [];
          if (points.length < 2) return null;
          return (
            <RouteShape
              key={`${route.id}-${dx}`}
              route={route}
              points={points}
              positions={points.map(([x, y]) => [H - y, x + dx] as [number, number])}
              scale={map.scale}
            />
          );
        })}

        {map.grid &&
          (showGrid ?? map.grid.enabled !== false) &&
          gridLines(map, map.grid).map((line, i) => (
            <Polyline
              key={`grid-${dx}-${i}`}
              positions={line.map((p) => {
                const [lat, lng] = p as [number, number];
                return [lat, lng + dx] as [number, number];
              })}
              pathOptions={{
                color: map.grid!.color ?? "rgba(255,255,255,0.08)",
                weight: 1,
                opacity: 1,
                interactive: false,
              }}
            />
          ))}
      </>
    ),
    [map, dx, H, entityById, rulerActive, onOpenEntity, showGrid],
  );

  return (
    <>
      {shapes}
      <PlacementMarkers
        dx={dx}
        H={H}
        placements={placements}
        entityById={entityById}
        onOpenEntity={onOpenEntity}
        visited={visited}
        openId={openId}
        onPinPeek={onPinPeek}
        onPinPeekLeave={onPinPeekLeave}
      />
    </>
  );
});
