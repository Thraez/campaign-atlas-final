/**
 * Phase 1C — orchestrator hook for the .md staging-and-import flow.
 *
 * Owns the modal state, parses dropped/picked files into StagingRow[], routes
 * the committed batch through the unified Save endpoint, and triggers a canon
 * reload so newly-imported entities show up without a page refresh.
 */
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  buildStagingRows,
  updateStagingRow,
  type StagingRow,
  type StagingRowPatch,
} from "./stagingState";
import { buildImportChanges, ImportCommitError } from "./buildImportChanges";
import {
  saveAtlasPatchToLocalFs,
  ConflictError,
  SaveBusyError,
} from "@/atlas/save/localFsSave";
import type { ImportFolderConfig } from "../content/schema";

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

interface RawFileInput {
  filename: string;
  raw: string;
}

export function useMdImportFlow(args: UseMdImportFlowArgs) {
  const { worldId, importConfig, existingById, onImported } = args;
  const [rows, setRows] = useState<StagingRow[]>([]);
  const [open, setOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const ctx = useMemo(() => {
    const allowedFolders = new Set([
      ...Object.values(importConfig.folders),
      importConfig.defaultFolder,
    ]) as ReadonlySet<string>;
    const existingPaths = new Set(existingById.values()) as ReadonlySet<string>;
    return { worldId, importConfig, allowedFolders, existingById, existingPaths };
  }, [worldId, importConfig, existingById]);

  const openWithInputs = useCallback(
    (inputs: RawFileInput[]) => {
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
      const changes = await buildImportChanges(rows);
      const result = await saveAtlasPatchToLocalFs(changes, undefined, { rebuild: true });
      const count = result.saved;
      if (result.rebuilt === false) {
        toast.warning(
          `Imported ${count} file${count === 1 ? "" : "s"} but atlas rebuild failed`,
          {
            description: result.rebuildError ?? "Run `npm run atlas:build` manually.",
            duration: 12_000,
          },
        );
      } else {
        toast.success(`Imported ${count} file${count === 1 ? "" : "s"} and rebuilt the atlas`);
      }
      setOpen(false);
      setRows([]);
      await onImported();
    } catch (err) {
      if (err instanceof ConflictError) {
        toast.error(`Import conflict on ${err.failedPath}`, {
          description:
            err.reason === "already-exists"
              ? "A file with that target appeared on disk after staging — reload before retrying."
              : "File changed outside the editor. Reload before retrying.",
          duration: 12_000,
        });
      } else if (err instanceof SaveBusyError) {
        toast.error("Another save is already in flight — try again in a moment");
      } else if (err instanceof ImportCommitError) {
        toast.error(`Could not prepare import: ${err.message}`);
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
    patchRow,
    cancel,
    commit,
  };
}
