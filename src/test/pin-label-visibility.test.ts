import { describe, it, expect } from "vitest";
import { shouldShowLabel, labelVisibilityThreshold } from "@/atlas/pins/labelVisibility";

describe("labelVisibilityThreshold", () => {
  it("returns 9 at zoom -6 (very zoomed out — only capitals)", () => {
    expect(labelVisibilityThreshold(-6)).toBe(9);
  });
  it("returns 7 at zoom -4 (region centers)", () => {
    expect(labelVisibilityThreshold(-4)).toBe(7);
  });
  it("returns 5 at zoom -2 (settlements)", () => {
    expect(labelVisibilityThreshold(-2)).toBe(5);
  });
  it("returns 3 at zoom 0", () => {
    expect(labelVisibilityThreshold(0)).toBe(3);
  });
  it("returns 1 at zoom 2 (shops)", () => {
    expect(labelVisibilityThreshold(2)).toBe(1);
  });
  it("returns 0 at zoom 3+ (everything shows)", () => {
    expect(labelVisibilityThreshold(3)).toBe(0);
    expect(labelVisibilityThreshold(5)).toBe(0);
    expect(labelVisibilityThreshold(10)).toBe(0);
  });
  it("never returns negative", () => {
    expect(labelVisibilityThreshold(100)).toBe(0);
  });
});

describe("shouldShowLabel", () => {
  it("capital (priority 9) shows at zoom -6", () => {
    expect(shouldShowLabel(-6, 9)).toBe(true);
  });
  it("capital (priority 9) does not show at zoom -7 (below threshold 10)", () => {
    expect(shouldShowLabel(-7, 9)).toBe(false);
  });
  it("settlement (priority 6) shows at zoom -3", () => {
    expect(shouldShowLabel(-3, 6)).toBe(true);
  });
  it("settlement (priority 6) does not show at zoom -4 (threshold 7)", () => {
    expect(shouldShowLabel(-4, 6)).toBe(false);
  });
  it("npc (priority 2) shows at zoom 1", () => {
    expect(shouldShowLabel(1, 2)).toBe(true);
  });
  it("npc (priority 2) does not show at zoom 0 (threshold 3)", () => {
    expect(shouldShowLabel(0, 2)).toBe(false);
  });
  it("shop (priority 1) shows at zoom 2", () => {
    expect(shouldShowLabel(2, 1)).toBe(true);
  });
  it("shop (priority 1) does not show at zoom 1 (threshold 2)", () => {
    expect(shouldShowLabel(1, 1)).toBe(false);
  });
  it("everything (priority 0) shows at zoom 3", () => {
    expect(shouldShowLabel(3, 0)).toBe(true);
  });
  it("everything (priority 0) shows at any zoom 3+", () => {
    expect(shouldShowLabel(5, 0)).toBe(true);
    expect(shouldShowLabel(10, 0)).toBe(true);
  });
  it("even priority 0 is hidden at zoom -6 (threshold 9)", () => {
    expect(shouldShowLabel(-6, 0)).toBe(false);
  });
});
