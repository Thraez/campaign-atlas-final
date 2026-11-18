import { describe, expect, it } from "vitest";
import { collapseCrumbs } from "@/atlas/map/collapseCrumbs";

describe("collapseCrumbs", () => {
  it("keeps a short trail whole", () => {
    expect(collapseCrumbs(["a", "b", "c"], 3)).toEqual({ hidden: [], shown: ["a", "b", "c"] });
    expect(collapseCrumbs([], 3)).toEqual({ hidden: [], shown: [] });
  });
  it("folds earlier levels into hidden, keeping the last maxShown - 1", () => {
    expect(collapseCrumbs(["a", "b", "c", "d"], 3)).toEqual({
      hidden: ["a", "b"],
      shown: ["c", "d"],
    });
    expect(collapseCrumbs(["a", "b", "c", "d", "e"], 3)).toEqual({
      hidden: ["a", "b", "c"],
      shown: ["d", "e"],
    });
  });
  it("never drops a level and always shows the current one", () => {
    for (let n = 1; n < 8; n++) {
      const items = Array.from({ length: n }, (_, i) => i);
      const { hidden, shown } = collapseCrumbs(items, 3);
      expect([...hidden, ...shown]).toEqual(items);
      expect(shown.at(-1)).toBe(n - 1);
    }
  });
  it("treats a bad maxShown as 1", () => {
    expect(collapseCrumbs(["a", "b"], 0)).toEqual({ hidden: ["a"], shown: ["b"] });
  });
});
