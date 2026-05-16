import { useMemo, useState } from "react";
import type { Entity } from "@/atlas/content/schema";
import { CATEGORIES, categoryForType, type CategoryId } from "@/atlas/content/entityCategory";
import { PinStateBadge } from "@/atlas/pins/PinStateBadge";

export function CategoryPanel({
  category,
  entities,
  onOpen,
  onNew,
  onImport,
  hasPlacement,
  onShowOnMap,
}: {
  category: CategoryId;
  entities: Entity[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onImport: () => void;
  /** Returns true if entity has an effective placement on the current map. */
  hasPlacement?: (entityId: string) => boolean;
  /** Pan map to entity's pin — only called if hasPlacement returns true. */
  onShowOnMap?: (entityId: string) => void;
}) {
  const meta = CATEGORIES.find((c) => c.id === category)!;
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const inCat = entities.filter((e) => categoryForType(e.type) === category);
    const filtered = q.trim()
      ? inCat.filter((e) => e.title.toLowerCase().includes(q.toLowerCase()))
      : inCat;
    return [...filtered].sort(
      (a, b) => ((b as any).dateValue ?? 0) - ((a as any).dateValue ?? 0),
    );
  }, [entities, category, q]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b">
        <input
          className="w-full h-8 px-2 text-xs rounded border bg-background"
          placeholder={`Search ${meta.label.toLowerCase()}…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {rows.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">
            No {meta.label.toLowerCase()} yet — create your first or import.
          </div>
        ) : (
          rows.map((e) => {
            const placed = hasPlacement ? hasPlacement(e.id) : false;
            return (
              <div key={e.id} className="flex items-center border-b hover:bg-muted">
                <button
                  data-testid="entity-row"
                  type="button"
                  onClick={() => onOpen(e.id)}
                  className="flex-1 text-left px-3 py-2 text-xs min-w-0"
                >
                  <span className="truncate block">{e.title}</span>
                  <PinStateBadge placed={placed} />
                </button>
                {placed && onShowOnMap && (
                  <button
                    type="button"
                    className="shrink-0 px-2 text-xs underline text-primary"
                    title="Pan map to this pin"
                    onClick={() => onShowOnMap(e.id)}
                  >
                    Show on map
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="p-2 border-t flex flex-col gap-2">
        <button
          type="button"
          onClick={onNew}
          className="h-8 text-xs rounded bg-primary text-primary-foreground"
        >
          ＋ New {meta.singular}
        </button>
        <button
          type="button"
          onClick={onImport}
          className="h-8 text-xs rounded border"
        >
          Import .md / paste
        </button>
      </div>
    </div>
  );
}
