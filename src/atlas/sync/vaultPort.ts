/**
 * The vault port: everything Sync from Obsidian touches outside its own logic.
 * `planSync` and `commitSync` (`./sync.ts`) talk only to this.
 *
 * Three adapters:
 *   - `createDevEndpointPort` (`./devEndpointPort.ts`): the editor, through the
 *     dev server's `/__atlas/*` routes.
 *   - `createMemoryVaultPort` (`src/test/helpers/memoryVaultPort.ts`): tests.
 *   - `createFsVaultPort` (`scripts/atlas/fsVaultPort.ts`): Node, for
 *     `npm run atlas:sync`.
 *
 * Rules every adapter keeps:
 *   - The sync map is per world: an adapter reads and writes only the world
 *     it is given, and reads an old (pre-R-14) map as the v1 default world's.
 *   - The vault is only ever read. Writes go to atlas content, the published
 *     image folder and the local sync files (`.local-atlas/`).
 *   - `writeAtlasFiles` is the Save endpoint's contract: a change with
 *     `baseHash: null` is create-only, otherwise the file on disk must still
 *     hash to `baseHash`. Either failure throws `ConflictError` and writes
 *     nothing.
 *   - R-01: while `atlas.config.json` `hosting` is not "private", a vault
 *     image copy and a write with `origin: "sync"` throw `HostingPublicError`
 *     and write nothing (`./hosting.ts`). Scans and reads still work.
 */
import type { FileChange } from "@/atlas/save/localFsSave";
import type { SyncMap } from "@/atlas/import/syncMap";

/** Which part of the vault a sync reads. */
export interface SyncSource {
  /** Absolute path to the vault. */
  vaultRoot: string;
  /** DM globs to skip, on top of the built-in ignored folders (`ignoreRules.ts`). */
  ignoreGlobs: string[];
  /** Top-level vault folders the DM picked. Empty means the whole vault. */
  candidateFolders: string[];
}

/** A vault scan the adapter refused. `status` 413 means the vault is too large. */
export class VaultScanError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "VaultScanError";
  }
}

export interface VaultImageCopyRequest {
  vaultRoot: string;
  candidateFolders: string[];
  /** The note that embeds the image (vault-relative), for relative lookups. */
  noteRelPath: string;
  /** The embed's target as written, e.g. `portrait.png`. */
  rawSrc: string;
  entityId: string;
  /** Position of the embed in the note: names the copy `<entityId>-<index+1>`. */
  index: number;
}

export type VaultImageCopyResult = { ok: true; target: string } | { ok: false; reason: string };

export interface AtlasWriteResult {
  saved: number;
  /** True or false when the adapter rebuilt the atlas; undefined when it doesn't rebuild. */
  rebuilt?: boolean;
  rebuildError?: string;
}

export interface AtlasWriteOpts {
  /** "sync": a Sync from Obsidian write, refused while hosting is public. */
  origin?: "sync";
}

export interface VaultPort {
  /** Vault-relative POSIX path → raw text of every note in scope. Throws `VaultScanError`. */
  scanVault(source: SyncSource): Promise<Record<string, string>>;
  /** Copy one embedded image into the published images, refusing anything outside the picked folders. */
  copyVaultImage(req: VaultImageCopyRequest): Promise<VaultImageCopyResult>;
  /** An atlas content file's text (`content/...`), or null when there is none. */
  readAtlasFile(path: string): Promise<string | null>;
  /** Write atlas content (see the contract above). `origin: "sync"` marks a vault sync's write. */
  writeAtlasFiles(changes: FileChange[], opts?: AtlasWriteOpts): Promise<AtlasWriteResult>;
  /**
   * One world's sync map (R-14: `.local-atlas/sync-map.json` keeps one per
   * world; a pre-R-14 map reads as the v1 default world's, `syncMap.ts`).
   */
  loadSyncMap(worldId: string): Promise<SyncMap>;
  /** Replace one world's sync map, keeping every other world's. */
  saveSyncMap(worldId: string, map: SyncMap): Promise<void>;
  /** Remember when the last sync wrote something (editor settings `lastSyncAt`). */
  markSynced(at: string): Promise<void>;
}
