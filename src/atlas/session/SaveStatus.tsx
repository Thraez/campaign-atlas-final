/**
 * The single editor save-status surface. Replaces SaveStatusChip,
 * DraftStatusBadge, the unsaved banner, and the 5-minute nudge toast.
 *
 * State is derived entirely from useEditorSession — this component renders,
 * it does not classify. DM-facing words only: "changes", "saved",
 * "save failed". Never "FileChange", "YAML", "patch", "canon".
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaveLifecycle } from "./useEditorSession";

interface Props {
  status: SaveLifecycle;
  unsavedCount: number;
  /** eval-31: one of the unsaved changes is an entity edit, which saves from its own panel. */
  entityEditPending?: boolean;
  savedAt: number | null;
  failedReason: string | null;
  onSave: () => void;
  onDiscard: () => void;
}

function savedAgo(ts: number, now: number): string {
  const d = now - ts;
  if (d < 5_000) return "Saved just now";
  if (d < 60_000) return `Saved ${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000) return `Saved ${Math.floor(d / 60_000)} min ago`;
  return `Saved ${Math.floor(d / 3_600_000)}h ago`;
}

export function SaveStatus({
  status,
  unsavedCount,
  entityEditPending = false,
  savedAt,
  failedReason,
  onSave,
  onDiscard,
}: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== "saved") return;
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, [status]);

  const changesText = (n: number) => `${n} unsaved ${n === 1 ? "change" : "changes"}`;
  // The entity edit is counted but saved from its own panel, so name it.
  const countText = !entityEditPending
    ? changesText(unsavedCount)
    : unsavedCount <= 1
      ? "1 entity edit – open it to save"
      : `${changesText(unsavedCount - 1)} · 1 entity edit open`;

  let label: string;
  if (status === "clean") label = "All changes saved";
  else if (status === "saving") label = "Saving…";
  else if (status === "saved") label = savedAt ? savedAgo(savedAt, Date.now()) : "Saved";
  else if (status === "failed") label = `Save failed — ${failedReason ?? "unknown error"}`;
  else label = countText;

  const dot =
    status === "saving" ? (
      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden />
    ) : (
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          status === "failed"
            ? "bg-red-500"
            : status === "unsaved"
              ? "bg-amber-500"
              : status === "saved"
                ? "bg-emerald-500"
                : "bg-muted-foreground/50"
        }`}
        aria-hidden
      />
    );

  const showSave = status === "unsaved" || status === "saving" || status === "failed";
  const showDiscard = status === "unsaved" || status === "failed";

  return (
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <span className="flex items-center gap-1.5 text-sm">
        {dot}
        <span className={status === "failed" ? "text-red-400" : ""}>{label}</span>
      </span>
      {showSave && (
        <Button size="sm" onClick={onSave} disabled={status === "saving"}>
          {status === "failed" ? "Retry" : "Save"}
        </Button>
      )}
      {showDiscard && (
        <button
          type="button"
          onClick={onDiscard}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Discard unsaved changes
        </button>
      )}
    </div>
  );
}
