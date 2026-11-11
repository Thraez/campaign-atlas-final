import { describe, expect, it } from "vitest";
import { resolveDeepLink } from "@/atlas/resolveDeepLink";
import { creditsForView } from "@/atlas/map/viewCredits";
import { makeMap, makePlacement, makeWorld } from "./helpers/makeProject";

const maps = [makeMap({ id: "a", height: 100 }), makeMap({ id: "b", height: 50 })];
const placements = [makePlacement({ id: "e@b", entityId: "e", mapId: "b", x: 5, y: 6 })];
const project = { maps, placements };
const opts = {
  currentMapId: null,
  defaultMapId: "a",
  hasDesktopAside: true,
  ocean: { height: 900, isMap: (id: string) => id === "a" || id === "b" },
};
const link = (o: object) => ({ mapId: null, entityId: null, center: null, zoom: null, ...o });

describe("resolveDeepLink, v2 (ocean)", () => {
  it("no map is the ocean, with its camera", () => {
    const r = resolveDeepLink(link({ center: { x: 1, y: 2 }, zoom: -1 }), project, opts);
    expect(r.mapId).toBeNull();
    expect(r.fly).toEqual({ x: 1, y: 2, height: 900, zoom: -1 });
  });
  it("an unknown map opens the ocean and drops the camera", () => {
    const r = resolveDeepLink(
      link({ mapId: "zz", center: { x: 1, y: 2 }, zoom: 3 }),
      project,
      opts,
    );
    expect(r).toMatchObject({ mapId: null, fly: null });
  });
  it("a map the tree lacks counts as unknown", () => {
    const r = resolveDeepLink(link({ mapId: "b" }), project, {
      ...opts,
      ocean: { height: 900, isMap: () => false },
    });
    expect(r.mapId).toBeNull();
  });
  it("an entity link lands on its map, on the placement", () => {
    const r = resolveDeepLink(link({ entityId: "e" }), project, opts);
    expect(r.mapId).toBe("b");
    expect(r.fly).toEqual({ x: 5, y: 6, height: 50 });
  });
  it("an entity with no placement stays on the ocean", () => {
    expect(resolveDeepLink(link({ entityId: "nope" }), project, opts).mapId).toBeNull();
  });
});

describe("creditsForView", () => {
  const worlds = [
    makeWorld({
      id: "w1",
      credits: { badges: false },
      assetCredits: { x: { credit: "X", enabled: true } },
    }),
    makeWorld({ id: "w2", assetCredits: { y: { credit: "Y", enabled: true } } }),
  ];
  it("v1: the first world", () => {
    expect(creditsForView({ worlds }, { worldId: "w2" }).assetCredits).toHaveProperty("x");
  });
  it("v2 map: its own world", () => {
    const c = creditsForView({ worlds, ocean: {} as never }, { worldId: "w2" });
    expect(c.assetCredits).toEqual(worlds[1].assetCredits);
  });
  it("v2 ocean: every world", () => {
    const c = creditsForView({ worlds, ocean: {} as never }, null);
    expect(Object.keys(c.assetCredits!).sort()).toEqual(["x", "y"]);
    expect(c.credits?.badges).toBe(true);
  });
});
