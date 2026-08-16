import { describe, it, expect } from "vitest";
import { filterDirtyPlacements, buildDraftPlacements } from "@/atlas/editor/dirtyPlacements";
import type { OverrideValue } from "@/atlas/editor/placementOverrides";

const draftFor = (entityId: string) => ({ entityId, mapId: "m1", x: 1, y: 2 });

describe("filterDirtyPlacements", () => {
  it("drops canon-only placements when there are no overrides (clean session)", () => {
    // Regression for B3: a clean session must NOT re-serialize every placed
    // entity. buildDraftPlacements() returns one draft per *effective*
    // placement (incl. canon-only), so the save site must gate on overrides.
    const drafts = [draftFor("a"), draftFor("b"), draftFor("c")];
    expect(filterDirtyPlacements(drafts, {}, "m1")).toEqual([]);
  });

  it("keeps only entities with a local override on the active map", () => {
    const drafts = [draftFor("a"), draftFor("b")];
    const out = filterDirtyPlacements(drafts, { "m1:a": { x: 9, y: 9 } }, "m1");
    expect(out.map((d) => d.entityId)).toEqual(["a"]);
  });

  it("treats a null override (explicit reset) as a real edit — key presence, not truthiness", () => {
    const drafts = [draftFor("a")];
    const out = filterDirtyPlacements(drafts, { "m1:a": null }, "m1");
    expect(out.map((d) => d.entityId)).toEqual(["a"]);
  });

  it("ignores overrides that belong to a different map", () => {
    const drafts = [draftFor("a")];
    const out = filterDirtyPlacements(drafts, { "m2:a": { x: 1, y: 1 } }, "m1");
    expect(out).toEqual([]);
  });
});

describe("buildDraftPlacements", () => {
  const entities = [
    { id: "a", title: "Alpha" },
    { id: "b", title: "Beta" },
  ];

  it("emits a draft for every entity with an effective placement", () => {
    const effective = (id: string): OverrideValue | null => (id === "a" ? { x: 10, y: 20 } : null);
    const out = buildDraftPlacements(entities, "m1", effective);
    expect(out).toEqual([
      { entityId: "a", mapId: "m1", x: 10, y: 20, label: undefined, pin: undefined },
    ]);
  });

  it("skips entities with no effective placement", () => {
    const effective = (): OverrideValue | null => null;
    expect(buildDraftPlacements(entities, "m1", effective)).toEqual([]);
  });

  it("omits label when it equals the entity title, keeps it when it differs", () => {
    const effective = (id: string): OverrideValue | null =>
      id === "a" ? { x: 1, y: 2, label: "Alpha" } : { x: 3, y: 4, label: "Custom" };
    const out = buildDraftPlacements(entities, "m1", effective);
    expect(out.find((d) => d.entityId === "a")?.label).toBeUndefined();
    expect(out.find((d) => d.entityId === "b")?.label).toBe("Custom");
  });

  it("carries the pin override through untouched", () => {
    const pin = { icon: "star", color: "#fff" };
    const effective = (): OverrideValue | null => ({ x: 1, y: 2, pin });
    const out = buildDraftPlacements([entities[0]], "m1", effective);
    expect(out[0].pin).toBe(pin);
  });

  it("stamps every draft with the given mapId", () => {
    const effective = (): OverrideValue | null => ({ x: 1, y: 2 });
    const out = buildDraftPlacements(entities, "m2", effective);
    expect(out.every((d) => d.mapId === "m2")).toBe(true);
  });
});
