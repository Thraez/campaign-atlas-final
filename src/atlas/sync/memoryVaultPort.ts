/**
 * In-memory vault port for tests. Same rules as the dev endpoint: the scan
 * honours ignored folders, DM globs and picked folders; image copies go
 * through `resolveVaultImage`; writes are create-only or base-hash checked.
 * The state is public so a test can look at what a sync did.
 */
import { makeIgnore } from "@/atlas/import/ignoreRules";
import { resolveVaultImage, vaultImageTargetName } from "@/atlas/import/resolveVaultImage";
import type { SyncMap } from "@/atlas/import/syncMap";
import { ConflictError, hashContent, type FileChange } from "@/atlas/save/localFsSave";
import type {
  AtlasWriteResult,
  SyncSource,
  VaultImageCopyRequest,
  VaultImageCopyResult,
  VaultPort,
} from "./vaultPort";

export interface MemoryVaultInit {
  /** Vault-relative path → note text. */
  notes?: Record<string, string>;
  /** Vault-relative paths of image files. */
  images?: string[];
  /** Atlas content path → text. */
  atlas?: Record<string, string>;
  syncMap?: SyncMap;
  /** Make every write report a failed rebuild (the files are still written). */
  rebuildFails?: boolean;
}

export interface MemoryVaultPort extends VaultPort {
  notes: Record<string, string>;
  images: string[];
  atlas: Map<string, string>;
  syncMap: SyncMap;
  /** Published image paths, in copy order. */
  copiedImages: string[];
  /** Every write the port took: atlas batches, sync-map saves and sync stamps. */
  writes: { kind: "atlas" | "sync-map" | "synced"; detail: string }[];
}

export function createMemoryVaultPort(init: MemoryVaultInit = {}): MemoryVaultPort {
  const port: MemoryVaultPort = {
    notes: { ...init.notes },
    images: [...(init.images ?? [])],
    atlas: new Map(Object.entries(init.atlas ?? {})),
    syncMap: { ...init.syncMap },
    copiedImages: [],
    writes: [],

    async scanVault(source: SyncSource) {
      const ignored = makeIgnore(source.ignoreGlobs);
      const inScope = (p: string) =>
        source.candidateFolders.length === 0 ||
        source.candidateFolders.some((f) => p === f || p.startsWith(`${f}/`));
      const out: Record<string, string> = {};
      for (const [p, raw] of Object.entries(port.notes)) {
        if (p.endsWith(".md") && !ignored(p) && inScope(p)) out[p] = raw;
      }
      return out;
    },

    async copyVaultImage(req: VaultImageCopyRequest): Promise<VaultImageCopyResult> {
      const hit = resolveVaultImage(req.rawSrc, req.noteRelPath, port.images, req.candidateFolders);
      if (!hit.ok) return hit;
      const target = `/atlas/assets/images/${vaultImageTargetName(req.entityId, req.index, hit.relPath)}`;
      port.copiedImages.push(target);
      return { ok: true, target };
    },

    async readAtlasFile(path: string) {
      return port.atlas.get(path) ?? null;
    },

    async writeAtlasFiles(changes: FileChange[]): Promise<AtlasWriteResult> {
      for (const c of changes) {
        const current = port.atlas.get(c.path);
        if (c.baseHash === null) {
          if (current !== undefined) throw new ConflictError("already-exists", c.path);
        } else if (current === undefined) {
          throw new ConflictError("missing-base", c.path);
        } else if ((await hashContent(current)) !== c.baseHash) {
          throw new ConflictError("stale-base", c.path);
        }
      }
      for (const c of changes) port.atlas.set(c.path, c.content);
      port.writes.push({ kind: "atlas", detail: changes.map((c) => c.path).join(", ") });
      return init.rebuildFails
        ? { saved: changes.length, rebuilt: false, rebuildError: "build failed" }
        : { saved: changes.length, rebuilt: true };
    },

    async loadSyncMap() {
      return { ...port.syncMap };
    },

    async saveSyncMap(map: SyncMap) {
      port.syncMap = { ...map };
      port.writes.push({ kind: "sync-map", detail: Object.keys(map).join(", ") });
    },

    async markSynced(at: string) {
      port.writes.push({ kind: "synced", detail: at });
    },
  };
  return port;
}
