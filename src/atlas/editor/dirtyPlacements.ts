import type { PlacementOverride } from "@/atlas/yaml/buildPatches";
import type { OverrideValue } from "@/atlas/editor/placementOverrides";

/**
 * Build one draft placement per entity with an effective placement (canon
 * frontmatter or a local override) on the given map. `effectivePlacement`
 * is the same lookup the editor's pin-override hook exposes; entities it
 * returns null for (no placement at all) are skipped. The label is omitted
 * when it matches the entity's own title, since that's the "no override"
 * default the save path expects.
 */
export function buildDraftPlacements(
  entities: readonly { id: string; title: string }[],
  mapId: string,
  effectivePlacement: (entityId: string) => OverrideValue | null,
): PlacementOverride[] {
  const out: PlacementOverride[] = [];
  for (const e of entities) {
    const eff = effectivePlacement(e.id);
    if (!eff) continue;
    out.push({
      entityId: e.id,
      mapId,
      x: eff.x,
      y: eff.y,
      label: eff.label && eff.label !== e.title ? eff.label : undefined,
      pin: eff.pin,
    });
  }
  return out;
}

/**
 * Gate draft placements to only those the DM actually overrode locally on the
 * active map.
 *
 * `buildDraftPlacements()` returns one draft per *effective* placement, which
 * includes entities placed purely by their canon frontmatter (no local edit).
 * Saving all of those would rewrite every placed entity's .md on every Save
 * even when nothing changed (QA finding B3). A placement is "dirty" iff an
 * override key exists for it in the session overrides map — tested by key
 * PRESENCE, not truthiness, because a stored `null` is an explicit
 * reset/remove and is itself a real edit that must be persisted.
 */
export function filterDirtyPlacements<T extends { entityId: string }>(
  drafts: readonly T[],
  overrides: Record<string, unknown>,
  mapId: string,
): T[] {
  return drafts.filter((d) => `${mapId}:${d.entityId}` in overrides);
}
