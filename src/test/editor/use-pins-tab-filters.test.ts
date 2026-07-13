// src/test/editor/use-pins-tab-filters.test.ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePinsTabFilters } from "@/atlas/editor/usePinsTabFilters";
import { makeEntity } from "@/test/helpers/makeProject";
import type { Entity } from "@/atlas/content/schema";

function fixtureEntities(): Entity[] {
  return [
    makeEntity({
      id: "ironkeep",
      title: "Ironkeep",
      type: "settlement",
      visibility: "player",
      aliases: ["Iron Keep"],
      tags: ["fortress", "coastal"],
    }),
    makeEntity({
      id: "shadow-cult",
      title: "Shadow Cult",
      type: "faction",
      visibility: "dm",
      aliases: [],
      tags: ["cult"],
    }),
    makeEntity({
      id: "whispering-woods",
      title: "Whispering Woods",
      type: "region",
      visibility: "rumor",
      aliases: ["The Whispers"],
      tags: ["forest", "coastal"],
    }),
    makeEntity({
      id: "hidden-vault",
      title: "Hidden Vault",
      type: "location",
      visibility: "hidden",
      aliases: [],
      tags: [],
    }),
  ];
}

/** Fake effectiveCoord backed by a Set of "placed" entity ids. */
function fakeEffectiveCoord(placedIds: Set<string>) {
  return (entityId: string): { x: number; y: number } | null =>
    placedIds.has(entityId) ? { x: 1, y: 2 } : null;
}

describe("usePinsTabFilters", () => {
  it("defaults to unfiltered: filtered/allTypes/allTags cover every entity", () => {
    const entities = fixtureEntities();
    const effectiveCoord = fakeEffectiveCoord(new Set(["ironkeep", "whispering-woods"]));
    const { result } = renderHook(() => usePinsTabFilters({ entities, effectiveCoord }));

    expect(result.current.filter).toBe("");
    expect(result.current.stateFilter).toBe("all");
    expect(result.current.visFilter).toBe("all");
    expect(result.current.typeFilter).toBe("all");
    expect(result.current.tagFilter).toBe("all");
    expect(result.current.filtered.map((e) => e.id).sort()).toEqual(
      ["hidden-vault", "ironkeep", "shadow-cult", "whispering-woods"].sort(),
    );
    expect(result.current.allTypes).toEqual(["faction", "location", "region", "settlement"]);
    expect(result.current.allTags).toEqual(["coastal", "cult", "forest", "fortress"]);
  });

  it("partitions placed vs unplaced per effectiveCoord", () => {
    const entities = fixtureEntities();
    const effectiveCoord = fakeEffectiveCoord(new Set(["ironkeep", "whispering-woods"]));
    const { result } = renderHook(() => usePinsTabFilters({ entities, effectiveCoord }));

    expect(result.current.placed.map((e) => e.id).sort()).toEqual([
      "ironkeep",
      "whispering-woods",
    ]);
    expect(result.current.unplaced.map((e) => e.id).sort()).toEqual([
      "hidden-vault",
      "shadow-cult",
    ]);
  });

  it("search filter matches title, type, and alias (case-insensitive)", () => {
    const entities = fixtureEntities();
    const effectiveCoord = fakeEffectiveCoord(new Set());
    const { result } = renderHook(() => usePinsTabFilters({ entities, effectiveCoord }));

    act(() => result.current.setFilter("iron"));
    expect(result.current.filtered.map((e) => e.id)).toEqual(["ironkeep"]);

    act(() => result.current.setFilter("FACTION"));
    expect(result.current.filtered.map((e) => e.id)).toEqual(["shadow-cult"]);

    act(() => result.current.setFilter("whispers"));
    expect(result.current.filtered.map((e) => e.id)).toEqual(["whispering-woods"]);

    act(() => result.current.setFilter("nonexistent-xyz"));
    expect(result.current.filtered).toEqual([]);
  });

  it("visFilter narrows to a single visibility", () => {
    const entities = fixtureEntities();
    const effectiveCoord = fakeEffectiveCoord(new Set());
    const { result } = renderHook(() => usePinsTabFilters({ entities, effectiveCoord }));

    act(() => result.current.setVisFilter("dm"));
    expect(result.current.filtered.map((e) => e.id)).toEqual(["shadow-cult"]);
  });

  it("typeFilter narrows to a single type", () => {
    const entities = fixtureEntities();
    const effectiveCoord = fakeEffectiveCoord(new Set());
    const { result } = renderHook(() => usePinsTabFilters({ entities, effectiveCoord }));

    act(() => result.current.setTypeFilter("region"));
    expect(result.current.filtered.map((e) => e.id)).toEqual(["whispering-woods"]);
  });

  it("tagFilter narrows to entities carrying that tag", () => {
    const entities = fixtureEntities();
    const effectiveCoord = fakeEffectiveCoord(new Set());
    const { result } = renderHook(() => usePinsTabFilters({ entities, effectiveCoord }));

    act(() => result.current.setTagFilter("coastal"));
    expect(result.current.filtered.map((e) => e.id).sort()).toEqual([
      "ironkeep",
      "whispering-woods",
    ]);
  });

  it("stateFilter narrows to placed or unplaced per effectiveCoord", () => {
    const entities = fixtureEntities();
    const effectiveCoord = fakeEffectiveCoord(new Set(["ironkeep", "whispering-woods"]));
    const { result } = renderHook(() => usePinsTabFilters({ entities, effectiveCoord }));

    act(() => result.current.setStateFilter("placed"));
    expect(result.current.filtered.map((e) => e.id).sort()).toEqual([
      "ironkeep",
      "whispering-woods",
    ]);

    act(() => result.current.setStateFilter("unplaced"));
    expect(result.current.filtered.map((e) => e.id).sort()).toEqual([
      "hidden-vault",
      "shadow-cult",
    ]);
  });

  it("combines filters (tag + state) and placed/unplaced reflect the combined result", () => {
    const entities = fixtureEntities();
    const effectiveCoord = fakeEffectiveCoord(new Set(["ironkeep", "whispering-woods"]));
    const { result } = renderHook(() => usePinsTabFilters({ entities, effectiveCoord }));

    act(() => {
      result.current.setTagFilter("coastal");
      result.current.setStateFilter("unplaced");
    });
    // Both coastal entities (ironkeep, whispering-woods) are placed, so
    // combining with stateFilter="unplaced" leaves nothing.
    expect(result.current.filtered).toEqual([]);
    expect(result.current.placed).toEqual([]);
    expect(result.current.unplaced).toEqual([]);
  });
});
