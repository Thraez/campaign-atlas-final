/**
 * Collect placement drafts for cross-map duplicates that live only in the
 * session's local overrides, keyed to a map other than the one currently
 * active.
 *
 * `duplicateToMap` (usePinOverrideMutations.ts) writes a full override value
 * under `${targetMapId}:${entityId}` regardless of which map is active. But
 * the page's dirty-tracking (dirtyCount, perMapDirtyCount, buildSavePlan) all
 * key off the ACTIVE map only, so a duplicate onto another map never
 * registered as unsaved and was silently dropped by Save unless the DM later
 * switched to that target map. This helper gathers those foreign-map entries
 * so the page can fold them into both its dirty signal and its Save payload.
 *
 * Only `duplicateToMap` ever writes a foreign-map key (every other mutation
 * in usePinOverrideMutations.ts keys off the active map), and it always
 * writes a complete `{x,y,label?,pin?}` value — never `null` — so every
 * foreign-map entry here is a real, self-contained placement, not a partial
 * diff that needs merging against canon.
 */
import type { Entity } from "@/atlas/content/schema";
import type { Overrides } from "@/atlas/editor/placementOverrides";
import type { PlacementOverride } from "@/atlas/yaml/buildPatches";

export function foreignMapDraftPlacements(
  overrides: Overrides,
  activeMapId: string,
  mapIds: readonly string[],
  entities: readonly Pick<Entity, "id" | "title">[],
): PlacementOverride[] {
  const titleById = new Map(entities.map((e) => [e.id, e.title]));
  const out: PlacementOverride[] = [];
  for (const mapId of mapIds) {
    if (mapId === activeMapId) continue;
    const prefix = `${mapId}:`;
    for (const [key, value] of Object.entries(overrides)) {
      if (!key.startsWith(prefix) || !value) continue;
      const entityId = key.slice(prefix.length);
      const title = titleById.get(entityId);
      out.push({
        entityId,
        mapId,
        x: value.x,
        y: value.y,
        label: value.label && value.label !== title ? value.label : undefined,
        pin: value.pin,
      });
    }
  }
  return out;
}

/**
 * The pin overrides left after a save: every override the batch wrote is
 * dropped, on the active map and on other maps alike. A written entity's
 * active-map overrides went in through its draft placements, its other-map
 * overrides through `foreignMapDrafts`; both now live in canon. An override
 * whose entity file was not in the batch stays.
 */
export function overridesAfterSave(
  overrides: Overrides,
  opts: {
    activeMapId: string;
    writtenEntityIds: ReadonlySet<string>;
    foreignMapDrafts: readonly Pick<PlacementOverride, "entityId" | "mapId">[];
  },
): Overrides {
  const foreignKeys = new Set(opts.foreignMapDrafts.map((d) => `${d.mapId}:${d.entityId}`));
  const next: Overrides = { ...overrides };
  for (const k of Object.keys(next)) {
    const sep = k.indexOf(":");
    const mapId = k.slice(0, sep);
    const entityId = k.slice(sep + 1);
    if (!opts.writtenEntityIds.has(entityId)) continue;
    if (mapId === opts.activeMapId || foreignKeys.has(k)) delete next[k];
  }
  return next;
}
