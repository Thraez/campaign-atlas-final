import { describe, it, expect } from "vitest";
import { measureDistance } from "@/atlas/ruler/measureDistance";

const SCALE = { unitsPerPixel: 0.05, unitLabel: "mi" };

describe("measureDistance", () => {
  it("computes a known 3-4-5 triangle in world units", () => {
    const r = measureDistance({ x: 0, y: 0 }, { x: 3, y: 4 }, SCALE);
    expect(r.distPx).toBeCloseTo(5);
    expect(r.label).toBe("0.3 mi"); // 5 * 0.05
  });

  it("returns zero distance when both points are the same", () => {
    const r = measureDistance({ x: 10, y: 20 }, { x: 10, y: 20 }, SCALE);
    expect(r.distPx).toBe(0);
    expect(r.label).toBe("0.0 mi");
  });

  it("falls back to px label when scale is undefined", () => {
    const r = measureDistance({ x: 0, y: 0 }, { x: 3, y: 4 }, undefined);
    expect(r.distPx).toBeCloseTo(5);
    expect(r.label).toBe("5 px");
  });

  it("handles large coordinate values", () => {
    const r = measureDistance({ x: 0, y: 0 }, { x: 4000, y: 3000 }, SCALE);
    expect(r.distPx).toBeCloseTo(5000);
    expect(r.label).toBe("250.0 mi"); // 5000 * 0.05
  });

  it("formats the label with the scale's unitLabel", () => {
    const kmScale = { unitsPerPixel: 0.1, unitLabel: "km" };
    const r = measureDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, kmScale);
    expect(r.distPx).toBeCloseTo(10);
    expect(r.label).toBe("1.0 km");
  });

  it("rounds px label to nearest integer when no scale", () => {
    // distPx ≈ 7.07 → rounds to 7
    const r = measureDistance({ x: 0, y: 0 }, { x: 5, y: 5 }, undefined);
    expect(r.label).toBe("7 px");
  });
});
