import { describe, it, expect } from "vitest";
import { centerAnchoredResize, clampLayerToCanvas } from "@/atlas/layerGeometry";

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

describe("clampLayerToCanvas", () => {
  const canvas = { width: 200000, height: 150000 };

  it("leaves a layer inside the canvas untouched", () => {
    const rect = { x: 1000, y: 2000, width: 50000, height: 40000 };
    expect(clampLayerToCanvas(rect, canvas)).toEqual(rect);
  });

  it("clamps negative coordinates to 0 (the regression from the move-and-resize batch)", () => {
    const rect = { x: -2408, y: -1601, width: 41576, height: 20788 };
    const out = clampLayerToCanvas(rect, canvas);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(41576);
    expect(out.height).toBe(20788);
  });

  it("clamps y so the bottom of the layer stays inside the canvas", () => {
    // The original report: y=132956 + height=26031 = 158987, exceeds 150000.
    const rect = { x: 37200, y: 132956, width: 34672, height: 26031 };
    const out = clampLayerToCanvas(rect, canvas);
    expect(out.y).toBe(canvas.height - rect.height);
    expect(out.y + out.height).toBeLessThanOrEqual(canvas.height);
  });

  it("clamps x so the right edge stays inside the canvas", () => {
    const rect = { x: 190000, y: 0, width: 50000, height: 1000 };
    const out = clampLayerToCanvas(rect, canvas);
    expect(out.x).toBe(canvas.width - rect.width);
    expect(out.x + out.width).toBeLessThanOrEqual(canvas.width);
  });

  it("clamps width/height that exceed the canvas, then re-clamps x/y", () => {
    const rect = { x: -1000, y: -1000, width: 300000, height: 200000 };
    const out = clampLayerToCanvas(rect, canvas);
    expect(out.width).toBe(canvas.width);
    expect(out.height).toBe(canvas.height);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it("never returns width/height below 1 (degenerate layers would break resize math)", () => {
    const rect = { x: 0, y: 0, width: 0, height: -5 };
    const out = clampLayerToCanvas(rect, canvas);
    expect(out.width).toBeGreaterThanOrEqual(1);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });
});
