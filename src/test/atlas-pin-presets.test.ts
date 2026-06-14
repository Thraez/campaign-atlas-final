import { describe, it, expect } from "vitest";
import {
  PIN_PRESETS,
  defaultPresetForType,
  diffPinOverride,
  resolvePinStyle,
  pinSvg,
} from "@/atlas/pins/presets";

describe("pin presets", () => {
  it("maps common entity types to presets", () => {
    expect(defaultPresetForType("settlement")).toBe("settlement");
    expect(defaultPresetForType("city")).toBe("settlement");
    expect(defaultPresetForType("ruin")).toBe("ruin");
    expect(defaultPresetForType("unknown_type")).toBe("custom");
  });

  it("defaultPresetForType returns 'custom' for undefined and empty string", () => {
    expect(defaultPresetForType(undefined)).toBe("custom");
    expect(defaultPresetForType("")).toBe("custom");
  });

  it("defaultPresetForType resolves type aliases", () => {
    expect(defaultPresetForType("divine_site")).toBe("temple");
    expect(defaultPresetForType("black_market")).toBe("shop");
    expect(defaultPresetForType("wilderness_landmark")).toBe("hazard");
    expect(defaultPresetForType("player_base")).toBe("player_base");
    expect(defaultPresetForType("resonance_site")).toBe("resonance_site");
    expect(defaultPresetForType("mystery")).toBe("mystery");
  });

  it("defaultPresetForType is case-insensitive", () => {
    expect(defaultPresetForType("SETTLEMENT")).toBe("settlement");
    expect(defaultPresetForType("NPC")).toBe("npc");
    expect(defaultPresetForType("Dungeon")).toBe("dungeon");
  });

  it("diffPinOverride drops keys equal to preset defaults", () => {
    const settle = PIN_PRESETS.settlement;
    expect(diffPinOverride("settlement", { color: settle.color, shape: settle.shape })).toBeUndefined();
    const diff = diffPinOverride("settlement", { color: "#ff0000", shape: settle.shape });
    expect(diff).toEqual({ color: "#ff0000" });
  });

  it("diffPinOverride preserves an explicit preset change", () => {
    const diff = diffPinOverride("settlement", { preset: "custom" });
    expect(diff).toEqual({ preset: "custom" });
  });

  it("diffPinOverride preserves labelMinZoom and priority overrides", () => {
    const base = PIN_PRESETS.settlement;
    const diff = diffPinOverride("settlement", {
      labelMinZoom: base.labelMinZoom + 2,
      priority: base.priority - 1,
    });
    expect(diff).toEqual({
      labelMinZoom: base.labelMinZoom + 2,
      priority: base.priority - 1,
    });
  });

  it("resolvePinStyle merges preset + override", () => {
    const r = resolvePinStyle("settlement", { color: "#abcdef", priority: 9 });
    expect(r.color).toBe("#abcdef");
    expect(r.priority).toBe(9);
    expect(r.shape).toBe(PIN_PRESETS.settlement.shape);
  });

  it("resolvePinStyle with no override returns preset defaults", () => {
    const r = resolvePinStyle("npc");
    expect(r.color).toBe(PIN_PRESETS.npc.color);
    expect(r.shape).toBe(PIN_PRESETS.npc.shape);
    expect(r.labelMode).toBe(PIN_PRESETS.npc.labelMode);
  });

  it("resolvePinStyle with null override returns preset defaults", () => {
    const r = resolvePinStyle("ruin", null);
    expect(r.color).toBe(PIN_PRESETS.ruin.color);
    expect(r.id).toBe("ruin");
  });

  it("resolvePinStyle falls back to custom for unknown type", () => {
    const r = resolvePinStyle("xyzzy");
    expect(r.id).toBe("custom");
  });
});

describe("pinSvg shapes", () => {
  const RED = "#ff0000";

  it("circle produces an SVG with a <circle> element", () => {
    const svg = pinSvg({ color: RED, shape: "circle" });
    expect(svg).toContain("<circle");
    expect(svg).toContain(`fill="${RED}"`);
    expect(svg).toContain("<svg");
  });

  it("square produces an SVG with a <rect> element", () => {
    const svg = pinSvg({ color: RED, shape: "square" });
    expect(svg).toContain("<rect");
    expect(svg).toContain(`fill="${RED}"`);
  });

  it("diamond produces an SVG with a <polygon> element", () => {
    const svg = pinSvg({ color: RED, shape: "diamond" });
    expect(svg).toContain("<polygon");
    expect(svg).toContain(`fill="${RED}"`);
  });

  it("shield produces an SVG with a <path> element", () => {
    const svg = pinSvg({ color: RED, shape: "shield" });
    expect(svg).toContain("<path");
    expect(svg).toContain(`fill="${RED}"`);
  });

  it("star produces an SVG with a <polygon> element", () => {
    const svg = pinSvg({ color: RED, shape: "star" });
    expect(svg).toContain("<polygon");
    expect(svg).toContain(`fill="${RED}"`);
  });

  it("teardrop (default) produces an SVG with a <path> element", () => {
    const svg = pinSvg({ color: RED, shape: "teardrop" });
    expect(svg).toContain("<path");
    expect(svg).toContain(`fill="${RED}"`);
  });

  it("dim option reduces opacity to 0.6", () => {
    const svg = pinSvg({ color: RED, shape: "circle" }, { dim: true });
    expect(svg).toContain("opacity:0.6");
  });

  it("no dim option leaves opacity at 1", () => {
    const svg = pinSvg({ color: RED, shape: "circle" });
    expect(svg).toContain("opacity:1");
    expect(svg).not.toContain("opacity:0.6");
  });

  it("pulse option adds atlas-pulse animation", () => {
    const svg = pinSvg({ color: RED, shape: "circle" }, { pulse: true });
    expect(svg).toContain("atlas-pulse");
  });

  it("no pulse option omits animation", () => {
    const svg = pinSvg({ color: RED, shape: "circle" });
    expect(svg).not.toContain("atlas-pulse");
  });
});

// Round-trip of label + pin override through the canonical save flow is
// covered in src/test/canonical-placement-save.test.ts. The legacy
// buildPlacementPatch builder was deleted with the offline-export modal.
