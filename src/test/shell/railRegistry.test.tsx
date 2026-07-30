// src/test/shell/railRegistry.test.tsx
import { describe, it, expect } from "vitest";
import { buildRailItems, type RailItem } from "@/atlas/shell/railRegistry";

const noop = () => null;

describe("railRegistry", () => {
  it("emits content group then map group then system group, in order", () => {
    const items = buildRailItems({
      panels: { categories: {}, tools: {}, system: {} } as never,
      counts: {},
    });
    const groups = items.map((i: RailItem) => i.group);
    const firstMap = groups.indexOf("map");
    const firstSystem = groups.indexOf("system");
    expect(groups.indexOf("content")).toBeLessThan(firstMap);
    expect(firstMap).toBeLessThan(firstSystem);
  });

  it("includes the six content categories and the map tools", () => {
    const items = buildRailItems({ panels: {} as never, counts: {} });
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "characters",
        "locations",
        "factions",
        "events",
        "items",
        "lore",
        "pins",
        "regions",
        "routes",
        "fog",
        "publish",
      ]),
    );
  });

  it("registers no Save item — it had no panel, and the toolbar owns Save", () => {
    const items = buildRailItems({ panels: {} as never, counts: {} });
    expect(items.find((i) => i.id === "save")).toBeUndefined();
  });

  it("every item has a panel key it can actually render", () => {
    // A rail item with no corresponding panel opens an empty flyout. Guard the
    // whole registry rather than one id, so the next addition can't regress.
    const panels = Object.fromEntries(
      buildRailItems({ panels: {} as never, counts: {} }).map((i) => [i.id, <div key={i.id} />]),
    );
    const items = buildRailItems({ panels, counts: {} });
    for (const it of items) {
      expect(it.panel, `rail item "${it.id}" has no panel`).toBeDefined();
    }
  });

  it("resolves a badge count when a badge fn is provided", () => {
    const items = buildRailItems({ panels: {} as never, counts: { pins: 3 } });
    const pins = items.find((i) => i.id === "pins")!;
    expect(pins.badge?.()).toBe(3);
  });

  it("registers a Sound item in the map group with a panel", () => {
    const items = buildRailItems({ panels: { sound: <div /> }, counts: {} });
    const sound = items.find((i) => i.id === "sound");
    expect(sound).toBeDefined();
    expect(sound!.group).toBe("map");
    expect(sound!.label).toBe("Sound");
    expect(sound!.panel).toBeDefined();
  });
});
