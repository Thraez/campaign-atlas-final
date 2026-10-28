/**
 * The editor's vault port: the dev server's `/__atlas/*` routes
 * (`scripts/vite-plugin-atlas-save.ts`). Editor-only, like every route it calls.
 */
import { ImportCommitError } from "@/atlas/import/buildImportChanges";
import { isWritableSourcePath } from "@/atlas/save/sourcePathAllowlist";
import { saveAtlasPatchToLocalFs } from "@/atlas/save/localFsSave";
import { loadSettings, loadSyncMap, saveSettings, saveSyncMap } from "./useSyncSettings";
import { VaultScanError, type VaultImageCopyResult, type VaultPort } from "./vaultPort";

export type VaultScanReply =
  { ok: true; files: Record<string, string> } | { ok: false; status: number; error: string };

/**
 * Reads a `/__atlas/vault-scan` reply. The route answers `{ files }` on 200
 * and `{ error }` otherwise; success is the HTTP status, not a body field
 * (eval-2026-10/13: the client used to look for `ok` in the body, which the
 * route never sends, so every real scan failed).
 */
export async function readVaultScanReply(resp: Response): Promise<VaultScanReply> {
  const body = (await resp.json().catch(() => ({}))) as { files?: unknown; error?: unknown };
  if (resp.ok && body.files && typeof body.files === "object") {
    return { ok: true, files: body.files as Record<string, string> };
  }
  const error = typeof body.error === "string" ? body.error : `HTTP ${resp.status}`;
  return { ok: false, status: resp.ok ? 500 : resp.status, error };
}

export function createDevEndpointPort(): VaultPort {
  return {
    async scanVault(source) {
      const params = new URLSearchParams({ vaultRoot: source.vaultRoot });
      for (const g of source.ignoreGlobs) params.append("ignore", g);
      for (const f of source.candidateFolders) params.append("folder", f);
      let reply: VaultScanReply;
      try {
        reply = await readVaultScanReply(await fetch(`/__atlas/vault-scan?${params.toString()}`));
      } catch (err) {
        throw new VaultScanError(0, err instanceof Error ? err.message : String(err));
      }
      if (!reply.ok) throw new VaultScanError(reply.status, reply.error);
      return reply.files;
    },

    async copyVaultImage(req) {
      const resp = await fetch("/__atlas/vault-image-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return (await resp.json()) as VaultImageCopyResult;
    },

    async readAtlasFile(path) {
      if (!isWritableSourcePath(path)) {
        throw new ImportCommitError(`Path not in source allowlist: ${path}`, path);
      }
      const res = await fetch(`/__atlas/read?path=${encodeURIComponent(path)}`, { method: "GET" });
      if (res.status === 404) return null;
      if (!res.ok)
        throw new ImportCommitError(`Failed to read ${path}: status ${res.status}`, path);
      const body = (await res.json()) as { contents?: unknown };
      if (typeof body.contents !== "string") {
        throw new ImportCommitError(`Malformed read response for ${path}`, path);
      }
      return body.contents;
    },

    writeAtlasFiles: (changes) => saveAtlasPatchToLocalFs(changes, undefined, { rebuild: true }),
    loadSyncMap: () => loadSyncMap(),
    saveSyncMap: (map) => saveSyncMap(map),
    async markSynced(at) {
      const s = await loadSettings();
      await saveSettings({ ...s, lastSyncAt: at });
    },
  };
}
