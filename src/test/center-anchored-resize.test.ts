import { describe, it, expect } from "vitest";
import { centerAnchoredResize } from "@/atlas/layerGeometry";

describe("centerAnchoredResize", () => {
  it("keeps the geometric center fixed when scaling down by half", () => {
    // Layer centered at (200, 300). Scaling down to half should move the
    // top-left to (200-100, 300-150) = (100, 150).
    const cur = { x: 0, y: 0, width: 400, height: 600 };
    const next = centerAnchoredResize(cur, 200, 300);
    expect(next).toEqual({ x: 100, y: 150, width: 200, height: 300 });
    // Verify center invariant.
    const cxBefore = cur.x + cur.width / 2;
    const cyBefore = cur.y + cur.height / 2;
    const cxAfter = next.x + next.width / 2;
    const cyAfter = next.y + next.height / 2;
    expect(cxAfter).toBe(cxBefore);
    expect(cyAfter).toBe(cyBefore);
  });

  it("keeps center fixed when scaling up", () => {
    const cur = { x: 100, y: 200, width: 200, height: 100 };
    const next = centerAnchoredResize(cur, 400, 200);
    expect(next.x + next.width / 2).toBe(cur.x + cur.width / 2);
    expect(next.y + next.height / 2).toBe(cur.y + cur.height / 2);
  });

  it("rounds to integers (atlas units are whole pixels)", () => {
    const cur = { x: 0, y: 0, width: 100, height: 100 };
    const next = centerAnchoredResize(cur, 99.7, 99.3);
    expect(Number.isInteger(next.x)).toBe(true);
    expect(Number.isInteger(next.y)).toBe(true);
    expect(Number.isInteger(next.width)).toBe(true);
    expect(Number.isInteger(next.height)).toBe(true);
  });

  it("clamps width/height to at least 1 to prevent degenerate layers", () => {
    const cur = { x: 0, y: 0, width: 100, height: 100 };
    const next = centerAnchoredResize(cur, 0, -5);
    expect(next.width).toBe(1);
    expect(next.height).toBe(1);
  });

  it("identity transform leaves geometry unchanged", () => {
    const cur = { x: 50, y: 70, width: 200, height: 150 };
    const next = centerAnchoredResize(cur, 200, 150);
    expect(next).toEqual(cur);
  });
});
