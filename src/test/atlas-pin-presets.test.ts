import { describe, it, expect } from "vitest";
import {
  PIN_PRESETS,
  defaultPresetForType,
  diffPinOverride,
  resolvePinStyle,
} from "@/atlas/pins/presets";

describe("pin presets", () => {
  it("maps common entity types to presets", () => {
    expect(defaultPresetForType("settlement")).toBe("settlement");
    expect(defaultPresetForType("city")).toBe("settlement");
    expect(defaultPresetForType("ruin")).toBe("ruin");
    expect(defaultPresetForType("unknown_type")).toBe("custom");
  });

  it("diffPinOverride drops keys equal to preset defaults", () => {
    const settle = PIN_PRESETS.settlement;
    expect(diffPinOverride("settlement", { color: settle.color, shape: settle.shape })).toBeUndefined();
    const diff = diffPinOverride("settlement", { color: "#ff0000", shape: settle.shape });
    expect(diff).toEqual({ color: "#ff0000" });
  });

  it("resolvePinStyle merges preset + override", () => {
    const r = resolvePinStyle("settlement", { color: "#abcdef", priority: 9 });
    expect(r.color).toBe("#abcdef");
    expect(r.priority).toBe(9);
    expect(r.shape).toBe(PIN_PRESETS.settlement.shape);
  });
});

// Round-trip of label + pin override through the canonical save flow is
// covered in src/test/canonical-placement-save.test.ts. The legacy
// buildPlacementPatch builder was deleted with the offline-export modal.
