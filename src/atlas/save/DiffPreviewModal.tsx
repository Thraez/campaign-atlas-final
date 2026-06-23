/**
 * Dev-only diff preview + write confirmation for the editor's Save button.
 *
 * Renders the FileChange[] that the editor wants to write to disk, lets the
 * DM review it, and (on confirm) routes through saveAtlasPatchToLocalFs which
 * POSTs to the dev-only Vite plugin at /__atlas/save.
 *
 * No GitHub API, no auth — guarded disk writes only.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  saveAtlasPatchToLocalFs,
  ConflictError,
  DisallowedPathError,
  LocalSaveError,
  SaveBusyError,
  type FileChange,
  type LocalSaveResult,
} from "./localFsSave";

export interface DiffPreviewModalProps {
  open: boolean;
  changes: FileChange[];
  /** Optional map of path → current on-disk text, for diff line counts. */
  previousContents?: Record<string, string>;
  /** When true, ask the dev plugin to run `atlas:build` after writes. */
  rebuildAfterSave?: boolean;
  /** Fired when an actual disk write begins (Save to disk / Try again), i.e.
   *  the only moment the editor should consider the session "saving". Never
   *  fires on open or cancel. */
  onConfirm?: () => void;
  /** Called after a successful save+rebuild (or just save if rebuild is off). */
  onSaved?: (result: LocalSaveResult) => void;
  /** Fired when an actual disk write fails, with a human-readable reason, so
   *  the editor can reflect a persistent "Save failed" status (the modal also
   *  shows its own error UI with Try again / Cancel). */
  onWriteFailed?: (message: string) => void;
  onClose: () => void;
}

type Phase =
  | { kind: "review" }
  | { kind: "saving" }
  | { kind: "success"; result: LocalSaveResult }
  | { kind: "disallowed"; path: string }
  | { kind: "error"; message: string };

interface DiffStat {
  added: number;
  removed: number;
  unified: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function diffLines(prev: string, next: string): DiffStat {
  const a = prev === "" ? [] : prev.split("\n");
  const b = next === "" ? [] : next.split("\n");
  // Trivial line-set diff — sufficient for human review of small YAML patches.
  const aSet = new Map<string, number>();
  for (const l of a) aSet.set(l, (aSet.get(l) ?? 0) + 1);
  const bSet = new Map<string, number>();
  for (const l of b) bSet.set(l, (bSet.get(l) ?? 0) + 1);
  let added = 0;
  let removed = 0;
  const lines: string[] = [];
  for (const l of a) {
    if ((bSet.get(l) ?? 0) === 0) {
      removed++;
      lines.push(`- ${l}`);
    }
  }
  for (const l of b) {
    if ((aSet.get(l) ?? 0) === 0) {
      added++;
      lines.push(`+ ${l}`);
    }
  }
  return { added, removed, unified: lines.join("\n") };
}

export function DiffPreviewModal({ open, changes, previousContents, rebuildAfterSave, onConfirm, onSaved, onWriteFailed, onClose }: DiffPreviewModalProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "review" });
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  // Reset internal phase whenever the modal is reopened.
  useEffect(() => {
    if (open) {
      setPhase({ kind: "review" });
      setExpanded({});
    }
  }, [open]);

  const stats = useMemo(
    () =>
      changes.map((c) => {
        if (c.kind === "asset-binary") {
          // Base64 dataUrls have no meaningful line diff. Show the decoded
          // size so the DM understands what's about to land on disk.
          const m = /^data:[^;,]+;base64,(.*)$/.exec(c.content);
          const b64 = m ? m[1] : c.content;
          const approxBytes = Math.floor((b64.length * 3) / 4);
          return {
            added: 0,
            removed: 0,
            unified: `(binary asset, ~${formatBytes(approxBytes)})`,
          };
        }
        return diffLines(previousContents?.[c.path] ?? "", c.content);
      }),
    [changes, previousContents],
  );

  const runSave = async () => {
    onConfirm?.();            // a real write is starting — editor flips to "saving" now
    setPhase({ kind: "saving" });
    try {
      const result = await saveAtlasPatchToLocalFs(changes, undefined, { rebuild: !!rebuildAfterSave });
      setPhase({ kind: "success", result });
      onSaved?.(result);
    } catch (err: unknown) {
      // Surface the failure to the editor so the session status reflects a
      // real "Save failed" (not a stranded "saving"/"unsaved"). The branches
      // below still render the modal's own detailed error UI.
      onWriteFailed?.(
        err instanceof DisallowedPathError
          ? `Path not in allowlist: ${err.path}`
          : err instanceof ConflictError
            ? `Conflict on ${err.failedPath} (${err.reason})`
            : err instanceof Error ? err.message : "Unknown error",
      );
      if (err instanceof DisallowedPathError) {
        setPhase({ kind: "disallowed", path: err.path });
      } else if (err instanceof ConflictError) {
        // Conflict failures used to surface as the bare error message
        // ("Save conflict (already-exists) on ..."), which the user reads as
        // a generic "unable to save" without seeing the specific path that
        // blocked the batch. Spell out the path and the reason so the next
        // action is obvious — and remind the user that no files were written
        // because the batch is atomic.
        const reasonText =
          err.reason === "already-exists"
            ? "A file with that path already exists on disk and the editor wanted to create it fresh."
            : err.reason === "stale-base"
              ? "The file changed outside the editor since the draft was loaded."
              : "The file is missing on disk but the editor expected to overwrite it.";
        setPhase({
          kind: "error",
          message: `Conflict on ${err.failedPath} (${err.reason}). ${reasonText} Nothing was written — the batch was rolled back.`,
        });
      } else if (err instanceof SaveBusyError) {
        setPhase({
          kind: "error",
          message: "Another save is already in flight — wait a moment and click Try again.",
        });
      } else if (err instanceof LocalSaveError) {
        setPhase({ kind: "error", message: err.message });
      } else {
        setPhase({ kind: "error", message: err instanceof Error ? err.message : "Unknown error" });
      }
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && phase.kind !== "saving") onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        {phase.kind === "success" ? (
          <>
            <DialogHeader>
              <DialogTitle>Wrote {phase.result.saved} file{phase.result.saved === 1 ? "" : "s"}.</DialogTitle>
              <DialogDescription>
                {phase.result.build
                  ? phase.result.build.ok
                    ? `Atlas rebuilt in ${phase.result.build.durationMs} ms. Reload /atlas to see the changes.`
                    : "Files saved, but the atlas rebuild failed — see details below."
                  : "Run npm run atlas:build to regenerate atlas.json, then reload /atlas."}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 pr-3 -mr-3">
              <ul className="text-xs font-mono space-y-1">
                {phase.result.paths.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              {phase.result.build && !phase.result.build.ok && phase.result.build.stderr && (
                <pre className="mt-3 text-[10px] font-mono whitespace-pre-wrap bg-destructive/10 border border-destructive/30 rounded p-2 max-h-48 overflow-auto">
                  {phase.result.build.stderr}
                </pre>
              )}
            </ScrollArea>
            <div className="flex justify-end pt-2">
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        ) : phase.kind === "disallowed" ? (
          <>
            <DialogHeader>
              <DialogTitle>Path not in allowlist.</DialogTitle>
              <DialogDescription>
                The path <code className="font-mono">{phase.path}</code> is not in the source allowlist. The editor can only write to <code className="font-mono">content/**/_atlas/*.yaml</code> and <code className="font-mono">content/**/*.md</code>. This is a hard safety guard. If you reached this state via normal editor use, please file a bug.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end pt-2">
              <Button onClick={onClose}>Close</Button>
            </div>
          </>
        ) : phase.kind === "error" ? (
          <>
            <DialogHeader>
              <DialogTitle>Save failed.</DialogTitle>
              <DialogDescription>{phase.message}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={runSave}>Try again</Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                Review changes — {changes.length} file{changes.length === 1 ? "" : "s"} will be written.
              </DialogTitle>
              <DialogDescription>
                Files will be written to your local repository. After saving, run <code className="font-mono">git status</code> to review and commit.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 pr-3 -mr-3">
              <ul className="space-y-3 text-xs">
                {changes.map((c, i) => {
                  const s = stats[i];
                  const isOpen = !!expanded[i];
                  return (
                    <li key={c.path} className="rounded-md border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold font-mono break-all">{c.path}</div>
                        <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                          <span className="text-emerald-500">+{s.added}</span>{" "}
                          <span className="text-red-500">-{s.removed}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-[10px] underline text-muted-foreground hover:text-foreground"
                        onClick={() => setExpanded((e) => ({ ...e, [i]: !isOpen }))}
                      >
                        {isOpen ? "Hide diff" : "Show diff"}
                      </button>
                      {isOpen && (
                        <pre className="font-mono text-[10px] whitespace-pre-wrap bg-muted/40 p-2 rounded max-h-64 overflow-auto">
                          {s.unified || "(no line-level differences)"}
                        </pre>
                      )}
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={runSave} disabled={phase.kind === "saving"}>
                {phase.kind === "saving" ? "Saving…" : "Save to disk"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}