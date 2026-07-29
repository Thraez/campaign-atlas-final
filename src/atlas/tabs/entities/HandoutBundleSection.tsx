import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import type { AssetCredit, CreditsConfig, Entity } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { printEntityBundle } from "@/atlas/printHandout";

export function HandoutBundleSection({
  entities,
  assetCredits,
  credits,
}: {
  entities: Entity[];
  assetCredits?: Record<string, AssetCredit>;
  credits?: CreditsConfig;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entities;
    return entities.filter(
      (e) => e.title.toLowerCase().includes(q) || e.id.toLowerCase().includes(q),
    );
  }, [entities, filter]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const e of filtered) next.add(e.id);
      return next;
    });
  };
  const clear = () => setSelectedIds(new Set());

  const print = () => {
    const ordered = entities.filter((e) => selectedIds.has(e.id));
    if (ordered.length === 0) {
      toast.warning("No entities selected.");
      return;
    }
    printEntityBundle(ordered, assetCredits, credits);
  };

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-md border border-border bg-card/40"
    >
      <summary className="cursor-pointer select-none px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Printer className="h-3 w-3" />
        Print handout bundle
        {selectedIds.size > 0 && (
          <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-normal normal-case text-primary">
            {selectedIds.size} selected
          </span>
        )}
      </summary>
      <div className="px-2 pb-2 space-y-2">
        <p className="text-[10px] text-muted-foreground">
          Pick multiple entities to print as one PDF (one entity per page). Single-entity print is
          on the player viewer.
        </p>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by title or id…"
          className="h-7 text-xs"
        />
        <div className="max-h-48 overflow-y-auto rounded border border-border/50 bg-background">
          {filtered.length === 0 ? (
            <div className="px-2 py-3 text-[11px] italic text-muted-foreground">
              No entities match "{filter}".
            </div>
          ) : (
            filtered.map((e) => (
              <label
                key={e.id}
                className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-accent/50 cursor-pointer border-b border-border/30 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(e.id)}
                  onChange={() => toggle(e.id)}
                  className="h-3 w-3"
                />
                <span className="flex-1 truncate">{e.title}</span>
                <span className="text-[10px] text-muted-foreground">
                  {e.type} · {e.visibility}
                </span>
              </label>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={selectAllFiltered}
              className="h-6 text-[10px]"
              disabled={filtered.length === 0}
            >
              Select {filter ? "filtered" : "all"} ({filtered.length})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clear}
              className="h-6 text-[10px]"
              disabled={selectedIds.size === 0}
            >
              Clear
            </Button>
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={print}
            disabled={selectedIds.size === 0}
            className="h-7 gap-1 text-xs"
          >
            <Printer className="h-3 w-3" /> Print {selectedIds.size || ""} bundle
          </Button>
        </div>
      </div>
    </details>
  );
}
