import type { PublishCheckResult } from "./publishTypes";
import { Button } from "@/components/ui/button";
import { PublishedDiffPanel } from "./PublishedDiffPanel";
import { CheckCircle2, ShieldAlert, AlertTriangle, ArrowRight } from "lucide-react";

interface Props {
  result: PublishCheckResult;
  onConfirm: () => void;
  onGoToEntity?: (id: string) => void;
  onGoToMap?: (id: string) => void;
  busy?: boolean;
}

export function ReadinessCard({ result, onConfirm, onGoToEntity, busy }: Props) {
  const safe = result.verdict === "safe";
  const buildFailed = result.verdict === "build-failed";

  return (
    <div className="space-y-2">
      {/* Safety verdict banner */}
      <div
        className={`rounded-md border p-3 text-xs ${
          safe
            ? "border-primary/30 bg-primary/5"
            : "border-destructive/40 bg-destructive/5"
        }`}
      >
        <div className="flex items-center gap-2 font-medium">
          {safe ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-destructive" />
          )}
          {safe
            ? "Safe to publish — no DM-only content is exposed."
            : buildFailed
            ? "Couldn't build your world."
            : "Publishing is blocked — fix the items below, then re-check."}
        </div>
        {buildFailed && result.buildError && (
          <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted/40 p-2 text-[10px] whitespace-pre-wrap">
            {result.buildError}
          </pre>
        )}
      </div>

      {/* Reason list (blocked only) */}
      {!safe && !buildFailed && (
        <ul className="space-y-1.5">
          {result.reasons.map((r, i) => (
            <li key={i} className="rounded-md border border-border bg-card/50 p-2 text-xs space-y-1">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-destructive" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-foreground">{r.message}</div>
                  {r.locator?.file && (
                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                      {r.locator.file}
                    </div>
                  )}
                  {r.locator?.entityId && onGoToEntity && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px] gap-1"
                      onClick={() => onGoToEntity(r.locator!.entityId!)}
                    >
                      <ArrowRight className="h-3 w-3" /> Go to entity
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Player-vs-player diff */}
      <PublishedDiffPanel diff={result.diff} />

      {/* Public-repo notice (D9) */}
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[10px] text-muted-foreground">
        Your source notes (including DM-only ones) are public on GitHub. Only the published site is scrubbed.
      </div>

      {/* Confirm button — shown only when safe */}
      {safe && (
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={busy}
          className="h-8 gap-1 text-xs"
        >
          {busy ? "Re-checking safety before publishing…" : "Publish now"}
        </Button>
      )}
    </div>
  );
}
