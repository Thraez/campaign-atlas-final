/**
 * The editor's hook over Sync from Obsidian (`src/atlas/sync/sync.ts`): owns
 * the Staging modal's state and turns sync results and errors into toasts.
 * The steps themselves (scan, classify, conflict check, image copy, write,
 * sync map) live in `planSync` / `commitSync`; this only wires them to the
 * dev endpoint port and to React.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildStagingRows,
  updateStagingRow,
  type RawImportFile,
  type StagingRow,
  type StagingContext,
  type StagingRowPatch,
} from "./stagingState";
import { ImportCommitError } from "./buildImportChanges";
import { ConflictError, SaveBusyError } from "@/atlas/save/localFsSave";
import type { ImportFolderConfig } from "../content/schema";
import { summarizeImport, formatImportSummaryLine } from "./summarizeImport";
import {
  commitSync,
  DmBuildRequiredError,
  planSync,
  stagingContext,
  type SyncWorld,
} from "../sync/sync";
import { createDevEndpointPort } from "../sync/devEndpointPort";
import { VaultScanError, type SyncSource, type VaultPort } from "../sync/vaultPort";

export interface UseMdImportFlowArgs {
  /** Active world id; drives target-path allowlist. */
  worldId: string;
  /** Folder configuration for the active world; drives the allowed-folder set. */
  importConfig: ImportFolderConfig;
  /** Map of entity id → sourcePath for conflict detection (update vs create). */
  existingById: ReadonlyMap<string, string>;
  /** Entity id → its visibility and type in the DM atlas, so an update row shows
   *  the visibility it keeps and a secrecy increase is held for review. */
  entityMeta?: StagingContext["entityMeta"];
  /** Called after a successful import so the editor can reload canon. */
  onImported: () => void | Promise<void>;
  /** Where sync reads and writes; the dev endpoint unless a test passes another. */
  port?: VaultPort;
}

export function useMdImportFlow(args: UseMdImportFlowArgs) {
  const { worldId, importConfig, existingById, entityMeta, onImported } = args;
  const [rows, setRows] = useState<StagingRow[]>([]);
  const [open, setOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const defaultPort = useMemo(() => createDevEndpointPort(), []);
  const port = args.port ?? defaultPort;
  /** The vault the open rows came from (null for dropped or pasted files). */
  const sourceRef = useRef<SyncSource | null>(null);

  const world = useMemo(
    (): SyncWorld => ({ worldId, importConfig, existingById, entityMeta }),
    [worldId, importConfig, existingById, entityMeta],
  );
  const ctx = useMemo(() => stagingContext(world), [world]);

  const openWithInputs = useCallback(
    (inputs: RawImportFile[]) => {
      if (inputs.length === 0) {
        toast.error("No .md files to stage");
        return;
      }
      sourceRef.current = null;
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
      const source: SyncSource = { vaultRoot, ignoreGlobs, candidateFolders };
      let planned: StagingRow[];
      try {
        planned = (await planSync(port, world, source)).rows;
      } catch (err) {
        if (err instanceof DmBuildRequiredError) {
          toast.error(err.message);
          return;
        }
        if (err instanceof VaultScanError) {
          toast.error(
            err.status === 413
              ? "Vault is too large to scan — more than 25 MB of Obsidian notes"
              : `Vault scan failed: ${err.message}`,
          );
          return;
        }
        throw err;
      }
      if (planned.length === 0) {
        toast.error("No .md files to stage");
        return;
      }
      sourceRef.current = source;
      setRows(planned);
      setOpen(true);
    },
    [port, world],
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
      const result = await commitSync(port, rows, sourceRef.current);
      const count = result.saved;
      if (result.skippedImages > 0) {
        const n = result.skippedImages;
        toast.warning(`${n} image${n === 1 ? "" : "s"} skipped — not in the folders you picked.`);
      }
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
  }, [port, rows, onImported]);

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
