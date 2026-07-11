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

  it("includes the six content categories and the four map tools", () => {
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
        "save",
        "publish",
      ]),
    );
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
