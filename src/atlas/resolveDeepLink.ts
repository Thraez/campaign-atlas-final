import type { AtlasProject } from "@/atlas/content/schema";
import type { DeepLinkState } from "@/atlas/deepLink";

export interface DeepLinkFly {
  x: number;
  y: number;
  /** Height of the map being flown on, for the atlas-to-Leaflet flip. */
  height: number;
  zoom?: number;
}

export interface ResolvedDeepLink {
  mapId: string | null;
  openId: string | null;
  fly: DeepLinkFly | null;
  /** Open the bottom sheet: an entity is open and there is no desktop aside. */
  openSheet: boolean;
}

export interface ResolveDeepLinkOptions {
  /** The map on screen, or null on first load. Used only when the atlas names no usable map. */
  currentMapId: string | null;
  defaultMapId: string | null;
  hasDesktopAside: boolean;
  /**
   * v2 output (R-33): the ocean is the home view, so `mapId: null` in the
   * result means the ocean. `isMap` says which ids the viewer can show (the
   * map tree's), `height` is the ocean's, for a camera on it. Absent for v1.
   */
  ocean?: { height: number; isMap: (id: string) => boolean };
}

/**
 * The one rule for what a viewer URL shows. First load, Back/Forward and
 * opening an entity all go through here, so the same URL always lands the
 * same way whatever the viewer showed before.
 *
 * - Map: the URL's map when it exists. Otherwise, for an entity link, the
 *   entity's placement on the default map, else its first placement.
 *   Otherwise the default map.
 * - Center: kept only when the URL's map exists, or when there is no entity
 *   (then it is flown to on the default map). An entity link whose map is
 *   missing drops its center: those coordinates belong to the missing map.
 * - v2 (`ocean` option): the ocean is the fallback, so "no map" means the ocean (`mapId`
 *   null) and an unknown map id opens it, centre dropped, without saying whether the
 *   id exists elsewhere.
 * - Fly: to the kept center on the chosen map; else to the entity's
 *   placement on that map, if it has one there.
 */
export function resolveDeepLink(
  link: DeepLinkState,
  project: Pick<AtlasProject, "maps" | "placements">,
  { currentMapId, defaultMapId, hasDesktopAside, ocean }: ResolveDeepLinkOptions,
): ResolvedDeepLink {
  const mapExists = (id: string | null): id is string =>
    id != null && (ocean ? ocean.isMap(id) : project.maps.some((m) => m.id === id));
  const fallbackMapId = ocean
    ? null
    : mapExists(defaultMapId)
      ? defaultMapId
      : mapExists(currentMapId)
        ? currentMapId
        : (project.maps[0]?.id ?? null);

  const openId = link.entityId;
  const entityPlacements = openId ? project.placements.filter((p) => p.entityId === openId) : [];

  let mapId: string | null;
  if (mapExists(link.mapId)) {
    mapId = link.mapId;
  } else if (openId) {
    const onFallback = entityPlacements.find((p) => p.mapId === fallbackMapId);
    const first = entityPlacements.find((p) => mapExists(p.mapId));
    mapId = (onFallback ?? first)?.mapId ?? fallbackMapId;
  } else {
    mapId = fallbackMapId;
  }

  // The center belongs to the URL's map. v1: kept when that map exists or no entity is
  // named. v2: also kept for no map at all (an ocean camera) while the view stays the
  // ocean; a map id the output doesn't have drops it, whatever else the link says.
  const center = ocean
    ? (link.mapId != null ? mapExists(link.mapId) : mapId === null)
      ? link.center
      : null
    : mapExists(link.mapId) || !openId
      ? link.center
      : null;

  const map = project.maps.find((m) => m.id === mapId);
  let fly: DeepLinkFly | null = null;
  if (ocean && mapId === null && center) {
    fly = { x: center.x, y: center.y, height: ocean.height };
    if (link.zoom != null) fly.zoom = link.zoom;
  } else if (map && center) {
    fly = { x: center.x, y: center.y, height: map.height };
    if (link.zoom != null) fly.zoom = link.zoom;
  } else if (map && openId) {
    const placement = entityPlacements.find((p) => p.mapId === map.id);
    if (placement) fly = { x: placement.x, y: placement.y, height: map.height };
  }

  return { mapId, openId, fly, openSheet: openId != null && !hasDesktopAside };
}
