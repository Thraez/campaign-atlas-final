/**
 * Editor toolbar chip that surfaces save state.
 *
 * Four states (see spec §G):
 *
 *   - "saved":   green dot, "Saved" + relative time
 *   - "unsaved": amber dot, "Unsaved" + file-impact sub-line
 *   - "saving":  spinner, "Saving…"
 *   - "failed":  red dot, "Save failed — retry"
 *
 * The sub-line is **file-impact** ("world.yaml + 2 entities"), not a numeric
 * mutation count — that's what a DM actually cares about. Click force-saves
 * (or retries on failure) by calling `onForceSave`. The big main Save
 * button does the same thing; the chip is a secondary affordance.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export type SaveStatus = "saved" | "unsaved" | "saving" | "failed";

interface SaveStatusChipProps {
  status: SaveStatus;
  /** ISO timestamp of the last successful save. Used for "saved Ns ago" text. */
  savedAt?: string | null;
  /** Human-readable summary of pending changes, e.g. "world.yaml + 2 entities". */
  dirtySummary?: string;
  /** Tooltip / inline detail when status === "failed". */
  failedMessage?: string;
  /** Invoked when the user clicks the chip — force save or retry. */
  onForceSave?: () => void;
}

export function SaveStatusChip({
  status,
  savedAt,
  dirtySummary,
  failedMessage,
  onForceSave,
}: SaveStatusChipProps) {
  // Re-render every 15s so the "Saved 3s ago" relative time stays current
  // without us pushing updates from outside.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (status !== "saved" || !savedAt) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, [status, savedAt]);

  const clickable = (status === "unsaved" || status === "failed") && !!onForceSave;

  const Inner = (
    <div className="flex flex-col items-start leading-tight">
      <div className="flex items-center gap-1.5">
        <Dot status={status} />
        <span className="text-xs font-medium">
          {status === "saved" && "Saved"}
          {status === "unsaved" && "Unsaved"}
          {status === "saving" && "Saving…"}
          {status === "failed" && "Save failed"}
        </span>
        {status === "saved" && savedAt && (
          <span className="text-[10px] text-muted-foreground" key={tick}>
            {relativeTime(savedAt)}
          </span>
        )}
      </div>
      {status === "unsaved" && dirtySummary && (
        <span className="text-[10px] text-muted-foreground truncate max-w-[180px]" title={dirtySummary}>
          {dirtySummary}
        </span>
      )}
      {status === "failed" && failedMessage && (
        <span className="text-[10px] text-muted-foreground truncate max-w-[180px]" title={failedMessage}>
          {failedMessage}
        </span>
      )}
    </div>
  );

  const baseCls =
    "inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 transition-colors";
  const stateCls =
    status === "failed"
      ? "bg-destructive/10 border-destructive/40 hover:bg-destructive/20"
      : status === "saved"
        ? "bg-card hover:bg-accent/40"
        : status === "saving"
          ? "bg-card cursor-progress"
          : /* unsaved */ "bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/20";

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onForceSave}
        className={`${baseCls} ${stateCls} cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary`}
        aria-label={status === "failed" ? "Retry save" : "Save now"}
      >
        {Inner}
      </button>
    );
  }
  return <div className={`${baseCls} ${stateCls}`}>{Inner}</div>;
}

function Dot({ status }: { status: SaveStatus }) {
  if (status === "saving") {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />;
  }
  const color =
    status === "saved"
      ? "bg-emerald-500"
      : status === "unsaved"
        ? "bg-amber-500"
        : "bg-red-500"; /* failed */
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden="true" />;
}

/**
 * Build the file-impact summary string for the chip sub-line, e.g.
 * "world.yaml + 2 entities" or "3 entities". Exported for use by the editor
 * (and for unit tests) — having one source of truth for this label keeps
 * the chip and any toasts in sync.
 */
export function dirtyFileSummary({
  entityCount,
  worldYamlDirty,
}: {
  entityCount: number;
  worldYamlDirty: boolean;
}): string {
  const parts: string[] = [];
  if (worldYamlDirty) parts.push("world.yaml");
  if (entityCount > 0) parts.push(`${entityCount} ${entityCount === 1 ? "entity" : "entities"}`);
  if (parts.length === 0) return "no changes";
  return parts.join(" + ");
}

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "just now";
  const diff = now - t;
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(t).toLocaleDateString();
}
