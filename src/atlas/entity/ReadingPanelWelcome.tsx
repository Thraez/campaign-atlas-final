/**
 * What the reading panel shows before anything is open.
 *
 * This column is roughly a third of the player screen and it is where a
 * first-time visitor decides whether the world is interesting. It used to hold
 * one sentence of instruction — "Select a pin or search for a place to read its
 * lore." — so the most valuable space on the site opened empty.
 *
 * Everything here comes from content that already exists: the world's name, its
 * own summary if it has one, and a few entries to start from. Nothing is
 * invented, and nothing renders if there is nothing to show.
 */
import type { Entity } from "@/atlas/content/schema";
import { playerTypeLabel } from "@/atlas/content/typeLabel";

export function ReadingPanelWelcome({
  worldName,
  worldSummary,
  starters,
  onOpenEntity,
}: {
  worldName: string;
  /** Optional one-paragraph hook for the world. */
  worldSummary?: string;
  starters: Entity[];
  onOpenEntity: (id: string) => void;
}) {
  return (
    <div className="flex-1 overflow-auto p-5" data-testid="reading-panel-welcome">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Welcome</p>
          <h2 className="font-display text-xl text-foreground">{worldName}</h2>
          {worldSummary && <p className="text-sm text-muted-foreground">{worldSummary}</p>}
        </div>

        {starters.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Start anywhere
            </p>
            <ul className="space-y-1 list-none pl-0">
              {starters.map((e) => {
                const type = playerTypeLabel(e.type);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onOpenEntity(e.id)}
                      className="w-full text-left rounded px-2 py-1.5 hover:bg-accent/50 transition"
                    >
                      <span className="text-sm font-medium">{e.title}</span>
                      {type && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {type}
                        </span>
                      )}
                      {e.summary && (
                        <span className="block text-xs text-muted-foreground line-clamp-2">
                          {e.summary}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          Or pick a pin on the map, or press{" "}
          <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">/</kbd>{" "}
          to search.
        </p>
      </div>
    </div>
  );
}
