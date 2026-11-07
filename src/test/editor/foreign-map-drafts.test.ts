import { describe, it, expect } from "vitest";
import { foreignMapDraftPlacements } from "@/atlas/editor/foreignMapDrafts";
import { isRemoval, type PlacementDraft } from "@/atlas/save/canonicalPlacementSave";

/** The placements among the drafts, removals left out. */
const placed = (out: ReturnType<typeof foreignMapDraftPlacements>) =>
  out.filter((d): d is PlacementDraft => !isRemoval(d));

const entities = [
  { id: "hero", title: "Hero" },
  { id: "villain", title: "Villain" },
];

describe("foreignMapDraftPlacements", () => {
  it("returns nothing when there are no overrides", () => {
    expect(foreignMapDraftPlacements({}, "m1", ["m1", "m2"], entities)).toEqual([]);
  });

  it("ignores overrides that belong to the active map", () => {
    const overrides = { "m1:hero": { x: 1, y: 2 } };
    expect(foreignMapDraftPlacements(overrides, "m1", ["m1", "m2"], entities)).toEqual([]);
  });

  it("collects an override written to a different (target) map by duplicateToMap", () => {
    const overrides = { "m2:hero": { x: 5, y: 6 } };
    const out = foreignMapDraftPlacements(overrides, "m1", ["m1", "m2"], entities);
    expect(out).toEqual([
      { entityId: "hero", mapId: "m2", x: 5, y: 6, label: undefined, pin: undefined },
    ]);
  });

  it("returns a removal for a pin deleted on another map (eval-45)", () => {
    const overrides = { "m2:hero": null };
    expect(foreignMapDraftPlacements(overrides, "m1", ["m1", "m2"], entities)).toEqual([
      { entityId: "hero", mapId: "m2", removed: true },
    ]);
  });

  it("drops a label that matches the entity's own title, keeps a real custom label", () => {
    const overrides = {
      "m2:hero": { x: 1, y: 1, label: "Hero" },
      "m2:villain": { x: 2, y: 2, label: "The Big Bad" },
    };
    const out = placed(foreignMapDraftPlacements(overrides, "m1", ["m1", "m2"], entities));
    expect(out.find((d) => d.entityId === "hero")?.label).toBeUndefined();
    expect(out.find((d) => d.entityId === "villain")?.label).toBe("The Big Bad");
  });

  it("carries the pin style override through", () => {
    const overrides = { "m2:hero": { x: 1, y: 1, pin: { color: "#ff0000" } } };
    const out = placed(foreignMapDraftPlacements(overrides, "m1", ["m1", "m2"], entities));
    expect(out[0].pin).toEqual({ color: "#ff0000" });
  });

  it("handles more than one foreign map at once", () => {
    const overrides = { "m2:hero": { x: 1, y: 1 }, "m3:hero": { x: 2, y: 2 } };
    const out = foreignMapDraftPlacements(overrides, "m1", ["m1", "m2", "m3"], entities);
    expect(out.map((d) => d.mapId).sort()).toEqual(["m2", "m3"]);
  });
});
