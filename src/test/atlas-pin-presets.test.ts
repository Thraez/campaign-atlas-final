import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import {
  PIN_PRESETS,
  defaultPresetForType,
  diffPinOverride,
  resolvePinStyle,
} from "@/atlas/pins/presets";
import { buildPlacementPatch } from "@/atlas/yaml/buildPatches";
import type { AtlasProject, MapDocument, Entity } from "@/atlas/content/schema";

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

describe("buildPlacementPatch with pin styling", () => {
  const map: MapDocument = { id: "m1", worldId: "w1", name: "Map", width: 1000, height: 800, layers: [] };
  const project: AtlasProject = {
    version: "1", publishedAt: new Date().toISOString(),
    worlds: [{ id: "w1", name: "W", defaultMapId: "m1" }],
    maps: [map],
    entities: [{ id: "town", title: "Town", type: "settlement", visibility: "player", aliases: [], tags: [], images: [], body: "", bodyHtml: "", frontmatter: {}, sourcePath: "town.md", links: [], backlinks: [] }] as Entity[],
    placements: [], assets: [],
  };

  it("emits pin + label only when overridden", () => {
    const a = buildPlacementPatch({
      project, mapId: "m1",
      placements: [{ entityId: "town", mapId: "m1", x: 10, y: 20, label: "Custom Label", pin: { color: "#ff0000" } }],
    });
    const yamlBody = a.content.split("\n").filter((l) => !l.startsWith("#")).join("\n");
    const parsed = yaml.load(yamlBody) as { atlas: { placements: Array<Record<string, unknown>> } };
    const p = parsed.atlas.placements[0];
    expect(p.label).toBe("Custom Label");
    expect((p.pin as Record<string, unknown>).color).toBe("#ff0000");
  });

  it("omits label when it equals entity title", () => {
    const a = buildPlacementPatch({
      project, mapId: "m1",
      placements: [{ entityId: "town", mapId: "m1", x: 10, y: 20, label: "Town" }],
    });
    expect(a.content).not.toMatch(/label:/);
  });
});
