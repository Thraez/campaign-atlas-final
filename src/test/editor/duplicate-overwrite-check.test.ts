import { describe, it, expect } from "vitest";
import { targetMapHasPlacement } from "@/atlas/editor/duplicateOverwriteCheck";

describe("targetMapHasPlacement", () => {
  it("is false when the entity has no canon placement or override on the target map", () => {
    expect(targetMapHasPlacement("m2", "hero", {}, [])).toBe(false);
  });

  it("is true when a canon placement already exists on the target map", () => {
    const canon = [{ entityId: "hero", mapId: "m2" }];
    expect(targetMapHasPlacement("m2", "hero", {}, canon)).toBe(true);
  });

  it("is true when a local override already exists on the target map", () => {
    const overrides = { "m2:hero": { x: 1, y: 1 } };
    expect(targetMapHasPlacement("m2", "hero", overrides, [])).toBe(true);
  });

  it("is false when the override explicitly removed the placement (stored null), even if canon has it", () => {
    const overrides = { "m2:hero": null };
    const canon = [{ entityId: "hero", mapId: "m2" }];
    expect(targetMapHasPlacement("m2", "hero", overrides, canon)).toBe(false);
  });

  it("ignores placements/overrides for a different entity or map", () => {
    const overrides = { "m2:villain": { x: 1, y: 1 } };
    const canon = [{ entityId: "hero", mapId: "m3" }];
    expect(targetMapHasPlacement("m2", "hero", overrides, canon)).toBe(false);
  });
});
