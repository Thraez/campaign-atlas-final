/**
 * Phase 1C — orchestrator hook for the .md staging-and-import flow.
 *
 * Owns the modal state, parses dropped/picked files into StagingRow[], routes
 * the committed batch through the unified Save endpoint, and triggers a canon
 * reload so newly-imported entities show up without a page refresh.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildStagingRows,
  updateStagingRow,
  type RawImportFile,
  type StagingRow,
  type StagingRowPatch,
} from "./stagingState";
import { buildImportChanges, readSourceFile, ImportCommitError } from "./buildImportChanges";
import {
  saveAtlasPatchToLocalFs,
  ConflictError,
  SaveBusyError,
  hashContent,
} from "@/atlas/save/localFsSave";
import type { ImportFolderConfig } from "../content/schema";
import { summarizeImport, formatImportSummaryLine } from "./summarizeImport";
import { recordSync, classifyVaultNote, findPathByApprovedHash, hasLocalEdits } from "./syncMap";
import { loadSyncMap, saveSyncMap, loadSettings, saveSettings } from "../sync/useSyncSettings";
import { rewriteEmbeds } from "./resolveVaultImage";

/** Thrown by assertDmBuildLoaded when the DM atlas has not been built yet. */
export class DmBuildRequiredError extends Error {
  constructor() {
    super("Rebuild in DM mode first — Sync needs the full DM atlas loaded.");
    this.name = "DmBuildRequiredError";
  }
}

/**
 * Guard: requires the DM build to be loaded before a vault sync can run.
 * Throws DmBuildRequiredError if existingById is empty (player atlas or no build).
 * Phase 3's openWithVaultScan calls this before fetching vault files.
 */
export function assertDmBuildLoaded(existingById: ReadonlyMap<string, string>): void {
  if (existingById.size === 0) {
    throw new DmBuildRequiredError();
  }
}

export interface UseMdImportFlowArgs {
  /** Active world id; drives target-path allowlist. */
  worldId: string;
  /** Folder configuration for the active world; drives the allowed-folder set. */
  importConfig: ImportFolderConfig;
  /** Map of entity id → sourcePath for conflict detection (update vs create). */
  existingById: ReadonlyMap<string, string>;
  /** Called after a successful import so the editor can reload canon. */
  onImported: () => void | Promise<void>;
}

/**
 * Maps a `/__atlas/vault-scan` response to staging inputs.
 * Extracts the POSIX basename for the staging filename and preserves the
 * vault-relative path for sync-map identity resolution.
 */
export function vaultScanResultToInputs(files: Record<string, string>): RawImportFile[] {
  return Object.entries(files).map(([relPath, raw]) => ({
    filename: relPath.split("/").pop() ?? relPath,
    raw,
    vaultRelPath: relPath,
  }));
}

export function useMdImportFlow(args: UseMdImportFlowArgs) {
  const { worldId, importConfig, existingById, onImported } = args;
  const [rows, setRows] = useState<StagingRow[]>([]);
  const [open, setOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  /** Vault scan context, captured at scan time so commit() can copy embedded images. */
  const vaultScanCtxRef = useRef<{ vaultRoot: string; candidateFolders: string[] } | null>(null);

  const ctx = useMemo(() => {
    const allowedFolders = new Set([
      ...Object.values(importConfig.folders),
      importConfig.defaultFolder,
    ]) as ReadonlySet<string>;
    const existingPaths = new Set(existingById.values()) as ReadonlySet<string>;
    return { worldId, importConfig, allowedFolders, existingById, existingPaths };
  }, [worldId, importConfig, existingById]);

  const openWithInputs = useCallback(
    (inputs: RawImportFile[]) => {
      if (inputs.length === 0) {
        toast.error("No .md files to stage");
        return;
      }
      setRows(buildStagingRows(inputs, ctx));
      setOpen(true);
    },
    [ctx],
  );

  const openWithFiles = useCallback(
    async (files: File[]) => {
      const mdFiles = files.filter((f) => /\.md$/i.test(f.name));
      const dropped = files.length - mdFiles.length;
      if (mdFiles.length === 0) {
        toast.error("Only .md files supported");
        return;
      }
      if (dropped > 0) {
        toast.warning(`Skipped ${dropped} non-.md file${dropped === 1 ? "" : "s"}`);
      }
      const inputs = await Promise.all(
        mdFiles.map(async (f) => ({ filename: f.name, raw: await f.text() })),
      );
      openWithInputs(inputs);
    },
    [openWithInputs],
  );

  const openWithVaultScan = useCallback(
    async (vaultRoot: string, ignoreGlobs: string[], candidateFolders: string[] = []) => {
      try {
        assertDmBuildLoaded(existingById);
      } catch (err) {
        if (err instanceof DmBuildRequiredError) {
          toast.error(err.message);
          return;
        }
        throw err;
      }
      const params = new URLSearchParams({ vaultRoot });
      for (const g of ignoreGlobs) params.append("ignore", g);
      for (const f of candidateFolders) params.append("folder", f);
      let data:
        { ok: true; files: Record<string, string> } | { ok: false; status: number; error: string };
      try {
        const resp = await fetch(`/__atlas/vault-scan?${params.toString()}`);
        data = (await resp.json()) as typeof data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Vault scan failed: ${msg}`);
        return;
      }
      if (!data.ok) {
        if (data.status === 413) {
          toast.error("Vault is too large to scan — more than 25 MB of Obsidian notes");
        } else {
          toast.error(`Vault scan failed: ${data.error}`);
        }
        return;
      }
      vaultScanCtxRef.current = { vaultRoot, candidateFolders };
      const syncMap = await loadSyncMap();
      const inputs = await Promise.all(
        Object.entries(data.files).map(async ([relPath, raw]) => {
          const hash = await hashContent(raw);
          let vaultState = classifyVaultNote(syncMap, relPath, hash);
          // A note with no entry at its own path whose bytes match a hash
          // recorded elsewhere is a move/rename, not a new note.
          if (vaultState === "new" && findPathByApprovedHash(syncMap, hash)) {
            vaultState = "unchanged";
          }
          return {
            filename: relPath.split("/").pop() ?? relPath,
            raw,
            vaultRelPath: relPath,
            vaultState,
            vaultHash: hash,
          };
        }),
      );
      if (inputs.length === 0) {
        toast.error("No .md files to stage");
        return;
      }
      const staged = buildStagingRows(inputs, ctx);
      // A "changed" update row would overwrite the atlas copy's content — if the
      // DM has since edited that copy in the editor, that edit is about to be
      // lost. Hold the row for review instead of ticking it by default.
      const checked = await Promise.all(
        staged.map(async (row) => {
          if (row.rowKind !== "update" || row.vaultState !== "changed" || !row.vaultRelPath) {
            return row;
          }
          let diskRaw: string;
          try {
            diskRaw = await readSourceFile(row.targetPath, fetch);
          } catch {
            return row; // can't verify — don't block the DM on a read failure
          }
          const diskHash = await hashContent(diskRaw);
          if (!hasLocalEdits(syncMap, row.vaultRelPath, diskHash)) return row;
          return { ...row, needsReview: { reason: "local-edits" as const }, included: false };
        }),
      );
      setRows(checked);
      setOpen(true);
    },
    [existingById, ctx],
  );

  const patchRow = useCallback(
    (id: string, patch: StagingRowPatch) => {
      setRows((rs) => rs.map((r) => (r.id === id ? updateStagingRow(r, patch, ctx) : r)));
    },
    [ctx],
  );

  const cancel = useCallback(() => {
    setOpen(false);
    setRows([]);
  }, []);

  const commit = useCallback(async () => {
    setIsImporting(true);
    try {
      const vaultCtx = vaultScanCtxRef.current;
      let skippedTotal = 0;
      const rowsForCommit = await Promise.all(
        rows.map(async (row) => {
          if (!row.included || !row.vaultRelPath || !vaultCtx) return row;
          const embeds = [...row.rawContent.matchAll(/!\[\[([^\]]+)\]\]/g)].map((m) =>
            m[1].split("|")[0].trim(),
          );
          if (embeds.length === 0) return row;
          const copied: Record<string, string> = {};
          for (const [i, src] of embeds.entries()) {
            const resp = await fetch("/__atlas/vault-image-copy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                vaultRoot: vaultCtx.vaultRoot,
                candidateFolders: vaultCtx.candidateFolders,
                noteRelPath: row.vaultRelPath,
                rawSrc: src,
                entityId: row.resolvedId,
                index: i,
              }),
            });
            const result = (await resp.json()) as
              | { ok: true; target: string }
              | { ok: false; reason: string };
            if (result.ok) copied[src] = result.target;
            else skippedTotal += 1;
          }
          return { ...row, rawContent: rewriteEmbeds(row.rawContent, copied) };
        }),
      );
      if (skippedTotal > 0) {
        toast.warning(
          `${skippedTotal} image${skippedTotal === 1 ? "" : "s"} skipped — not in the folders you picked.`,
        );
      }
      const changes = await buildImportChanges(rowsForCommit);
      const result = await saveAtlasPatchToLocalFs(changes, undefined, { rebuild: true });
      const count = result.saved;
      if (result.rebuilt === false) {
        toast.warning(`Imported ${count} file${count === 1 ? "" : "s"} but atlas rebuild failed`, {
          description: result.rebuildError ?? "Run `npm run atlas:build` manually.",
          duration: 12_000,
        });
      } else {
        const summary = summarizeImport(rows);
        const mainLine = formatImportSummaryLine(summary);
        const couldntLine =
          summary.couldntBeRead > 0
            ? `${summary.couldntBeRead} couldn't be read — check the source file${summary.couldntBeRead === 1 ? "" : "s"}.`
            : undefined;
        const description = [mainLine, couldntLine].filter(Boolean).join("\n") || undefined;
        if (summary.couldntBeRead > 0) {
          toast.warning(`Imported ${count} note${count === 1 ? "" : "s"} and rebuilt the atlas`, {
            description,
            duration: 10_000,
          });
        } else {
          toast.success(`Imported ${count} note${count === 1 ? "" : "s"} and rebuilt the atlas`, {
            description,
          });
        }
        // Persist sync-map for vault-scan rows
        const vaultRows = rows.filter(
          (r) => r.vaultRelPath && r.included && r.pathAllowed && !r.parseError,
        );
        if (vaultRows.length > 0) {
          const contentByPath = new Map(changes.map((c) => [c.path, c.content]));
          let syncMap = await loadSyncMap();
          for (const r of vaultRows) {
            const written = contentByPath.get(r.targetPath);
            const syncedFileHash = written !== undefined ? await hashContent(written) : undefined;
            syncMap = recordSync(
              syncMap,
              r.vaultRelPath!,
              r.resolvedId,
              r.inferredType,
              r.vaultHash,
              syncedFileHash,
            );
          }
          await saveSyncMap(syncMap);
          const s = await loadSettings();
          await saveSettings({ ...s, lastSyncAt: new Date().toISOString() });
        }
      }
      setOpen(false);
      setRows([]);
      await onImported();
    } catch (err) {
      if (err instanceof ConflictError) {
        // ConflictError on the import path means the on-disk state diverged
        // from what staging saw. For "already-exists" the most common cause
        // is a file with the same target path that wasn't yet in atlas.json
        // (e.g. imports/ items the build pipeline hasn't ingested yet) — so
        // staging never saw it as a conflict row, and simply re-opening the
        // modal won't change that: existingById/existingPaths are still
        // stale until the atlas is rebuilt and canon is reloaded. Tell the
        // user the step that actually makes the row detectable again, not
        // the checkbox that only works once it is.
        const summary =
          err.reason === "already-exists"
            ? "Target file exists on disk but wasn't in the project yet. Run `npm run atlas:build` and reload canon, then re-open the modal and check 'Select all overwrites' — or rename the target to skip the collision."
            : err.reason === "stale-base"
              ? "File changed outside the editor between staging and commit. Reload canon and retry."
              : "File disappeared between staging and commit. Reload canon and retry.";
        toast.error(`Import conflict: ${err.failedPath}`, {
          description: summary,
          duration: 12_000,
        });
      } else if (err instanceof SaveBusyError) {
        toast.error("Another save is already in flight — try again in a moment");
      } else if (err instanceof ImportCommitError) {
        toast.error(`Could not prepare import: ${err.message}`, {
          description:
            err.message === "No rows selected for import"
              ? "Every row is either blocked (parse error / outside allowlist) or an unchecked conflict. Resolve the per-row issues in the staging modal first."
              : undefined,
          duration: 10_000,
        });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Import failed: ${msg}`);
      }
    } finally {
      setIsImporting(false);
    }
  }, [rows, onImported]);

  return {
    open,
    rows,
    isImporting,
    openWithFiles,
    openWithInputs,
    openWithVaultScan,
    patchRow,
    cancel,
    commit,
  };
}
