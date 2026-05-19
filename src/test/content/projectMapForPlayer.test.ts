import { describe, it, expect } from "vitest";
import { projectMapForPlayer } from "@/atlas/content/projectMapForPlayer";
import type { Entity } from "@/atlas/content/schema";

const ent = (id: string, visibility: string): Entity => ({
  id, title: id, type: "npc", visibility, aliases: [], tags: [], images: [],
  body: "", bodyHtml: "", frontmatter: {}, sourcePath: "", links: [], backlinks: [],
} as Entity);

describe("projectMapForPlayer", () => {
  const entitiesById = new Map<string, Entity>([
    ["a", ent("a", "player")],
    ["b", ent("b", "dm")],
    ["c", ent("c", "player")], // player-visible but its pin is fogged
  ]);
  const placements = [
    { entityId: "a", x: 10, y: 10, mapId: "m" },
    { entityId: "b", x: 20, y: 20, mapId: "m" },
    { entityId: "c", x: 90, y: 90, mapId: "m" },
  ] as never[];
  // Fog covers the region around (90,90) only.
  const isFogged = (x: number, y: number) => x >= 80 && y >= 80;

  it("drops dm/hidden placements; keeps player-visible unfogged pins", () => {
    const r = projectMapForPlayer({ placements, regions: [], routes: [], entitiesById, isFogged });
    expect(r.placements.map((p) => p.entityId)).toEqual(["a"]);
  });

  it("omits the pin for a player-visible-but-fogged entity (still reported as fogged)", () => {
    const r = projectMapForPlayer({ placements, regions: [], routes: [], entitiesById, isFogged });
    expect(r.placements.some((p) => p.entityId === "c")).toBe(false);
    expect(r.foggedEntityIds).toContain("c");
  });

  it("drops dm/hidden regions and routes", () => {
    const regions = [{ id: "r1", visibility: "player" }, { id: "r2", visibility: "dm" }] as never[];
    const routes = [{ id: "t1", visibility: "rumor" }, { id: "t2", visibility: "hidden" }] as never[];
    const r = projectMapForPlayer({ placements: [], regions, routes, entitiesById, isFogged });
    expect(r.regions.map((x: { id: string }) => x.id)).toEqual(["r1"]);
    expect(r.routes.map((x: { id: string }) => x.id)).toEqual(["t1"]);
  });

  it("drops a route with any point in fog", () => {
    const routes = [{ id:"t1", visibility:"player",
      resolvedPoints:[[10,10],[90,90]] }] as never[]; // (90,90) is fogged
    const r = projectMapForPlayer({ placements:[], regions:[], routes,
      entitiesById, isFogged });
    expect(r.routes.length).toBe(0);
  });
  it("keeps a route entirely in the lit area", () => {
    const routes = [{ id:"t2", visibility:"player",
      resolvedPoints:[[10,10],[20,20]] }] as never[];
    const r = projectMapForPlayer({ placements:[], regions:[], routes,
      entitiesById, isFogged });
    expect(r.routes.map((x: { id: string }) => x.id)).toEqual(["t2"]);
  });
  it("drops a region with any vertex in fog", () => {
    const regions = [{ id:"r1", visibility:"player",
      points:[[10,10],[90,90],[10,90]] }] as never[];
    const r = projectMapForPlayer({ placements:[], regions, routes:[],
      entitiesById, isFogged });
    expect(r.regions.length).toBe(0);
  });
});
