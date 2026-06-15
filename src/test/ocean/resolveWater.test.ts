import { describe, it, expect } from "vitest";
import { resolveWater, deriveCrestColor, DEFAULT_WATER } from "@/atlas/ocean/resolveWater";

const BASE_MAP = { oceanColor: "#18313f" } as const;

describe("resolveWater", () => {
  it("applies defaults when water is undefined", () => {
    const r = resolveWater(BASE_MAP);
    expect(r.enabled).toBe(true);
    expect(r.intensity).toBeCloseTo(DEFAULT_WATER.intensity);
    expect(r.speed).toBeCloseTo(DEFAULT_WATER.speed);
    // crestColor is derived, not a specific value — just check it's a valid hex
    expect(r.crestColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("enabled:false disables water", () => {
    const r = resolveWater({ ...BASE_MAP, water: { enabled: false } });
    expect(r.enabled).toBe(false);
  });

  it("enabled:true (explicit) keeps water on", () => {
    const r = resolveWater({ ...BASE_MAP, water: { enabled: true } });
    expect(r.enabled).toBe(true);
  });

  it("clamps intensity below 0 to 0", () => {
    const r = resolveWater({ ...BASE_MAP, water: { intensity: -0.5 } });
    expect(r.intensity).toBe(0);
  });

  it("clamps intensity above 1 to 1", () => {
    const r = resolveWater({ ...BASE_MAP, water: { intensity: 2.5 } });
    expect(r.intensity).toBe(1);
  });

  it("clamps speed below 0 to 0", () => {
    const r = resolveWater({ ...BASE_MAP, water: { speed: -1 } });
    expect(r.speed).toBe(0);
  });

  it("clamps speed above 1 to 1", () => {
    const r = resolveWater({ ...BASE_MAP, water: { speed: 1.5 } });
    expect(r.speed).toBe(1);
  });

  it("uses explicit valid hex crestColor", () => {
    const r = resolveWater({ ...BASE_MAP, water: { crestColor: "#aabbcc" } });
    expect(r.crestColor).toBe("#aabbcc");
  });

  it("falls back to derived crestColor when invalid hex supplied", () => {
    const r = resolveWater({ ...BASE_MAP, water: { crestColor: "not-a-color" } });
    // Must be the derivation from oceanColor, not the bad input
    expect(r.crestColor).toBe(deriveCrestColor(BASE_MAP.oceanColor));
    expect(r.crestColor).not.toBe("not-a-color");
  });

  it("falls back to derived crestColor when crestColor is empty string", () => {
    const r = resolveWater({ ...BASE_MAP, water: { crestColor: "" } });
    expect(r.crestColor).toBe(deriveCrestColor(BASE_MAP.oceanColor));
  });

  it("derives crestColor from the map's oceanColor when none provided", () => {
    const blueMap = { oceanColor: "#003366" };
    const r = resolveWater(blueMap);
    expect(r.crestColor).toBe(deriveCrestColor("#003366"));
    // Must differ from the base color (lighter)
    expect(r.crestColor).not.toBe("#003366");
  });

  it("uses '#18313f' as fallback when oceanColor is undefined", () => {
    const r = resolveWater({});
    expect(r.enabled).toBe(true);
    // Just ensure it produces a valid hex without throwing
    expect(r.crestColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("deriveCrestColor", () => {
  it("lightens toward white by blending 40%", () => {
    // oceanColor #000000 → blend toward white 40% → #666666
    expect(deriveCrestColor("#000000")).toBe("#666666");
  });

  it("returns fallback for a non-6-char hex", () => {
    expect(deriveCrestColor("#fff")).toBe("#4a7a8a");
  });
});
