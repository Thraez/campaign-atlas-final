import { useMemo, useState } from "react";
import type { Entity } from "@/atlas/content/schema";
import { CATEGORIES, categoryForType, type CategoryId } from "@/atlas/content/entityCategory";
import { misfiledForCategory } from "@/atlas/content/misfiledEntity";
import { PinStateBadge } from "@/atlas/pins/PinStateBadge";

export function CategoryPanel({
  category,
  entities,
  onOpen,
  onNew,
  onImport,
  hasPlacement,
  onShowOnMap,
  onFileAs,
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
  /**
   * Open an entity for re-filing with `suggestedType` pre-applied to the draft.
   * Omitted in read-only hosts, which hides the re-filing affordance.
   */
  onFileAs?: (entityId: string, suggestedType: string) => void;
}) {
  const meta = CATEGORIES.find((c) => c.id === category)!;
  const [q, setQ] = useState("");

  // Imported notes whose tags say they belong here but whose `atlas.type` never
  // got set. Without this the section reports itself empty while the entities
  // sit under Lore — the panel contradicting its own atlas.
  const misfiled = useMemo(
    () => (onFileAs ? misfiledForCategory(entities, category) : []),
    [entities, category, onFileAs],
  );

  const rows = useMemo(() => {
    const inCat = entities.filter((e) => categoryForType(e.type) === category);
    const filtered = q.trim()
      ? inCat.filter((e) => e.title.toLowerCase().includes(q.toLowerCase()))
      : inCat;
    return [...filtered].sort((a, b) => (b.dateValue ?? 0) - (a.dateValue ?? 0));
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
        {misfiled.length > 0 && (
          <div
            data-testid="misfiled-notice"
            className="m-2 rounded border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs space-y-2"
          >
            <p className="font-medium text-foreground">
              {misfiled.length === 1
                ? `One note looks like a ${meta.singular.toLowerCase()}.`
                : `${misfiled.length} notes look like ${meta.label.toLowerCase()}.`}
            </p>
            <p className="text-muted-foreground">
              {misfiled.length === 1 ? "It is" : "They are"} tagged but{" "}
              {misfiled.length === 1 ? "has" : "have"} no type set, so{" "}
              {misfiled.length === 1 ? "it sits" : "they sit"} under Lore and your players see no
              type on {misfiled.length === 1 ? "it" : "them"}.
            </p>
            <ul className="space-y-1">
              {misfiled.map((m) => (
                <li key={m.entity.id} className="flex items-center gap-2">
                  <span className="truncate flex-1 min-w-0">{m.entity.title}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    #{m.suggestedType}
                  </span>
                  <button
                    type="button"
                    onClick={() => onFileAs?.(m.entity.id, m.suggestedType)}
                    className="shrink-0 rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground"
                  >
                    File as {meta.singular}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {rows.length === 0 && misfiled.length === 0 ? (
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
                  onDoubleClick={() => onOpen(e.id)}
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
        <button type="button" onClick={onImport} className="h-8 text-xs rounded border">
          Import .md / paste
        </button>
      </div>
    </div>
  );
}
