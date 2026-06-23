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
