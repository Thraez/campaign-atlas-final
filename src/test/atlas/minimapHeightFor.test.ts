import { describe, it, expect } from "vitest";
import { minimapHeightFor } from "@/atlas/AtlasMinimap";
import { makeMap } from "../helpers/makeProject";

describe("minimapHeightFor (pure)", () => {
  it("scales height to the map's aspect ratio at the default width", () => {
    const map = makeMap({ width: 1000, height: 500 });
    expect(minimapHeightFor(map)).toBe(90); // 180 * (500/1000)
  });

  it("respects a custom target width", () => {
    const map = makeMap({ width: 1000, height: 500 });
    expect(minimapHeightFor(map, 100)).toBe(50);
  });

  it("never returns less than the 40px floor for very wide maps", () => {
    const map = makeMap({ width: 4000, height: 200 });
    expect(minimapHeightFor(map)).toBe(40);
  });
});
