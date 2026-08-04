/** Entry stored per vault-relative POSIX path after a completed sync. */
export interface SyncMapEntry {
  /** Atlas entity id that this vault note last synced into. */
  id: string;
  /** Last-synced vault type (used for two-way type conflict detection in §3.6). */
  baseType: string;
  /**
   * `sha256:<hex>` of the vault note's raw bytes at the last successful sync.
   * Optional because maps written before this feature have no hash; those
   * entries classify as "unknown" once, then settle on the next sync.
   */
  approvedHash?: string;
  /**
   * `sha256:<hex>` of the atlas-side file exactly as the last sync wrote it.
   * Lets us tell "the DM edited this here" apart from "the sync wrote it".
   */
  syncedFileHash?: string;
}

/** Keyed by vault-relative POSIX path (e.g. "notes/corven.md"). */
export type SyncMap = Record<string, SyncMapEntry>;

/** How a scanned vault note relates to what was last published from it. */
export type VaultNoteState = "unchanged" | "changed" | "new" | "unknown";

/** Return the sync-map entry for a vault-relative path, or undefined if not present. */
export function lookupByPath(map: SyncMap, relPath: string): SyncMapEntry | undefined {
  return map[relPath];
}

/**
 * Compare a scanned note against what was last published from that path.
 * `currentHash` must come from hashContent() so the formats match.
 */
export function classifyVaultNote(
  map: SyncMap,
  relPath: string,
  currentHash: string,
): VaultNoteState {
  const entry = map[relPath];
  if (!entry) return "new";
  if (!entry.approvedHash) return "unknown";
  return entry.approvedHash === currentHash ? "unchanged" : "changed";
}

/**
 * Exact-hash lookup used to spot a renamed/moved note: a note with no entry at
 * its own path whose bytes match a hash recorded elsewhere. Exact match only —
 * deliberately not fuzzy (design §3, June §5.3).
 */
export function findPathByApprovedHash(map: SyncMap, hash: string): string | undefined {
  for (const [relPath, entry] of Object.entries(map)) {
    if (entry.approvedHash === hash) return relPath;
  }
  return undefined;
}

/**
 * True when the atlas-side file differs from what the last sync wrote — i.e. the
 * DM edited it in the editor. Returns false when unknown, so a first sync never
 * raises a false alarm.
 */
export function hasLocalEdits(map: SyncMap, relPath: string, currentFileHash: string): boolean {
  const entry = map[relPath];
  if (!entry?.syncedFileHash) return false;
  return entry.syncedFileHash !== currentFileHash;
}

/** Return a new SyncMap with the given entry added or updated (pure — does not mutate the original). */
export function recordSync(
  map: SyncMap,
  relPath: string,
  id: string,
  baseType: string,
  approvedHash?: string,
  syncedFileHash?: string,
): SyncMap {
  return {
    ...map,
    [relPath]: {
      id,
      baseType,
      ...(approvedHash ? { approvedHash } : {}),
      ...(syncedFileHash ? { syncedFileHash } : {}),
    },
  };
}
