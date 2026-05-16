import { useMemo, useState } from "react";
import type { Entity } from "@/atlas/content/schema";
import { CATEGORIES, categoryForType, type CategoryId } from "@/atlas/content/entityCategory";

export function CategoryPanel({
  category,
  entities,
  onOpen,
  onNew,
  onImport,
}: {
  category: CategoryId;
  entities: Entity[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onImport: () => void;
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
          rows.map((e) => (
            <button
              key={e.id}
              data-testid="entity-row"
              type="button"
              onClick={() => onOpen(e.id)}
              className="block w-full text-left px-3 py-2 text-xs border-b hover:bg-muted"
            >
              {e.title}
            </button>
          ))
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
