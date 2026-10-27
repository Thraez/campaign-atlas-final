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
export const DEFAULT_ROUTE_COLOR = "#cfd6dc";

/** Region colour: its own, else its linked entity's pin colour, else the default. */
export function regionColor(region: Region, entityType?: string): string {
  return (
    region.color ??
    (entityType !== undefined ? resolvePinStyle(entityType).color : DEFAULT_REGION_COLOR)
  );
}

export function regionPathOptions(region: Region, color: string): PathOptions {
  return {
    color,
    weight: 1.5,
    fillColor: color,
    fillOpacity: region.fillOpacity ?? 0.18,
    opacity: region.strokeOpacity ?? 0.85,
  };
}

export function routePathOptions(route: Route): PathOptions {
  return {
    color: route.color ?? DEFAULT_ROUTE_COLOR,
    weight: route.weight ?? 3,
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
