/**
 * Node vault port for `npm run atlas:sync`: the same handlers the dev server
 * runs (`vite-plugin-atlas-save.ts`), called in-process instead of over HTTP.
 * Scan and image copy read the vault and never write to it; atlas writes go
 * through the Save endpoint's own handler (create-only / base-hash checks,
 * backups), and `.local-atlas/` writes through its local-write handler. No
 * rebuild: the caller runs `npm run atlas:build`.
 *
 * `dryRun: true` makes every write throw, so a dry run provably writes nothing.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  handleLocalWriteRequest,
  handleSaveRequest,
  handleVaultImageCopyRequest,
  handleVaultScanRequest,
} from "../vite-plugin-atlas-save";
import { isWritableSourcePath } from "../../src/atlas/save/sourcePathAllowlist";
import { ConflictError, LocalSaveError } from "../../src/atlas/save/localFsSave";
import { worldSyncMap } from "../../src/atlas/import/syncMap";
import type { SyncSettings } from "../../src/atlas/sync/useSyncSettings";
import { VaultScanError, type VaultPort } from "../../src/atlas/sync/vaultPort";
import { HOSTING_PUBLIC_ERROR, HostingPublicError } from "../../src/atlas/sync/hosting";
import { syncWritesAllowed } from "./hosting";
import { readRepoSyncMapFile, saveWorldSyncMap } from "./syncMapFile";

export interface FsVaultPortOptions {
  /** The atlas repo: `content/`, `public/` and `.local-atlas/` live here. */
  repoRoot: string;
  dryRun?: boolean;
}

export class DryRunWriteError extends Error {
  constructor(what: string) {
    super(`Dry run: refused to write ${what}`);
    this.name = "DryRunWriteError";
  }
}

/**
 * Reads `.local-atlas/<name>` as JSON. A missing file is `fallback`; a file
 * that isn't valid JSON throws, so a corrupt sync map or settings file stops
 * the run instead of being read as empty (and then overwritten).
 */
export async function readLocalAtlasJson<T>(
  repoRoot: string,
  name: string,
  fallback: T,
): Promise<T> {
  let text: string;
  try {
    text = await fs.readFile(path.join(repoRoot, ".local-atlas", name), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`.local-atlas/${name} is not valid JSON: ${(e as Error).message}`);
  }
}

/** Writes `.local-atlas/<name>` through the dev server's own local-write handler. */
async function writeLocalAtlasJson(repoRoot: string, name: string, value: unknown): Promise<void> {
  const r = await handleLocalWriteRequest(name, JSON.stringify(value, null, 2), repoRoot);
  if (!r.ok) throw new Error(`Could not write .local-atlas/${name} (${r.status}): ${r.error}`);
}

export function createFsVaultPort(opts: FsVaultPortOptions): VaultPort {
  const repoRoot = path.resolve(opts.repoRoot);
  const refuseInDryRun = (what: string) => {
    if (opts.dryRun) throw new DryRunWriteError(what);
  };

  return {
    async scanVault(source) {
      const r = await handleVaultScanRequest(
        source.vaultRoot,
        source.ignoreGlobs,
        source.candidateFolders,
      );
      if (!r.ok) throw new VaultScanError(r.status, r.error);
      return r.files;
    },

    async copyVaultImage(req) {
      refuseInDryRun(`an image copy of ${req.rawSrc}`);
      if (!syncWritesAllowed(repoRoot)) throw new HostingPublicError();
      return handleVaultImageCopyRequest({ ...req, publicDir: path.join(repoRoot, "public") });
    },

    async readAtlasFile(relPath) {
      if (!isWritableSourcePath(relPath)) throw new Error(`Not an atlas content path: ${relPath}`);
      try {
        return await fs.readFile(path.join(repoRoot, relPath), "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },

    async writeAtlasFiles(changes, writeOpts) {
      refuseInDryRun(`${changes.length} atlas file(s)`);
      const body = writeOpts?.origin
        ? { files: changes, origin: writeOpts.origin }
        : { files: changes };
      const r = await handleSaveRequest(body, repoRoot);
      if (r.status === 200) return { saved: r.payload.saved };
      if (r.status === 409) throw new ConflictError(r.payload.reason, r.payload.failedPath);
      if (r.status === 403 && r.payload.error === HOSTING_PUBLIC_ERROR) {
        throw new HostingPublicError(
          typeof r.payload.detail === "string" ? r.payload.detail : undefined,
        );
      }
      throw new LocalSaveError(`Save refused (${r.status})`, r.payload);
    },

    async loadSyncMap(worldId) {
      return worldSyncMap(await readRepoSyncMapFile(repoRoot), worldId);
    },

    async saveSyncMap(worldId, map) {
      refuseInDryRun("the sync map");
      // The same locked merge as the dev server's route (R-14).
      await saveWorldSyncMap(repoRoot, worldId, map);
    },

    async markSynced(at) {
      refuseInDryRun("the sync time");
      const settings = await readLocalAtlasJson<SyncSettings>(repoRoot, "editor-settings.json", {});
      await writeLocalAtlasJson(repoRoot, "editor-settings.json", { ...settings, lastSyncAt: at });
    },
  };
}
