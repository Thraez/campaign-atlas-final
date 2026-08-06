import { describe, it, expect } from "vitest";
import {
  PIN_PRESETS,
  defaultPresetForType,
  diffPinOverride,
  resolvePinStyle,
  pinSvg,
} from "@/atlas/pins/presets";
import { KNOWN_ENTITY_TYPES } from "@/atlas/content/entityCategory";

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
    expect(
      diffPinOverride("settlement", { color: settle.color, shape: settle.shape }),
    ).toBeUndefined();
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

/**
 * These two tables are edited independently and drifted apart in the wild:
 * `event` and `item` were filed into categories but had no pin preset, so a
 * vault of events rendered as identical grey `custom` pins. Every fixture in
 * the suite used `settlement` — which does have a preset — so nothing caught
 * it. Assert the relationship instead of spot-checking types.
 */
describe("pin presets cover every categorised entity type", () => {
  it("no type with a category home falls through to the grey custom pin", () => {
    const orphans = KNOWN_ENTITY_TYPES.filter((t) => defaultPresetForType(t) === "custom");
    expect(orphans).toEqual([]);
  });

  it("resolves the types a real vault actually uses", () => {
    expect(defaultPresetForType("event")).toBe("event");
    expect(defaultPresetForType("item")).toBe("item");
    expect(defaultPresetForType("character")).toBe("npc");
    expect(defaultPresetForType("person")).toBe("npc");
  });

  it("gives events and items distinct shapes so a legend can tell them apart", () => {
    const shapes = KNOWN_ENTITY_TYPES.map((t) => PIN_PRESETS[defaultPresetForType(t)]);
    // An event must never read as the hazard it shares a shape with.
    expect(PIN_PRESETS.event.shape).toBe("diamond");
    expect(PIN_PRESETS.event.color).not.toBe(PIN_PRESETS.hazard.color);
    // Items own the only square in the set.
    expect(PIN_PRESETS.item.shape).toBe("square");
    expect(shapes.filter((p) => p.shape === "square")).toHaveLength(1);
  });
});

// Round-trip of label + pin override through the canonical save flow is
// covered in src/test/canonical-placement-save.test.ts. The legacy
// buildPlacementPatch builder was deleted with the offline-export modal.
