import { describe, it, expect } from "vitest";
import { parseDeepLink } from "@/atlas/deepLink";
import { resolveDeepLink, type ResolvedDeepLink } from "@/atlas/resolveDeepLink";
import { makeEntity, makeMap, makePlacement, makeProject, makeWorld } from "./helpers/makeProject";

// world (default, h1000), city (h500), dungeon (h800).
// tower: on world and city. cave: on city, then dungeon (not on the default map).
// lonely: no placement.
const project = makeProject({
  worlds: [makeWorld({ defaultMapId: "world" })],
  maps: [
    makeMap({ id: "world", height: 1000 }),
    makeMap({ id: "city", height: 500 }),
    makeMap({ id: "dungeon", height: 800 }),
  ],
  entities: [makeEntity({ id: "tower" }), makeEntity({ id: "cave" }), makeEntity({ id: "lonely" })],
  placements: [
    makePlacement({ id: "tower@city", entityId: "tower", mapId: "city", x: 50, y: 60 }),
    makePlacement({ id: "tower@world", entityId: "tower", mapId: "world", x: 100, y: 200 }),
    makePlacement({ id: "cave@city", entityId: "cave", mapId: "city", x: 30, y: 40 }),
    makePlacement({ id: "cave@dungeon", entityId: "cave", mapId: "dungeon", x: 10, y: 20 }),
  ],
});

type Expected = Omit<ResolvedDeepLink, "openSheet">;
const cases: Array<[string, string, Expected]> = [
  [
    "entity link with a valid map uses that map",
    "?map=city&entity=tower",
    { mapId: "city", openId: "tower", fly: { x: 50, y: 60, height: 500 } },
  ],
  [
    "entity link without a map prefers the default map's placement",
    "?entity=tower",
    { mapId: "world", openId: "tower", fly: { x: 100, y: 200, height: 1000 } },
  ],
  [
    "entity link without a map, not on the default map, uses the first placement",
    "?entity=cave",
    { mapId: "city", openId: "cave", fly: { x: 30, y: 40, height: 500 } },
  ],
  [
    "entity link with an invalid map is treated as having none",
    "?map=bogus&entity=tower",
    { mapId: "world", openId: "tower", fly: { x: 100, y: 200, height: 1000 } },
  ],
  [
    "entity link on a valid map it isn't placed on stays there without flying",
    "?map=dungeon&entity=tower",
    { mapId: "dungeon", openId: "tower", fly: null },
  ],
  [
    "invalid map with a center flies to the center on the default map",
    "?map=bogus&cx=10&cy=20&cz=2",
    { mapId: "world", openId: null, fly: { x: 10, y: 20, height: 1000, zoom: 2 } },
  ],
  [
    "center with no map flies on the default map",
    "?cx=10&cy=20",
    { mapId: "world", openId: null, fly: { x: 10, y: 20, height: 1000 } },
  ],
  [
    "entity with a map and a center flies to the center",
    "?map=city&entity=tower&cx=1&cy=2&cz=3",
    { mapId: "city", openId: "tower", fly: { x: 1, y: 2, height: 500, zoom: 3 } },
  ],
  [
    "entity with a center but an invalid map uses the default map",
    "?map=bogus&entity=cave&cx=1&cy=2",
    { mapId: "world", openId: "cave", fly: { x: 1, y: 2, height: 1000 } },
  ],
  [
    "unplaced entity opens on the default map without flying",
    "?entity=lonely",
    { mapId: "world", openId: "lonely", fly: null },
  ],
  ["map only", "?map=city", { mapId: "city", openId: null, fly: null }],
  ["empty URL", "", { mapId: "world", openId: null, fly: null }],
];

describe("resolveDeepLink: load and Back agree", () => {
  for (const hasDesktopAside of [true, false]) {
    describe(hasDesktopAside ? "desktop" : "phone", () => {
      it.each(cases)("%s (%s)", (_name, search, expected) => {
        const link = parseDeepLink(search);
        const onLoad = resolveDeepLink(link, project, {
          currentMapId: null,
          defaultMapId: "world",
          hasDesktopAside,
        });
        const onBack = resolveDeepLink(link, project, {
          currentMapId: "dungeon",
          defaultMapId: "world",
          hasDesktopAside,
        });
        const want = { ...expected, openSheet: !hasDesktopAside && expected.openId != null };
        expect(onLoad).toEqual(want);
        expect(onBack).toEqual(want);
      });
    });
  }

  it("falls back to the current map when the default map is missing", () => {
    const r = resolveDeepLink(parseDeepLink(""), project, {
      currentMapId: "city",
      defaultMapId: "gone",
      hasDesktopAside: true,
    });
    expect(r.mapId).toBe("city");
  });
});
