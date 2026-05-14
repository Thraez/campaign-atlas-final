/**
 * Dev-only diff preview + write confirmation for the editor's Save button.
 *
 * Renders the FileChange[] that the editor wants to write to disk, lets the
 * DM review it, and (on confirm) routes through saveAtlasPatchToLocalFs which
 * POSTs to the dev-only Vite plugin at /__atlas/save.
 *
 * No GitHub API, no auth — guarded disk writes only.
 */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  saveAtlasPatchToLocalFs,
  DisallowedPathError,
  LocalSaveError,
  type FileChange,
  type LocalSaveResult,
} from "./localFsSave";

export interface DiffPreviewModalProps {
  open: boolean;
  changes: FileChange[];
  /** Optional map of path → current on-disk text, for diff line counts. */
  previousContents?: Record<string, string>;
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

export function DiffPreviewModal({ open, changes, previousContents, onClose }: DiffPreviewModalProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "review" });
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  // Reset internal phase whenever the modal is reopened.
  useMemo(() => {
    if (open) {
      setPhase({ kind: "review" });
      setExpanded({});
    }
  }, [open]);

  const stats = useMemo(
    () =>
      changes.map((c) => diffLines(previousContents?.[c.path] ?? "", c.contents)),
    [changes, previousContents],
  );

  const runSave = async () => {
    setPhase({ kind: "saving" });
    try {
      const result = await saveAtlasPatchToLocalFs(changes);
      setPhase({ kind: "success", result });
    } catch (err: unknown) {
      if (err instanceof DisallowedPathError) {
        setPhase({ kind: "disallowed", path: err.path });
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
              <DialogTitle>Wrote {phase.result.written} file{phase.result.written === 1 ? "" : "s"}.</DialogTitle>
              <DialogDescription>
                Run <code className="font-mono">git status</code> in your terminal to see the changes. Commit with git when ready.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 pr-3 -mr-3">
              <ul className="text-xs font-mono space-y-1">
                {phase.result.paths.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
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