import { describe, it, expect } from "vitest";
import { niceScaleNumber } from "@/atlas/scale/scaleBarUtils";

describe("niceScaleNumber", () => {
  it("returns 1/2/5 exactly for exact 1×10^n inputs", () => {
    expect(niceScaleNumber(1)).toBe(1);
    expect(niceScaleNumber(2)).toBe(2);
    expect(niceScaleNumber(5)).toBe(5);
    expect(niceScaleNumber(10)).toBe(10);
    expect(niceScaleNumber(20)).toBe(20);
    expect(niceScaleNumber(50)).toBe(50);
    expect(niceScaleNumber(100)).toBe(100);
  });

  it("boundary: norm < 1.5 → 1×10^n", () => {
    expect(niceScaleNumber(1.0)).toBe(1);
    expect(niceScaleNumber(1.4)).toBe(1);
    expect(niceScaleNumber(14)).toBe(10);
  });

  it("boundary: 1.5 ≤ norm < 3.5 → 2×10^n", () => {
    expect(niceScaleNumber(1.5)).toBe(2);
    expect(niceScaleNumber(2.5)).toBe(2);
    expect(niceScaleNumber(3.4)).toBe(2);
    expect(niceScaleNumber(25)).toBe(20);
  });

  it("boundary: 3.5 ≤ norm < 7.5 → 5×10^n", () => {
    expect(niceScaleNumber(3.5)).toBe(5);
    expect(niceScaleNumber(4.9)).toBe(5);
    expect(niceScaleNumber(7.4)).toBe(5);
    expect(niceScaleNumber(42)).toBe(50);
  });

  it("boundary: norm ≥ 7.5 → 10×10^n (next order)", () => {
    expect(niceScaleNumber(7.5)).toBe(10);
    expect(niceScaleNumber(9.9)).toBe(10);
    expect(niceScaleNumber(76)).toBe(100);
  });

  it("handles fractional values (sub-1)", () => {
    expect(niceScaleNumber(0.5)).toBe(0.5);
    expect(niceScaleNumber(0.2)).toBe(0.2);
    expect(niceScaleNumber(0.1)).toBe(0.1);
    expect(niceScaleNumber(0.07)).toBeCloseTo(0.05, 10);
  });

  it("edge cases: zero, negative, Infinity → 1", () => {
    expect(niceScaleNumber(0)).toBe(1);
    expect(niceScaleNumber(-5)).toBe(1);
    expect(niceScaleNumber(Infinity)).toBe(1);
    expect(niceScaleNumber(NaN)).toBe(1);
  });
});
