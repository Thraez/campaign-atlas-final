/**
 * Leaflet style and tooltip text for a region and a route, shared by the
 * player viewer and the editor layers through `featureShapes.tsx`.
 *
 * PLAYER-SAFE: the player bundle imports this file. Import nothing
 * editor-only here (no editor pages, draft hooks, save endpoints).
 */
import type { PathOptions } from "leaflet";
import type { MapScale, Point, Region, Route } from "@/atlas/content/schema";
import { resolvePinStyle } from "@/atlas/pins/presets";
import { ROUTE_MODE_LABEL, formatTravelTime, routeDistancePx } from "@/atlas/map/geometry";

export const DEFAULT_REGION_COLOR = "#7fb069";
export const DEFAULT_REGION_FILL_OPACITY = 0.18;
export const DEFAULT_REGION_STROKE_OPACITY = 0.85;
export const DEFAULT_ROUTE_COLOR = "#cfd6dc";
export const DEFAULT_ROUTE_WEIGHT = 3;

/** Editor-only emphasis for the selected region/route; players never select. */
export interface ShapeStyleState {
  selected?: boolean;
}

/** Region colour: its own, else its linked entity's pin colour, else the default. */
export function regionColor(region: Region, entityType?: string): string {
  return (
    region.color ??
    (entityType !== undefined ? resolvePinStyle(entityType).color : DEFAULT_REGION_COLOR)
  );
}

export function regionPathOptions(
  region: Region,
  color: string,
  { selected = false }: ShapeStyleState = {},
): PathOptions {
  return {
    color,
    weight: selected ? 2.5 : 1.5,
    fillColor: color,
    fillOpacity: region.fillOpacity ?? DEFAULT_REGION_FILL_OPACITY,
    opacity: region.strokeOpacity ?? DEFAULT_REGION_STROKE_OPACITY,
  };
}

export function routePathOptions(
  route: Route,
  { selected = false }: ShapeStyleState = {},
): PathOptions {
  return {
    color: route.color ?? DEFAULT_ROUTE_COLOR,
    weight: (route.weight ?? DEFAULT_ROUTE_WEIGHT) + (selected ? 1 : 0),
    opacity: 0.9,
    dashArray: route.dashed ? "8 6" : undefined,
    lineCap: "round",
    lineJoin: "round",
  };
}

/** Distance (and travel time, when the map has a scale and the route a speed). */
export function routeTooltipLines(
  route: Route,
  points: Point[],
  scale: MapScale | undefined,
): { name: string; detail: string } {
  const distPx = routeDistancePx(points);
  const distLabel = scale
    ? `${(distPx * scale.unitsPerPixel).toFixed(1)} ${scale.unitLabel}`
    : `${Math.round(distPx)} px`;
  const travel =
    scale && route.speed ? formatTravelTime((distPx * scale.unitsPerPixel) / route.speed) : null;
  const modeLabel = route.mode ? ROUTE_MODE_LABEL[route.mode] : "";
  return { name: route.name, detail: `${distLabel}${travel ? ` · ${travel} ${modeLabel}` : ""}` };
}
