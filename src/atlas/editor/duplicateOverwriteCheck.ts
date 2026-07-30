/**
 * Whether an entity already has a placement (canon or local override) on a
 * given map — used to warn before "Duplicate to map" silently overwrites it.
 * Key presence in `overrides` wins over canon (a stored `null` means the DM
 * explicitly removed it from that map, so it does NOT count as existing).
 */
import type { Overrides } from "@/atlas/editor/placementOverrides";

export function targetMapHasPlacement(
  mapId: string,
  entityId: string,
  overrides: Overrides,
  canonPlacements: readonly { entityId: string; mapId: string }[],
): boolean {
  const key = `${mapId}:${entityId}`;
  if (key in overrides) return overrides[key] !== null;
  return canonPlacements.some((p) => p.entityId === entityId && p.mapId === mapId);
}
