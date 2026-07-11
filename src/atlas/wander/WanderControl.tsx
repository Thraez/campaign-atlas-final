import { Dices } from "lucide-react";

export interface WanderControlProps {
  discovered: number;
  total: number;
  /** false when everything placed is already discovered */
  canWander: boolean;
  onWander: () => void;
}

/** The map-corner Wander button + quiet discovery meter. Renders nothing when no places are placed. */
export function WanderControl({ discovered, total, canWander, onWander }: WanderControlProps) {
  if (total === 0) return null;
  const pct = total > 0 ? Math.round((discovered / total) * 100) : 0;
  return (
    <div className="atlas-wander absolute left-3 bottom-3 z-[500] flex flex-col gap-1.5">
      {canWander ? (
        <button
          type="button"
          onClick={onWander}
          aria-label="Wander to a place you haven't seen yet"
          className="flex items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent"
        >
          <Dices className="h-4 w-4" aria-hidden="true" /> Wander
        </button>
      ) : (
        <div className="rounded-lg border bg-background/95 px-3 py-2 text-sm text-muted-foreground">
          All {total} places found
        </div>
      )}
      <div className="flex items-center gap-2 px-0.5">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <span className="whitespace-nowrap text-xs text-muted-foreground">{discovered} of {total} places</span>
      </div>
    </div>
  );
}
