/**
 * Collect the pin drafts the session holds for maps other than the active one.
 *
 * Pin overrides are keyed `${mapId}:${entityId}`. The page's active-map
 * signals (dirtyCount, buildSavePlan) only see the active map's keys, so
 * edits keyed to another map are gathered here and folded into both the one
 * unsaved signal and the Save batch:
 *
 *  - `duplicateToMap` writes a complete `{x,y,label?,pin?}` under the target
 *    map's key, whichever map is active: a self-contained placement.
 *  - `removeCoord` writes `null` on the map it ran on; once the DM switches
 *    away, that deletion is a foreign entry too, returned as a removal
 *    (eval-45).
 */
import type { Entity } from "@/atlas/content/schema";
import type { Overrides } from "@/atlas/editor/placementOverrides";
import type { PlacementOverride } from "@/atlas/yaml/buildPatches";
import type { PlacementChange } from "@/atlas/save/canonicalPlacementSave";

export function foreignMapDraftPlacements(
  overrides: Overrides,
  activeMapId: string,
  mapIds: readonly string[],
  entities: readonly Pick<Entity, "id" | "title">[],
): PlacementChange[] {
  const titleById = new Map(entities.map((e) => [e.id, e.title]));
  const out: PlacementChange[] = [];
  for (const mapId of mapIds) {
    if (mapId === activeMapId) continue;
    const prefix = `${mapId}:`;
    for (const [key, value] of Object.entries(overrides)) {
      if (!key.startsWith(prefix)) continue;
      const entityId = key.slice(prefix.length);
      if (value === null) {
        out.push({ entityId, mapId, removed: true });
        continue;
      }
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
