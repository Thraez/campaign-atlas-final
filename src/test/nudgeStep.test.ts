import { describe, it, expect } from "vitest";
import { NUDGE_COARSE, NUDGE_FINE, nudgeStep } from "@/atlas/nudgeStep";

describe("nudgeStep", () => {
  it("returns the fine step for a plain click", () => {
    expect(nudgeStep(false)).toBe(NUDGE_FINE);
  });

  it("returns the coarse step for a Shift-held click", () => {
    expect(nudgeStep(true)).toBe(NUDGE_COARSE);
  });

  it("coarse step is larger than fine step", () => {
    expect(NUDGE_COARSE).toBeGreaterThan(NUDGE_FINE);
  });
});
