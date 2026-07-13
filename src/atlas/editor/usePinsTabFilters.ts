// src/atlas/editor/usePinsTabFilters.ts
import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Entity } from "@/atlas/content/schema";

export interface UsePinsTabFiltersArgs {
  /** World-scoped entity list (the page's `entitiesForWorld` memo). */
  entities: Entity[];
  /** Resolves an entity's effective (override-or-canon) coordinate on the active map. */
  effectiveCoord: (entityId: string) => { x: number; y: number } | null;
}

export interface UsePinsTabFiltersResult {
  filter: string;
  setFilter: Dispatch<SetStateAction<string>>;
  stateFilter: "all" | "placed" | "unplaced";
  setStateFilter: Dispatch<SetStateAction<"all" | "placed" | "unplaced">>;
  visFilter: "all" | "player" | "rumor" | "dm" | "hidden";
  setVisFilter: Dispatch<SetStateAction<"all" | "player" | "rumor" | "dm" | "hidden">>;
  typeFilter: string;
  setTypeFilter: Dispatch<SetStateAction<string>>;
  tagFilter: string;
  setTagFilter: Dispatch<SetStateAction<string>>;
  allTypes: string[];
  allTags: string[];
  filtered: Entity[];
  placed: Entity[];
  unplaced: Entity[];
}

/**
 * Per-tab filter state (search/placed-unplaced/visibility/type/tag) for the
 * Pins tab, plus the entity lists it derives. Moved verbatim out of
 * AtlasPlacementEditor: `entities` is the page's world-scoped
 * `entitiesForWorld` memo and `effectiveCoord` is the page's placement
 * resolver — both stay owned by the page and are passed in here.
 */
export function usePinsTabFilters({
  entities,
  effectiveCoord,
}: UsePinsTabFiltersArgs): UsePinsTabFiltersResult {
  const [filter, setFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | "placed" | "unplaced">("all");
  const [visFilter, setVisFilter] = useState<"all" | "player" | "rumor" | "dm" | "hidden">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");

  const allTypes = useMemo(
    () => Array.from(new Set(entities.map((e) => e.type))).sort(),
    [entities],
  );
  const allTags = useMemo(
    () => Array.from(new Set(entities.flatMap((e) => e.tags ?? []))).sort(),
    [entities],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return entities.filter((e) => {
      if (
        q &&
        !(
          e.title.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q) ||
          e.aliases.some((a) => a.toLowerCase().includes(q))
        )
      )
        return false;
      if (visFilter !== "all" && e.visibility !== visFilter) return false;
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (tagFilter !== "all" && !(e.tags ?? []).includes(tagFilter)) return false;
      const hasCoord = !!effectiveCoord(e.id);
      if (stateFilter === "placed" && !hasCoord) return false;
      if (stateFilter === "unplaced" && hasCoord) return false;
      return true;
    });
  }, [entities, filter, visFilter, typeFilter, tagFilter, stateFilter, effectiveCoord]);

  const placed = filtered.filter((e) => effectiveCoord(e.id));
  const unplaced = filtered.filter((e) => !effectiveCoord(e.id));

  return {
    filter,
    setFilter,
    stateFilter,
    setStateFilter,
    visFilter,
    setVisFilter,
    typeFilter,
    setTypeFilter,
    tagFilter,
    setTagFilter,
    allTypes,
    allTags,
    filtered,
    placed,
    unplaced,
  };
}
