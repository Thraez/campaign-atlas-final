/**
 * Tests for resizeFromCornerDrag (src/atlas/layerGeometry.ts) — the pure
 * corner-handle resize math extracted from MapLayerEditableOverlay. Deltas are
 * in atlas space (dx = +east, dy = +south). Results are unrounded/unclamped.
 */
import { describe, it, expect } from "vitest";
import { resizeFromCornerDrag } from "@/atlas/layerGeometry";

const START = { x: 100, y: 100, width: 200, height: 100 };

describe("resizeFromCornerDrag — opposite-corner anchored (default)", () => {
  it("dragging SE grows width/height, top-left stays put", () => {
    const r = resizeFromCornerDrag({
      corner: "se",
      start: START,
      delta: { dx: 40, dy: 20 },
      centerAnchored: false,
      aspectLocked: false,
    });
    expect(r).toEqual({ x: 100, y: 100, width: 240, height: 120 });
  });

  it("dragging NW moves the top-left and shrinks by the delta (SE anchored)", () => {
    const r = resizeFromCornerDrag({
      corner: "nw",
      start: START,
      delta: { dx: 30, dy: 10 },
      centerAnchored: false,
      aspectLocked: false,
    });
    // x/y move by +dx/+dy; width/height shrink by dx/dy.
    expect(r).toEqual({ x: 130, y: 110, width: 170, height: 90 });
  });

  it("floors width/height at 1 when the drag would invert the corner", () => {
    const r = resizeFromCornerDrag({
      corner: "se",
      start: START,
      delta: { dx: -500, dy: -500 },
      centerAnchored: false,
      aspectLocked: false,
    });
    expect(r.width).toBe(1);
    expect(r.height).toBe(1);
  });
});

describe("resizeFromCornerDrag — center-anchored (Alt)", () => {
  it("keeps the center fixed while growing on both sides", () => {
    const r = resizeFromCornerDrag({
      corner: "se",
      start: START,
      delta: { dx: 20, dy: 10 },
      centerAnchored: true,
      aspectLocked: false,
    });
    // width += 2*dx, height += 2*dy; center (200,150) unchanged.
    expect(r.width).toBe(240);
    expect(r.height).toBe(120);
    expect(r.x + r.width / 2).toBe(200);
    expect(r.y + r.height / 2).toBe(150);
  });
});

describe("resizeFromCornerDrag — aspect locked (Shift / panel toggle)", () => {
  it("preserves the start aspect ratio, driven by the larger delta", () => {
    // START aspect = 200/100 = 2. A big horizontal drag drives width, height follows.
    const r = resizeFromCornerDrag({
      corner: "se",
      start: START,
      delta: { dx: 100, dy: 5 },
      centerAnchored: false,
      aspectLocked: true,
    });
    expect(r.width / r.height).toBeCloseTo(2, 10);
  });

  it("aspect-lock and center-anchor compose (ratio held, center fixed)", () => {
    const r = resizeFromCornerDrag({
      corner: "ne",
      start: START,
      delta: { dx: 60, dy: 4 },
      centerAnchored: true,
      aspectLocked: true,
    });
    expect(r.width / r.height).toBeCloseTo(2, 10);
    expect(r.x + r.width / 2).toBeCloseTo(200, 10);
    expect(r.y + r.height / 2).toBeCloseTo(150, 10);
  });
});
