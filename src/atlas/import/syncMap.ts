/** Entry stored per vault-relative POSIX path after a completed sync. */
export interface SyncMapEntry {
  /** Atlas entity id that this vault note last synced into. */
  id: string;
  /** Last-synced vault type (used for two-way type conflict detection in §3.6). */
  baseType: string;
}

/** Keyed by vault-relative POSIX path (e.g. "notes/corven.md"). */
export type SyncMap = Record<string, SyncMapEntry>;

/** Return the sync-map entry for a vault-relative path, or undefined if not present. */
export function lookupByPath(map: SyncMap, relPath: string): SyncMapEntry | undefined {
  return map[relPath];
}

/** Return a new SyncMap with the given entry added or updated (pure — does not mutate the original). */
export function recordSync(
  map: SyncMap,
  relPath: string,
  id: string,
  baseType: string,
): SyncMap {
  return { ...map, [relPath]: { id, baseType } };
}
