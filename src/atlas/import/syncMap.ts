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
/** Re-key a note's entry after it moved in the vault; the entry itself is unchanged. */
export function moveSyncEntry(map: SyncMap, fromPath: string, toPath: string): SyncMap {
  const entry = map[fromPath];
  if (!entry) return map;
  const { [fromPath]: _moved, ...rest } = map;
  return { ...rest, [toPath]: entry };
}

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

// ── The sync-map file, per world (R-14) ─────────────────────────────────────

/**
 * `.local-atlas/sync-map.json` since R-14: one `SyncMap` per world, so the
 * same vault note synced into two worlds keeps an entry in each. A file
 * written before R-14 is a bare `SyncMap` (path → entry); it reads as the
 * v1 default world's (`atlas.config.json` `defaultWorld`), the only world
 * Sync could write into then.
 */
export interface SyncMapFile {
  version: 2;
  /** World id → that world's sync map. */
  worlds: Record<string, SyncMap>;
  /** Top-level fields a newer writer added: kept as they are. */
  [field: string]: unknown;
}

export const EMPTY_SYNC_MAP_FILE: SyncMapFile = { version: 2, worlds: {} };

/** Thrown when a sync-map file can't be read as either shape. */
export class SyncMapFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncMapFormatError";
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The world an old flat map reads as: `defaultWorld` from a parsed
 * `atlas.config.json`, or null when it has none.
 */
export function legacySyncMapWorld(atlasConfig: unknown): string | null {
  const v = isRecord(atlasConfig) ? atlasConfig.defaultWorld : undefined;
  return typeof v === "string" && v ? v : null;
}

/** World ids that would collide with an object's own machinery. */
const RESERVED_WORLD_IDS = new Set(["__proto__", "constructor", "prototype"]);

function assertWorldId(worldId: string): void {
  if (!worldId || RESERVED_WORLD_IDS.has(worldId)) {
    throw new SyncMapFormatError(`sync-map.json: "${worldId}" can't be a world id`);
  }
}

/**
 * A parsed sync-map file as `SyncMapFile`. A pre-R-14 map (no `version`)
 * becomes `legacyWorldId`'s map; with `legacyWorldId` null, a non-empty old
 * map throws, since nothing says which world it belongs to. Missing (null or
 * undefined) reads as empty. Top-level fields other than `version` and
 * `worlds` are kept, so a newer writer's fields survive a write from here.
 * Throws `SyncMapFormatError` on anything else: an unknown version, a
 * `worlds` that isn't an object, or a reserved world id.
 */
export function readSyncMapFile(raw: unknown, legacyWorldId: string | null): SyncMapFile {
  if (raw === null || raw === undefined) return { version: 2, worlds: {} };
  if (!isRecord(raw)) throw new SyncMapFormatError("sync-map.json is not a JSON object");
  if ("version" in raw) {
    if (raw.version !== 2) {
      throw new SyncMapFormatError(`sync-map.json has an unknown version ${String(raw.version)}`);
    }
    if (!isRecord(raw.worlds)) {
      throw new SyncMapFormatError("sync-map.json: `worlds` is not an object");
    }
    const worlds: Record<string, SyncMap> = {};
    for (const [worldId, map] of Object.entries(raw.worlds)) {
      assertWorldId(worldId);
      if (!isRecord(map)) {
        throw new SyncMapFormatError(`sync-map.json: world "${worldId}" is not an object`);
      }
      worlds[worldId] = { ...(map as SyncMap) };
    }
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k !== "version" && k !== "worlds" && !RESERVED_WORLD_IDS.has(k)) extra[k] = v;
    }
    return { ...extra, version: 2, worlds };
  }
  if (Object.keys(raw).length === 0) return { version: 2, worlds: {} };
  if (!legacyWorldId) {
    throw new SyncMapFormatError(
      "sync-map.json predates worlds (R-14) and no default world is known to read it as",
    );
  }
  assertWorldId(legacyWorldId);
  return { version: 2, worlds: { [legacyWorldId]: { ...(raw as SyncMap) } } };
}

/** One world's sync map (empty when the world has none yet). */
export function worldSyncMap(file: SyncMapFile, worldId: string): SyncMap {
  assertWorldId(worldId);
  return Object.prototype.hasOwnProperty.call(file.worlds, worldId)
    ? { ...file.worlds[worldId] }
    : {};
}

/** The file with one world's map replaced; every other world and top-level field is kept. */
export function withWorldSyncMap(file: SyncMapFile, worldId: string, map: SyncMap): SyncMapFile {
  assertWorldId(worldId);
  return { ...file, version: 2, worlds: { ...file.worlds, [worldId]: { ...map } } };
}

/**
 * Every entry in a parsed sync-map file of either shape, whatever its world.
 * For the R-01 vault-content signals, which must see every world's entries.
 * Validates as `readSyncMapFile` does, so a file Sync can't read (an unknown
 * version, a malformed `worlds`) throws `SyncMapFormatError` here too rather
 * than giving the guard no ids.
 */
export function allSyncMapEntries(raw: unknown): SyncMapEntry[] {
  // The world an old flat map belongs to doesn't matter here: every entry counts.
  const file = readSyncMapFile(raw, "legacy");
  const out: SyncMapEntry[] = [];
  for (const map of Object.values(file.worlds)) {
    for (const entry of Object.values(map)) {
      if (isRecord(entry)) out.push(entry as unknown as SyncMapEntry);
    }
  }
  return out;
}
