import { describe, it, expect } from "vitest";
import { filterDirtyPlacements } from "@/atlas/editor/dirtyPlacements";

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
