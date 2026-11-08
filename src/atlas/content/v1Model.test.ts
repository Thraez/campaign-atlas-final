/**
 * The v1 adapter (R-12): a v1 world presented as the atlas model, one world and
 * one campaign `main`. Every rule and every fail-closed visibility path is
 * pinned here; the loader test covers reading real files.
 */
import { describe, expect, it } from "vitest";
import type { FogOverlay, Region } from "./schema";
import {
  v1FallbackMap,
  v1Model,
  V1ModelError,
  v1WorldName,
  V1_CAMPAIGN_ID,
  V1_ZOOM,
  type V1Map,
  type V1Route,
} from "./v1Model";

const W = "testland";

function map(id: string, extra: Partial<V1Map> = {}): V1Map {
  return { id, worldId: W, name: id, width: 100, height: 100, layers: [], ...extra };
}

function region(id: string, mapId: string, extra: Partial<Region> = {}): Region {
  return {
    id,
    mapId,
    name: id,
    points: [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
    visibility: "player",
    ...extra,
  };
}

function route(id: string, mapId: string, extra: Partial<V1Route> = {}): V1Route {
  return {
    id,
    mapId,
    name: id,
    visibility: "player",
    waypoints: [
      [0, 0],
      [5, 5],
    ],
    ...extra,
  };
}

const sq: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe("v1Model: world and maps", () => {
  it("names the world from its folder when world.yaml has no name", () => {
    expect(v1WorldName("astrath-deeprealm")).toBe("Astrath Deeprealm");
    expect(v1WorldName("old_sea world")).toBe("Old Sea World");
    const { model } = v1Model({ worldId: W, maps: [map("a")] });
    expect(model.worlds[0].world).toEqual({ id: W, name: "Testland" });
    expect(v1Model({ worldId: W, name: "Given", maps: [map("a")] }).model.worlds[0].world.name).toBe(
      "Given",
    );
  });

  it("gives a world with no maps the v1 fallback overview map", () => {
    const { model } = v1Model({ worldId: W, maps: [] });
    const m = model.worlds[0].maps;
    expect(m).toHaveLength(1);
    const fb = v1FallbackMap(W);
    expect(m[0]).toMatchObject({
      id: `${W}-overview`,
      name: "Overview",
      width: fb.width,
      height: fb.height,
      layers: [],
      oceanColor: "#18313f",
      wrapX: true,
    });
  });

  it("is schema 1 with no ocean, and one campaign main that shows the vault", () => {
    const { model } = v1Model({ worldId: W, maps: [map("a"), map("b")] });
    expect(model.schemaVersion).toBe(1);
    expect(model.ocean).toBeNull();
    expect(model.onOcean).toEqual([]);
    expect(model.campaigns).toHaveLength(1);
    expect(model.campaigns[0]).toMatchObject({ id: V1_CAMPAIGN_ID, name: "Main", notes: "vault" });
    expect(Object.keys(model.campaigns[0].maps)).toEqual(["a", "b"]);
  });

  it("makes every map a top-level player map with the viewer's zoom range", () => {
    const { model } = v1Model({ worldId: W, maps: [map("a"), map("b")] });
    for (const m of model.worlds[0].maps) {
      expect(m.visibility).toBe("player");
      expect(m.zoom).toEqual(V1_ZOOM);
      expect(m.parent).toBeUndefined();
      expect(m.frame).toBeUndefined();
    }
  });

  it("refuses two maps with one id", () => {
    expect(() => v1Model({ worldId: W, maps: [map("a"), map("a")] })).toThrow(V1ModelError);
  });

  it("lifts one water block to the world", () => {
    const water = { enabled: true, intensity: 0.4 };
    const { model } = v1Model({
      worldId: W,
      maps: [map("a", { water }), map("b", { water: { intensity: 0.4, enabled: true } })],
    });
    expect(model.worlds[0].water).toEqual(water);
    expect(model.worlds[0].maps[0]).not.toHaveProperty("water");
  });

  it("refuses maps whose water differs, naming both", () => {
    const run = (b: V1Map) => () =>
      v1Model({ worldId: W, maps: [map("a", { water: { intensity: 0.4 } }), b] });
    expect(run(map("b", { water: { intensity: 0.5 } }))).toThrow(/"a" and "b"/);
    // Absent next to present also differs: no silent pick.
    expect(run(map("b"))).toThrow(V1ModelError);
  });

  it("keeps layers and splits the soundscape into settings and sound areas", () => {
    const layer = { id: "base", src: "x.png", x: 0, y: 0, width: 10, height: 10, opacity: 1, zIndex: 0 };
    const { model, warnings } = v1Model({
      worldId: W,
      maps: [
        map("a", {
          layers: [layer],
          soundscape: {
            enabled: true,
            masterGain: 0.5,
            areas: [
              { id: "own", points: sq.slice(0, 3), visibility: "rumor", bed: { src: "a.ogg" } },
              { id: "ride", regionId: "r1", bed: { src: "b.ogg", gain: 0.3 } },
              { id: "", points: sq, bed: { src: "c.ogg" } },
              { id: "nobed", points: sq } as never,
              { id: "tiny", points: sq.slice(0, 2), bed: { src: "d.ogg" } },
            ],
          },
        }),
      ],
    });
    const m = model.worlds[0].maps[0];
    expect(m.layers).toEqual([layer]);
    expect(m.soundscape).toEqual({ enabled: true, masterGain: 0.5 });
    expect(m.sound?.map((s) => s.id)).toEqual(["own", "ride"]);
    expect(m.sound?.[1]).toEqual({ id: "ride", regionId: "r1", bed: { src: "b.ogg", gain: 0.3 } });
    expect(warnings.some((w) => w.includes("no id"))).toBe(true);
    expect(warnings.some((w) => w.includes('"nobed"') && w.includes("no bed"))).toBe(true);
    expect(warnings.some((w) => w.includes('"tiny"') && w.includes("3 valid points"))).toBe(true);
  });
});

describe("v1Model: regions, routes and pins", () => {
  it("puts regions and routes on their maps", () => {
    const { model, warnings } = v1Model({
      worldId: W,
      maps: [map("a"), map("b")],
      regions: [region("r1", "a"), region("r2", "b")],
      routes: [route("t1", "b")],
    });
    const [a, b] = model.worlds[0].maps;
    expect(a.regions?.map((r) => r.id)).toEqual(["r1"]);
    expect(b.regions?.map((r) => r.id)).toEqual(["r2"]);
    expect(a.routes).toBeUndefined();
    expect(b.routes?.[0]).toEqual({
      id: "t1",
      name: "t1",
      visibility: "player",
      waypoints: [
        [0, 0],
        [5, 5],
      ],
    });
    expect(warnings).toEqual([]);
  });

  it("drops items on an unknown map, with a warning", () => {
    const { model, warnings } = v1Model({
      worldId: W,
      maps: [map("a")],
      regions: [region("lost", "nowhere")],
      routes: [route("lost-road", "nowhere")],
      pins: [{ note: "n", mapId: "nowhere", x: 1, y: 1 }],
    });
    const a = model.worlds[0].maps[0];
    expect(a.regions).toBeUndefined();
    expect(a.routes).toBeUndefined();
    expect(a.pins).toBeUndefined();
    expect(warnings).toHaveLength(3);
    expect(warnings.every((w) => w.includes('unknown map "nowhere"'))).toBe(true);
  });

  it("drops a region with fewer than 3 points, with a warning", () => {
    const { model, warnings } = v1Model({
      worldId: W,
      maps: [map("a")],
      regions: [region("thin", "a", { points: sq.slice(0, 2) })],
    });
    expect(model.worlds[0].maps[0].regions).toBeUndefined();
    expect(warnings[0]).toMatch(/region "thin" needs at least 3 valid points/);
  });

  it("puts a pin with no map on the first map", () => {
    const { model } = v1Model({
      worldId: W,
      maps: [map("a"), map("b")],
      pins: [
        { note: "n1", x: 1, y: 2 },
        { note: "n2", mapId: "b", x: 3, y: 4, visibility: "rumor" },
      ],
    });
    const [a, b] = model.worlds[0].maps;
    expect(a.pins).toEqual([{ note: "n1", x: 1, y: 2 }]);
    expect(b.pins).toEqual([{ note: "n2", x: 3, y: 4, visibility: "rumor" }]);
  });
});

describe("v1Model: visibility fails closed", () => {
  it("leaves a missing visibility missing (the resolver reads it as dm)", () => {
    const { model, warnings } = v1Model({
      worldId: W,
      maps: [map("a")],
      regions: [region("r", "a", { visibility: undefined as never })],
      pins: [{ note: "n", x: 0, y: 0 }],
    });
    const a = model.worlds[0].maps[0];
    expect(a.regions?.[0]).not.toHaveProperty("visibility");
    expect(a.pins?.[0]).not.toHaveProperty("visibility");
    expect(warnings).toEqual([]);
  });

  it("keeps an unknown visibility as written, with a warning that it resolves to dm", () => {
    const { model, warnings } = v1Model({
      worldId: W,
      maps: [map("a")],
      regions: [region("r", "a", { visibility: "secret" as never })],
      routes: [route("t", "a", { visibility: "Player" as never })],
    });
    const a = model.worlds[0].maps[0];
    expect(a.regions?.[0].visibility).toBe("secret");
    expect(a.routes?.[0].visibility).toBe("Player");
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/region "r": invalid visibility "secret" — it resolves to "dm"/);
  });

  it("loads a visibility that isn't a string as dm, with a warning", () => {
    const { model, warnings } = v1Model({
      worldId: W,
      maps: [map("a")],
      regions: [region("r", "a", { visibility: { main: "player" } as never })],
      pins: [{ note: "n", x: 0, y: 0, visibility: 7 as never }],
    });
    const a = model.worlds[0].maps[0];
    expect(a.regions?.[0].visibility).toBe("dm");
    expect(a.pins?.[0].visibility).toBe("dm");
    expect(warnings).toHaveLength(2);
    expect(warnings.every((w) => w.includes('loading as "dm"'))).toBe(true);
  });
});

describe("v1Model: fog becomes campaign main's map state", () => {
  const fog = (mapId: string, extra: Partial<FogOverlay> = {}): FogOverlay => ({
    mapId,
    enabled: true,
    reveals: [sq],
    ...extra,
  });

  it("an enabled fog is fogged (colour dropped); a disabled or missing one is open", () => {
    const { model } = v1Model({
      worldId: W,
      maps: [map("a"), map("b"), map("c")],
      fogs: [
        fog("a", { color: "#000", conceals: [sq], featherPx: 8 }),
        fog("b", { enabled: false }),
      ],
    });
    const maps = model.campaigns[0].maps;
    expect(maps.a).toEqual({ state: "fogged", reveals: [sq], conceals: [sq], featherPx: 8 });
    expect(maps.b).toEqual({ state: "open" });
    expect(maps.c).toEqual({ state: "open" });
  });

  it("an enabled fog with no reveals is fogged over the whole map", () => {
    const { model } = v1Model({
      worldId: W,
      maps: [map("a")],
      fogs: [{ mapId: "a", enabled: true } as FogOverlay],
    });
    expect(model.campaigns[0].maps.a).toEqual({ state: "fogged", reveals: [] });
  });

  it("warns about a fog on an unknown map and a second fog for one map", () => {
    const { model, warnings } = v1Model({
      worldId: W,
      maps: [map("a")],
      fogs: [fog("a"), fog("a", { enabled: false }), fog("nowhere")],
    });
    expect(model.campaigns[0].maps.a.state).toBe("fogged");
    expect(warnings).toEqual([
      'fog defined twice for map "a" — keeping the first',
      'fog is on unknown map "nowhere" — skipped',
    ]);
  });

  it("keeps the campaign's map record free of prototype keys", () => {
    const { model } = v1Model({ worldId: W, maps: [map("a")] });
    expect(Object.getPrototypeOf(model.campaigns[0].maps)).toBeNull();
  });
});
