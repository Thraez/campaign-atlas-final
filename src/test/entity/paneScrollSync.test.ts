import { describe, it, expect } from "vitest";
import { buildAnchors, mapScroll } from "@/atlas/entity/paneScrollSync";

describe("paneScrollSync", () => {
  it("extracts heading anchors in order", () => {
    const a = buildAnchors("# Intro\ntext\n## Secret stuff\nx\n## Aftermath\n");
    expect(a.map((x) => x.id)).toEqual(["intro", "secret-stuff", "aftermath"]);
  });

  it("maps a shared anchor to the same anchor", () => {
    const dm = buildAnchors("# Intro\n## Secret\n## Aftermath\n");
    const player = buildAnchors("# Intro\n## Aftermath\n"); // Secret stripped
    expect(mapScroll({ from: dm, to: player, fromAnchorId: "intro" })).toBe("intro");
    expect(mapScroll({ from: dm, to: player, fromAnchorId: "aftermath" })).toBe("aftermath");
  });

  it("parks at the nearest preceding shared anchor for a section absent in the target", () => {
    const dm = buildAnchors("# Intro\n## Secret\n## Aftermath\n");
    const player = buildAnchors("# Intro\n## Aftermath\n");
    // Scrolling DM into "Secret" (absent from player) → player parks at "intro".
    expect(mapScroll({ from: dm, to: player, fromAnchorId: "secret" })).toBe("intro");
  });

  it("returns null when there is no shared anchor at or before (degrade)", () => {
    const a = buildAnchors("## OnlyA\n");
    const b = buildAnchors("## OnlyB\n");
    expect(mapScroll({ from: a, to: b, fromAnchorId: "onlya" })).toBeNull();
  });
});
