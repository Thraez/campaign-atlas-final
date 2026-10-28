/**
 * Node vault port for `npm run atlas:sync`: the same handlers the dev server
 * runs (`vite-plugin-atlas-save.ts`), called in-process instead of over HTTP.
 * Scan and image copy read the vault and never write to it; atlas writes go
 * through the Save endpoint's own handler (create-only / base-hash checks,
 * backups). No rebuild: the caller runs `npm run atlas:build`.
 *
 * `dryRun: true` makes every write throw, so a dry run provably writes nothing.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  handleSaveRequest,
  handleVaultImageCopyRequest,
  handleVaultScanRequest,
} from "../vite-plugin-atlas-save";
import { isWritableSourcePath } from "../../src/atlas/save/sourcePathAllowlist";
import { ConflictError, LocalSaveError } from "../../src/atlas/save/localFsSave";
import type { SyncMap } from "../../src/atlas/import/syncMap";
import { VaultScanError, type VaultPort } from "../../src/atlas/sync/vaultPort";

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

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

export function createFsVaultPort(opts: FsVaultPortOptions): VaultPort {
  const repoRoot = path.resolve(opts.repoRoot);
  const localAtlas = path.join(repoRoot, ".local-atlas");
  const syncMapFile = path.join(localAtlas, "sync-map.json");
  const settingsFile = path.join(localAtlas, "editor-settings.json");
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

    async writeAtlasFiles(changes) {
      refuseInDryRun(`${changes.length} atlas file(s)`);
      const r = await handleSaveRequest({ files: changes }, repoRoot);
      if (r.status === 200) return { saved: r.payload.saved };
      if (r.status === 409) throw new ConflictError(r.payload.reason, r.payload.failedPath);
      throw new LocalSaveError(`Save refused (${r.status})`, r.payload);
    },

    async loadSyncMap() {
      return (await readJson<SyncMap>(syncMapFile)) ?? {};
    },

    async saveSyncMap(map) {
      refuseInDryRun("the sync map");
      await writeJson(syncMapFile, map);
    },

    async markSynced(at) {
      refuseInDryRun("the sync time");
      const settings = (await readJson<Record<string, unknown>>(settingsFile)) ?? {};
      await writeJson(settingsFile, { ...settings, lastSyncAt: at });
    },
  };
}
