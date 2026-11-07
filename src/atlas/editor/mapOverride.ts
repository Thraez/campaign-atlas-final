/**
 * The editor's per-map metadata override (`mapOverride` in
 * AtlasPlacementEditor): pure updates, so the page and its tests share them.
 * A map with no overridden keys has no entry, so it counts as unchanged.
 */
import type { MapDocument } from "@/atlas/content/schema";

export type MapOverrides = Record<string, Partial<MapDocument>>;

/** Merge `patch` into map `mapId`'s override. */
export function withMapPatch(
  s: MapOverrides,
  mapId: string,
  patch: Partial<MapDocument>,
): MapOverrides {
  return { ...s, [mapId]: { ...(s[mapId] ?? {}), ...patch } };
}

/** Drop `key` from map `mapId`'s override (back to the saved value), and the
 *  map's entry once nothing is left in it. Returns `s` itself when `key` is
 *  not overridden. */
export function withoutMapKey(
  s: MapOverrides,
  mapId: string,
  key: keyof MapDocument,
): MapOverrides {
  const cur = s[mapId];
  if (!cur || !(key in cur)) return s;
  const rest = { ...cur };
  delete rest[key];
  const out = { ...s };
  if (Object.keys(rest).length > 0) out[mapId] = rest;
  else delete out[mapId];
  return out;
}
