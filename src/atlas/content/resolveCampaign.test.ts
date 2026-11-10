/**
 * The per-campaign resolver (ADR-0004), one block per rule, each run in two
 * campaigns (`a`, `b`). Every fail-closed path is pinned here: the
 * adversarial player-safety review reads this file first.
 */
import { describe, expect, it } from "vitest";
import {
  areaUnderFog,
  frameUnderFog,
  resolveCampaign,
  ResolveCampaignError,
  visibilityFor,
  type CampaignResolution,
  type CampaignResolverModel,
  type WorldNote,
} from "./resolveCampaign";
import type { FogOverlay, Point } from "./schema";
import type {
  CampaignFileV2,
  CampaignMapV2,
  MapV2,
  NoteOverride,
  VisibilityValue,
  WorldFileV2,
} from "./schemaV2";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const SIZE = 1000;
/** Fog whose reveal is the left half of a 1000 x 1000 map: x > 500 is fogged. */
const LEFT_HALF: CampaignMapV2 = {
  state: "fogged",
  reveals: [
    [
      [0, 0],
      [500, 0],
      [500, SIZE],
      [0, SIZE],
    ],
  ],
};
const OPEN: CampaignMapV2 = { state: "open" };

function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

function map(id: string, extra: Partial<MapV2> = {}): MapV2 {
  return {
    id,
    name: `Map ${id}`,
    width: SIZE,
    height: SIZE,
    visibility: "player",
    layers: [],
    scale: { unitsPerPixel: 1, unitLabel: "mi" },
    zoom: { min: 0, max: 4 },
    ...extra,
  };
}

function child(id: string, parent: string, extra: Partial<MapV2> = {}): MapV2 {
  return map(id, {
    parent,
    frame: { x: 100, y: 100, width: 200, height: 200, rotation: 0 },
    enterZoom: 2,
    ...extra,
  });
}

function world(id: string, maps: MapV2[], notes?: Record<string, NoteOverride>): WorldFileV2 {
  return { schemaVersion: 2, world: { id, name: `World ${id}` }, maps, ...(notes ? { notes } : {}) };
}

function campaign(
  id: string,
  maps: Record<string, CampaignMapV2>,
  notes: CampaignFileV2["notes"] = "vault",
): CampaignFileV2 {
  return { id, name: `Campaign ${id}`, maps, notes };
}

function note(
  id: string,
  opts: {
    world?: string;
    visibility?: WorldNote["note"]["visibility"];
    title?: string;
    aliases?: string[];
    atlas?: Record<string, unknown>;
  } = {},
): WorldNote {
  return {
    world: opts.world ?? "w",
    note: {
      id,
      title: opts.title ?? id,
      aliases: opts.aliases ?? [],
      visibility: opts.visibility ?? "player",
      atlas: opts.atlas ?? {},
    },
  };
}

function model(worlds: WorldFileV2[], campaigns: CampaignFileV2[]): CampaignResolverModel {
  return { worlds, campaigns };
}

const find = <T extends { ships: boolean }>(list: T[], pred: (t: T) => boolean): T => {
  const hit = list.find(pred);
  if (!hit) throw new Error("verdict not found");
  return hit;
};
const mapShips = (r: CampaignResolution, id: string) => find(r.maps, (m) => m.id === id).ships;
const regionShips = (r: CampaignResolution, id: string) => find(r.regions, (x) => x.id === id).ships;
const routeShips = (r: CampaignResolution, id: string) => find(r.routes, (x) => x.id === id).ships;
const soundShips = (r: CampaignResolution, id: string) => find(r.sound, (x) => x.id === id).ships;
const noteShips = (r: CampaignResolution, id: string) => find(r.notes, (x) => x.id === id).ships;
const pinShips = (r: CampaignResolution, mapId: string, index = 0) =>
  find(r.pins, (p) => p.map === mapId && p.index === index).ships;
const worldShips = (r: CampaignResolution, id: string) => find(r.worlds, (w) => w.id === id).ships;

/** A map full of one of everything, all `player`, linked to note `n`. */
function furnished(id: string, extra: Partial<MapV2> = {}): MapV2 {
  return map(id, {
    pins: [{ note: "n", x: 50, y: 50, visibility: "player" }],
    regions: [{ id: `${id}-region`, name: `${id} Region`, points: rect(10, 10, 90, 90), visibility: "player" }],
    routes: [
      {
        id: `${id}-route`,
        name: `${id} Route`,
        waypoints: [
          [10, 10],
          [90, 90],
        ],
        visibility: "player",
      },
    ],
    sound: [
      { id: `${id}-ride`, name: `${id} Ride`, regionId: `${id}-region`, bed: { src: "a.ogg" } },
      { id: `${id}-sound`, name: `${id} Sound`, points: rect(10, 10, 90, 90), visibility: "player", bed: { src: "b.ogg" } },
    ],
    ...extra,
  });
}

function everyItemOn(r: CampaignResolution, mapId: string): boolean[] {
  return [
    ...r.pins.filter((p) => p.map === mapId),
    ...r.regions.filter((p) => p.map === mapId),
    ...r.routes.filter((p) => p.map === mapId),
    ...r.sound.filter((p) => p.map === mapId),
  ].map((v) => v.ships);
}

// ---------------------------------------------------------------------------
// Rule 1: visibility values
// ---------------------------------------------------------------------------

describe("rule 1: a visibility value, per campaign", () => {
  const rows: { label: string; value: unknown; a: boolean; b: boolean }[] = [
    { label: "bare player", value: "player", a: true, b: true },
    { label: "{ a: player }", value: { a: "player" }, a: true, b: false },
    { label: "missing", value: undefined, a: false, b: false },
    { label: "invalid 'secret'", value: "secret", a: false, b: false },
    { label: "invalid 'Player'", value: "Player", a: false, b: false },
    { label: "invalid true", value: true, a: false, b: false },
    { label: "invalid empty", value: "", a: false, b: false },
    { label: "unnamed campaign { c: player }", value: { c: "player" }, a: false, b: false },
    { label: "per-campaign invalid { a: Player }", value: { a: "Player" }, a: false, b: false },
    { label: "rumor", value: "rumor", a: true, b: true },
    { label: "hidden", value: "hidden", a: false, b: false },
    { label: "dm", value: "dm", a: false, b: false },
    { label: "an array", value: ["player"], a: false, b: false },
    { label: "null", value: null, a: false, b: false },
  ];

  it.each(rows)("visibilityFor: $label", ({ value, a, b }) => {
    expect(["player", "rumor"].includes(visibilityFor(value, "a"))).toBe(a);
    expect(["player", "rumor"].includes(visibilityFor(value, "b"))).toBe(b);
    if (!a) expect(visibilityFor(value, "a")).toMatch(/^(dm|hidden)$/);
  });

  it("a prototype key never reads as a campaign's value", () => {
    expect(visibilityFor({}, "constructor")).toBe("dm");
    expect(visibilityFor({}, "__proto__")).toBe("dm");
    expect(visibilityFor({}, "toString")).toBe("dm");
  });

  // Every kind of item applies the rule, in both campaigns.
  it.each(rows)("every item kind: $label", ({ value, a, b }) => {
    const v = value as VisibilityValue;
    const m = map("m", {
      visibility: "player",
      pins: [{ note: "n", x: 50, y: 50, visibility: v }],
      regions: [{ id: "r", name: "Reg", points: rect(10, 10, 90, 90), visibility: v }],
      routes: [
        {
          id: "rt",
          name: "Rt",
          waypoints: [
            [1, 1],
            [2, 2],
          ],
          visibility: v,
        },
      ],
      sound: [{ id: "s", points: rect(10, 10, 90, 90), visibility: v, bed: { src: "x.ogg" } }],
    });
    const sub = map("sub", { visibility: v });
    const mdl = model([world("w", [m, sub])], [campaign("a", { m: OPEN, sub: OPEN }), campaign("b", { m: OPEN, sub: OPEN })]);
    for (const [c, expected] of [
      ["a", a],
      ["b", b],
    ] as const) {
      const r = resolveCampaign(mdl, [note("n")], c);
      expect(pinShips(r, "m"), `pin in ${c}`).toBe(expected);
      expect(regionShips(r, "r"), `region in ${c}`).toBe(expected);
      expect(routeShips(r, "rt"), `route in ${c}`).toBe(expected);
      expect(soundShips(r, "s"), `sound in ${c}`).toBe(expected);
      expect(mapShips(r, "sub"), `map in ${c}`).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// Rule 2: a hidden or unknown map hides its subtree
// ---------------------------------------------------------------------------

describe("rule 2: a map that doesn't ship hides its whole subtree", () => {
  const tree = (rootVisibility: VisibilityValue) =>
    world("w", [
      furnished("root", { visibility: rootVisibility }),
      { ...furnished("continent"), parent: "root", frame: { x: 100, y: 100, width: 200, height: 200, rotation: 0 }, enterZoom: 1 },
      { ...furnished("city"), parent: "continent", frame: { x: 100, y: 100, width: 200, height: 200, rotation: 0 }, enterZoom: 1 },
    ]);
  const all = { root: OPEN, continent: OPEN, city: OPEN };

  function expectSubtree(r: CampaignResolution, ships: boolean) {
    for (const id of ["root", "continent", "city"]) {
      expect(mapShips(r, id), id).toBe(ships);
      expect(everyItemOn(r, id).every((s) => s === ships), `items on ${id}`).toBe(true);
    }
    expect(r.frames.map((f) => f.ships)).toEqual([ships, ships]);
  }

  it("root map dm in a: hidden in a, shipped in b", () => {
    const mdl = model([tree({ a: "dm", b: "player" })], [campaign("a", all), campaign("b", all)]);
    const a = resolveCampaign(mdl, [note("n")], "a");
    expectSubtree(a, false);
    expect(find(a.maps, (m) => m.id === "city").reason).toBe("parent-hidden");
    expectSubtree(resolveCampaign(mdl, [note("n")], "b"), true);
  });

  it("root map not listed in a's campaign file (unknown), visibility player: same subtree hidden", () => {
    const mdl = model(
      [tree("player")],
      [campaign("a", { continent: OPEN, city: OPEN }), campaign("b", all)],
    );
    const a = resolveCampaign(mdl, [note("n")], "a");
    expectSubtree(a, false);
    expect(find(a.maps, (m) => m.id === "root").reason).toBe("unknown-state");
    expectSubtree(resolveCampaign(mdl, [note("n")], "b"), true);
  });

  it("explicit state unknown, or an invalid state, hides the map", () => {
    const mdl = model(
      [world("w", [map("m1"), map("m2")])],
      [campaign("a", { m1: { state: "unknown" }, m2: { state: "Open" as never } })],
    );
    const r = resolveCampaign(mdl, [], "a");
    expect(mapShips(r, "m1")).toBe(false);
    expect(mapShips(r, "m2")).toBe(false);
  });

  it("a child map listed open stays hidden when its parent is hidden, and a child's own dm hides it", () => {
    const mdl = model(
      [world("w", [map("root"), child("kid", "root", { visibility: { a: "player", b: "dm" } })])],
      [campaign("a", { root: OPEN, kid: OPEN }), campaign("b", { root: OPEN, kid: OPEN })],
    );
    expect(mapShips(resolveCampaign(mdl, [], "a"), "kid")).toBe(true);
    expect(mapShips(resolveCampaign(mdl, [], "b"), "kid")).toBe(false);
  });

  it("must-not-ship holds the id and name of every hidden map, region, route and sound area", () => {
    const mdl = model([tree({ a: "dm", b: "player" })], [campaign("a", all), campaign("b", all)]);
    const a = resolveCampaign(mdl, [note("n")], "a");
    for (const id of ["root", "continent", "city"]) {
      expect(a.mustNotShip.ids).toEqual(
        expect.arrayContaining([id, `${id}-region`, `${id}-route`, `${id}-ride`, `${id}-sound`]),
      );
      expect(a.mustNotShip.names).toEqual(
        expect.arrayContaining([`Map ${id}`, `${id} Region`, `${id} Route`, `${id} Ride`, `${id} Sound`]),
      );
    }
    const b = resolveCampaign(mdl, [note("n")], "b");
    expect(b.mustNotShip.ids).toEqual([]);
    expect(b.mustNotShip.names).toEqual([]);
  });

  describe("a broken tree fails closed", () => {
    it("unknown parent", () => {
      const mdl = model([world("w", [child("kid", "nope")])], [campaign("a", { kid: OPEN })]);
      expect(find(resolveCampaign(mdl, [], "a").maps, (m) => m.id === "kid").reason).toBe("bad-parent");
    });
    it("parent in another world", () => {
      const mdl = model(
        [world("w", [map("root")]), world("v", [child("kid", "root")])],
        [campaign("a", { root: OPEN, kid: OPEN })],
      );
      const r = resolveCampaign(mdl, [], "a");
      expect(mapShips(r, "root")).toBe(true);
      expect(find(r.maps, (m) => m.id === "kid").reason).toBe("bad-parent");
    });
    it("a cycle", () => {
      const mdl = model(
        [world("w", [child("x", "y"), child("y", "x")])],
        [campaign("a", { x: OPEN, y: OPEN })],
      );
      const r = resolveCampaign(mdl, [], "a");
      expect(mapShips(r, "x")).toBe(false);
      expect(mapShips(r, "y")).toBe(false);
    });
    it("a duplicate map id, in one world or across worlds", () => {
      const mdl = model(
        [world("w", [map("dup"), map("solo")]), world("v", [map("dup")])],
        [campaign("a", { dup: OPEN, solo: OPEN })],
      );
      const r = resolveCampaign(mdl, [], "a");
      expect(r.maps.filter((m) => m.id === "dup").map((m) => m.reason)).toEqual(["duplicate-id", "duplicate-id"]);
      expect(mapShips(r, "solo")).toBe(true);
      expect(worldShips(r, "v")).toBe(false);
    });
    it("a duplicate world id hides both", () => {
      const mdl = model([world("w", [map("m1")]), world("w", [map("m2")])], [campaign("a", { m1: OPEN, m2: OPEN })]);
      const r = resolveCampaign(mdl, [note("n")], "a");
      expect(r.worlds.every((w) => !w.ships)).toBe(true);
      expect(mapShips(r, "m1")).toBe(false);
      expect(noteShips(r, "n")).toBe(false);
    });
    it("a child with no frame, or a non-finite or zero-size one", () => {
      const noFrame = map("k1", { parent: "root", enterZoom: 1 });
      const nanFrame = child("k2", "root", { frame: { x: NaN, y: 0, width: 10, height: 10, rotation: 0 } });
      const flat = child("k3", "root", { frame: { x: 0, y: 0, width: 0, height: 10, rotation: 0 } });
      const mdl = model(
        [world("w", [map("root"), noFrame, nanFrame, flat])],
        [campaign("a", { root: OPEN, k1: OPEN, k2: OPEN, k3: OPEN })],
      );
      const r = resolveCampaign(mdl, [], "a");
      for (const id of ["k1", "k2", "k3"]) expect(find(r.maps, (m) => m.id === id).reason).toBe("no-frame");
    });
  });
});

// ---------------------------------------------------------------------------
// Rule 3: fog on items
// ---------------------------------------------------------------------------

describe("rule 3: fog drops items with any part under it", () => {
  const fogMap = map("f", {
    pins: [
      { note: "n", x: 700, y: 500, visibility: "player" }, // under fog
      { note: "n", x: 100, y: 500, visibility: "player" }, // lit
    ],
    regions: [
      { id: "foggy-region", name: "Foggy", points: [[100, 100], [700, 100], [100, 300]], visibility: "player" },
      { id: "lit-region", name: "Lit", points: rect(100, 400, 300, 600), visibility: "player" },
    ],
    routes: [
      { id: "foggy-route", name: "FR", waypoints: [[100, 100], [200, 200], [800, 200]], visibility: "player" },
      { id: "lit-route", name: "LR", waypoints: [[100, 100], [200, 200]], visibility: "player" },
      { id: "pin-route", name: "PR", waypoints: [[100, 100], { entityId: "n" }], visibility: "player" },
    ],
    sound: [
      { id: "foggy-sound", points: [[100, 100], [900, 900], [100, 900]], visibility: "player", bed: { src: "a.ogg" } },
      { id: "lit-sound", points: rect(10, 10, 90, 90), visibility: "player", bed: { src: "a.ogg" } },
      { id: "ride-foggy", regionId: "foggy-region", bed: { src: "a.ogg" } },
      { id: "ride-lit", regionId: "lit-region", bed: { src: "a.ogg" } },
      { id: "ride-missing", regionId: "no-such-region", bed: { src: "a.ogg" } },
    ],
  });
  const mdl = model([world("w", [fogMap])], [campaign("a", { f: LEFT_HALF }), campaign("b", { f: OPEN })]);

  it("in the fogged campaign a: fogged pin, region, route, sound-only area and ride-on area are dropped", () => {
    const r = resolveCampaign(mdl, [note("n")], "a");
    expect(pinShips(r, "f", 0)).toBe(false);
    expect(find(r.pins, (p) => p.index === 0).reason).toBe("fogged");
    expect(pinShips(r, "f", 1)).toBe(true);
    expect(regionShips(r, "foggy-region")).toBe(false);
    expect(regionShips(r, "lit-region")).toBe(true);
    expect(routeShips(r, "foggy-route")).toBe(false);
    expect(routeShips(r, "lit-route")).toBe(true);
    // The route's entity waypoint resolves to the first pin of "n", which is fogged.
    expect(find(r.routes, (x) => x.id === "pin-route").reason).toBe("waypoint-hidden");
    expect(soundShips(r, "foggy-sound")).toBe(false);
    expect(soundShips(r, "lit-sound")).toBe(true);
    expect(soundShips(r, "ride-foggy")).toBe(false);
    expect(soundShips(r, "ride-lit")).toBe(true);
    expect(soundShips(r, "ride-missing")).toBe(false);
  });

  it("in the open campaign b: all ship except the ride-on area with no region", () => {
    const r = resolveCampaign(mdl, [note("n")], "b");
    expect(r.pins.every((p) => p.ships)).toBe(true);
    expect(r.regions.every((p) => p.ships)).toBe(true);
    expect(r.routes.every((p) => p.ships)).toBe(true);
    expect(r.sound.filter((s) => s.id !== "ride-missing").every((p) => p.ships)).toBe(true);
    expect(soundShips(r, "ride-missing")).toBe(false);
  });

  it("conceals fog points inside a reveal", () => {
    const m = map("c", { pins: [{ note: "n", x: 250, y: 250, visibility: "player" }] });
    const mdl2 = model(
      [world("w", [m])],
      [campaign("a", { c: { ...LEFT_HALF, conceals: [rect(200, 200, 300, 300)] } })],
    );
    expect(pinShips(resolveCampaign(mdl2, [note("n")], "a"), "c")).toBe(false);
  });

  it("a fogged map with no reveals fogs everything", () => {
    const mdl2 = model([world("w", [furnished("m")])], [campaign("a", { m: { state: "fogged" } })]);
    const r = resolveCampaign(mdl2, [note("n")], "a");
    expect(mapShips(r, "m")).toBe(true);
    expect(everyItemOn(r, "m").every((s) => !s)).toBe(true);
  });

  it("a fog polygon with a non-finite point fogs the whole map", () => {
    const bad: CampaignMapV2 = { state: "fogged", reveals: [rect(0, 0, SIZE, SIZE)], conceals: [[[NaN, 0], [10, 10], [0, 10]]] };
    const mdl2 = model([world("w", [furnished("m")])], [campaign("a", { m: bad })]);
    expect(everyItemOn(resolveCampaign(mdl2, [note("n")], "a"), "m").every((s) => !s)).toBe(true);
  });

  it("items with no geometry on a fogged map don't ship", () => {
    const m = map("m", {
      regions: [{ id: "empty", name: "E", points: [], visibility: "player" }],
      sound: [{ id: "nothing", visibility: "player", bed: { src: "a.ogg" } }],
      routes: [{ id: "short", name: "S", waypoints: [[1, 1]], visibility: "player" }],
    });
    const mdl2 = model([world("w", [m])], [campaign("a", { m: LEFT_HALF }), campaign("b", { m: OPEN })]);
    const a = resolveCampaign(mdl2, [], "a");
    expect(regionShips(a, "empty")).toBe(false);
    expect(soundShips(a, "nothing")).toBe(false);
    expect(routeShips(a, "short")).toBe(false);
    const b = resolveCampaign(mdl2, [], "b");
    expect(soundShips(b, "nothing")).toBe(false);
    expect(routeShips(b, "short")).toBe(false);
  });

  it("a sound-only area with lit corners and fog between them doesn't ship (whole area tested)", () => {
    // Lit strips x 0-300 and 700-1000, fog between; the area spans 100-900.
    const strips: CampaignMapV2 = { state: "fogged", reveals: [rect(0, 0, 300, SIZE), rect(700, 0, SIZE, SIZE)] };
    const m = map("m", {
      sound: [
        { id: "spanning", points: rect(100, 100, 900, 900), visibility: "player", bed: { src: "a.ogg" } },
        { id: "in-strip", points: rect(100, 100, 200, 900), visibility: "player", bed: { src: "a.ogg" } },
      ],
    });
    const r = resolveCampaign(model([world("w", [m])], [campaign("a", { m: strips })]), [], "a");
    expect(find(r.sound, (x) => x.id === "spanning").reason).toBe("fogged");
    expect(soundShips(r, "in-strip")).toBe(true);
  });

  it("a region with lit corners and fog between them doesn't ship (whole area tested)", () => {
    // Lit strips x 0-300 and 700-1000, fog between; the region spans 100-900.
    const strips: CampaignMapV2 = { state: "fogged", reveals: [rect(0, 0, 300, SIZE), rect(700, 0, SIZE, SIZE)] };
    const m = map("m", {
      regions: [
        { id: "spanning", name: "Spanning", points: rect(100, 100, 900, 900), visibility: "player" },
        { id: "in-strip", name: "In strip", points: rect(100, 100, 200, 900), visibility: "player" },
      ],
    });
    const r = resolveCampaign(model([world("w", [m])], [campaign("a", { m: strips })]), [], "a");
    expect(find(r.regions, (x) => x.id === "spanning").reason).toBe("fogged");
    expect(regionShips(r, "in-strip")).toBe(true);
  });

  it("a route whose lit waypoints have a fog gap between them doesn't ship (every segment tested)", () => {
    // Lit strips x 0-300 and 700-1000, fog between; the route runs 100 -> 900.
    const strips: CampaignMapV2 = { state: "fogged", reveals: [rect(0, 0, 300, SIZE), rect(700, 0, SIZE, SIZE)] };
    const m = map("m", {
      routes: [
        { id: "gap", name: "Gap", waypoints: [[100, 500], [900, 500]], visibility: "player" },
        { id: "in-strip", name: "In strip", waypoints: [[100, 100], [200, 900]], visibility: "player" },
      ],
    });
    const r = resolveCampaign(model([world("w", [m])], [campaign("a", { m: strips })]), [], "a");
    expect(find(r.routes, (x) => x.id === "gap").reason).toBe("fogged");
    expect(routeShips(r, "in-strip")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 4: a frame under fog hides the child
// ---------------------------------------------------------------------------

describe("rule 4: a frame with any part under its parent's fog hides the child and its subtree", () => {
  // Reveal: everything except a horizontal band y 450..550 across the whole map.
  const bandFog: CampaignMapV2 = {
    state: "fogged",
    reveals: [rect(0, 0, SIZE, 450), rect(0, 550, SIZE, SIZE)],
  };
  // Reveal: everything, with a small conceal wholly inside the frame (no edge crosses the frame's).
  const holeFog: CampaignMapV2 = {
    state: "fogged",
    reveals: [rect(0, 0, SIZE, SIZE)],
    conceals: [rect(180, 480, 220, 520)],
  };
  // Reveal: the left half only; the frame's right-bottom corner pokes over x=500.
  const cornerFog = LEFT_HALF;
  const frame = { x: 100, y: 300, width: 200, height: 400, rotation: 0 }; // 100..300 x 300..700
  const cornerFrame = { x: 350, y: 300, width: 200, height: 200, rotation: 0 }; // 350..550: corner x=550 fogged

  const subtree = (f: typeof frame) =>
    world("w", [
      map("land"),
      { ...furnished("city"), parent: "land", frame: f, enterZoom: 2 },
      { ...furnished("dungeon"), parent: "city", frame: { x: 10, y: 10, width: 50, height: 50, rotation: 0 }, enterZoom: 2 },
    ]);
  const states = (land: CampaignMapV2) => ({ land, city: OPEN, dungeon: OPEN });

  it.each([
    { label: "fog crosses the middle, no corner fogged", fog: bandFog, f: frame },
    { label: "a fog hole wholly inside the frame", fog: holeFog, f: frame },
    { label: "a corner under fog", fog: cornerFog, f: cornerFrame },
  ])("$label: hidden in a (parent fogged), shipped in b (parent open)", ({ fog, f }) => {
    const mdl = model([subtree(f)], [campaign("a", states(fog)), campaign("b", states(OPEN))]);
    const a = resolveCampaign(mdl, [note("n")], "a");
    expect(mapShips(a, "land")).toBe(true);
    expect(find(a.maps, (m) => m.id === "city").reason).toBe("frame-fogged");
    expect(mapShips(a, "dungeon")).toBe(false);
    expect(a.frames.every((x) => !x.ships)).toBe(true);
    expect(everyItemOn(a, "city").every((s) => !s)).toBe(true);
    expect(everyItemOn(a, "dungeon").every((s) => !s)).toBe(true);
    expect(a.mustNotShip.ids).toEqual(expect.arrayContaining(["city", "dungeon", "city-region", "dungeon-route"]));

    const b = resolveCampaign(mdl, [note("n")], "b");
    expect(mapShips(b, "city")).toBe(true);
    expect(mapShips(b, "dungeon")).toBe(true);
    expect(b.frames.every((x) => x.ships)).toBe(true);
  });

  it("a frame wholly in the lit part ships", () => {
    const mdl = model([subtree({ x: 100, y: 100, width: 200, height: 200, rotation: 0 })], [campaign("a", states(cornerFog))]);
    const a = resolveCampaign(mdl, [note("n")], "a");
    expect(mapShips(a, "city")).toBe(true);
    expect(mapShips(a, "dungeon")).toBe(true);
  });

  it("a rotated frame whose turned corner reaches the fog is hidden", () => {
    // 360..480 x 100..220 is lit unrotated; turned 45 degrees about its centre a corner reaches x≈505.
    const f = { x: 360, y: 100, width: 120, height: 120, rotation: 45 };
    const unrotated = model([subtree({ ...f, rotation: 0 })], [campaign("a", states(cornerFog))]);
    expect(mapShips(resolveCampaign(unrotated, [note("n")], "a"), "city")).toBe(true);
    const rotated = model([subtree(f)], [campaign("a", states(cornerFog))]);
    expect(find(resolveCampaign(rotated, [note("n")], "a").maps, (m) => m.id === "city").reason).toBe(
      "frame-fogged",
    );
  });

  it("a rotated frame is also tested turned about its top-left corner (pivot not fixed yet)", () => {
    // 420..499 x 100..120 turned 180 degrees: about its centre it covers the same lit rectangle;
    // about its top-left corner (420, 100) it lands on 341..420 x 80..100, which this fog conceals.
    const fog: CampaignMapV2 = { ...LEFT_HALF, conceals: [rect(340, 80, 420, 100)] };
    const f = { x: 420, y: 100, width: 79, height: 20, rotation: 180 };
    const mdl = model([subtree(f)], [campaign("a", states(fog))]);
    expect(find(resolveCampaign(mdl, [note("n")], "a").maps, (m) => m.id === "city").reason).toBe(
      "frame-fogged",
    );
  });
});

describe("areaUnderFog tests the whole area and the outline", () => {
  const fog = (reveals: Point[][], conceals: Point[][] = []): FogOverlay => ({
    mapId: "m",
    enabled: true,
    reveals,
    conceals,
  });

  it("a zero-area polygon drawn across a fog gap counts (its outline is tested)", () => {
    const strips = fog([rect(0, 0, 300, SIZE), rect(700, 0, SIZE, SIZE)]);
    const sliver: Point[] = [
      [10, 10],
      [990, 10],
      [200, 10],
    ];
    expect(areaUnderFog(sliver, strips)).toBe(true);
    expect(areaUnderFog(rect(10, 10, 200, 200), strips)).toBe(false);
  });

  it("a fog island (a conceal) inside a lit area counts", () => {
    const island = fog([rect(0, 0, SIZE, SIZE)], [rect(200, 200, 210, 210)]);
    expect(areaUnderFog(rect(100, 100, 400, 400), island)).toBe(true);
    expect(areaUnderFog(rect(300, 300, 400, 400), island)).toBe(false);
  });
});

describe("frameUnderFog is exact over the area", () => {
  const fog = (reveals: Point[][], conceals: Point[][] = []): FogOverlay => ({
    mapId: "m",
    enabled: true,
    reveals,
    conceals,
  });
  const quad = rect(100, 100, 300, 300);

  it("overlapping reveals that cover the frame between them: not fogged", () => {
    // Their edges cross inside the frame; every face is still lit.
    expect(frameUnderFog(quad, fog([rect(0, 0, 220, 400), rect(180, 0, 400, 400)]))).toBe(false);
  });
  it("a thin gap between two reveals inside the frame: fogged", () => {
    expect(frameUnderFog(quad, fog([rect(0, 0, 199.5, 400), rect(200.5, 0, 400, 400)]))).toBe(true);
  });
  it("a diagonal conceal sliver crossing the frame: fogged", () => {
    const sliver: Point[] = [
      [0, 0],
      [400, 399],
      [400, 400],
      [0, 1],
    ];
    expect(frameUnderFog(quad, fog([rect(0, 0, 400, 400)], [sliver]))).toBe(true);
  });
  it("no fog (open map): not fogged", () => {
    expect(frameUnderFog(quad, null)).toBe(false);
  });
  it("a disabled fog: not fogged", () => {
    expect(frameUnderFog(quad, { mapId: "m", enabled: false, reveals: [] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 5: worlds
// ---------------------------------------------------------------------------

describe("rule 5: a world ships only if one of its maps ships, and its notes go with it", () => {
  const mdl = model(
    [
      world("home", [map("hm")]),
      world("far", [map("f1", { visibility: { a: "dm", b: "player" } }), map("f2")]),
    ],
    [
      campaign("a", { hm: OPEN, f1: OPEN }), // f2 unknown in a
      campaign("b", { hm: OPEN, f1: OPEN, f2: OPEN }),
    ],
  );
  const notes = [
    note("far-note", { world: "far", title: "Far Note", aliases: ["The Far One"] }),
    note("home-note", { world: "home" }),
  ];

  it("in a: the world and its player note don't ship; their names are guarded", () => {
    const r = resolveCampaign(mdl, notes, "a");
    expect(worldShips(r, "far")).toBe(false);
    expect(find(r.worlds, (w) => w.id === "far").reason).toBe("no-map-ships");
    expect(noteShips(r, "far-note")).toBe(false);
    expect(find(r.notes, (n) => n.id === "far-note").reason).toBe("world-hidden");
    expect(r.mustNotShip.ids).toEqual(expect.arrayContaining(["far", "far-note"]));
    expect(r.mustNotShip.names).toEqual(expect.arrayContaining(["World far", "Far Note", "The Far One"]));
    expect(worldShips(r, "home")).toBe(true);
    expect(noteShips(r, "home-note")).toBe(true);
  });

  it("in b: both ship", () => {
    const r = resolveCampaign(mdl, notes, "b");
    expect(worldShips(r, "far")).toBe(true);
    expect(noteShips(r, "far-note")).toBe(true);
    expect(r.mustNotShip.ids).not.toContain("far");
  });

  it("a world with no maps ships none of its notes; a note of an unknown world doesn't ship", () => {
    const m2 = model([world("empty", []), world("home", [map("hm")])], [campaign("a", { hm: OPEN })]);
    const r = resolveCampaign(m2, [note("x", { world: "empty" }), note("y", { world: "nowhere" })], "a");
    expect(worldShips(r, "empty")).toBe(false);
    expect(noteShips(r, "x")).toBe(false);
    expect(noteShips(r, "y")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 6: notes
// ---------------------------------------------------------------------------

describe("rule 6: a notes: entry can only narrow the frontmatter", () => {
  const base = (entries: Record<string, NoteOverride>, aMode: CampaignFileV2["notes"] = "vault", bMode = aMode) =>
    model([world("w", [map("m")], entries)], [campaign("a", { m: OPEN }, aMode), campaign("b", { m: OPEN }, bMode)]);
  const both = (mdl: CampaignResolverModel, n: WorldNote) =>
    [resolveCampaign(mdl, [n], "a"), resolveCampaign(mdl, [n], "b")].map((r) => noteShips(r, n.note.id));

  it("frontmatter dm + entry { a: player }: hidden everywhere, with a warning", () => {
    const mdl = base({ n: { visibility: { a: "player" }, basedOn: "dm" } });
    const n = note("n", { visibility: "dm" });
    expect(both(mdl, n)).toEqual([false, false]);
    const a = resolveCampaign(mdl, [n], "a");
    expect(find(a.notes, () => true).reason).toBe("secret");
    expect(a.warnings.join("\n")).toMatch(/can only narrow/);
  });

  it("frontmatter player + { a: player, b: dm }: ships in a only", () => {
    const mdl = base({ n: { visibility: { a: "player", b: "dm" }, basedOn: "player" } });
    expect(both(mdl, note("n"))).toEqual([true, false]);
  });

  it.each([
    { label: "basedOn differs", entry: { visibility: { a: "player", b: "player" }, basedOn: "rumor" } },
    { label: "basedOn missing", entry: { visibility: { a: "player", b: "player" } } },
  ])("$label: dm everywhere, reported stale", ({ entry }) => {
    const mdl = base({ n: entry as NoteOverride });
    expect(both(mdl, note("n"))).toEqual([false, false]);
    const r = resolveCampaign(mdl, [note("n")], "a");
    expect(find(r.notes, () => true).reason).toBe("stale-entry");
    expect(r.staleEntries).toEqual([{ world: "w", note: "n" }]);
  });

  it("atlas.publish: false is secret, whatever the visibility and entry", () => {
    const mdl = base({ n: { visibility: { a: "player", b: "player" }, basedOn: "player" } });
    const n = note("n", { atlas: { publish: false, visibility: "player" } });
    expect(both(mdl, n)).toEqual([false, false]);
  });

  it("frontmatter hidden or rumor", () => {
    const mdl = base({});
    expect(both(mdl, note("n", { visibility: "hidden" }))).toEqual([false, false]);
    expect(both(mdl, note("n", { visibility: "rumor" }))).toEqual([true, true]);
  });

  describe("the campaign note default (question 5)", () => {
    const player = note("n");
    it("frontmatter player, no entry: ships under vault only", () => {
      expect(both(base({}, "vault", "hidden"), player)).toEqual([true, false]);
      expect(both(base({}, "hidden", "vault"), player)).toEqual([false, true]);
    });
    it("a missing or invalid campaign notes: field reads as hidden", () => {
      // (Not through `base`: its default parameter would turn `undefined` into "vault".)
      const { notes: _dropped, ...noNotes } = campaign("a", { m: OPEN });
      const mdl = model([world("w", [map("m")])], [noNotes as CampaignFileV2, campaign("b", { m: OPEN }, "Vault" as never)]);
      expect(both(mdl, player)).toEqual([false, false]);
    });
    it("a bare entry doesn't name a campaign: ships under vault, not under hidden", () => {
      const mdl = base({ n: { visibility: "player", basedOn: "player" } }, "vault", "hidden");
      expect(both(mdl, player)).toEqual([true, false]);
    });
    it("a bare dm entry narrows under vault", () => {
      const mdl = base({ n: { visibility: "dm", basedOn: "player" } }, "vault", "vault");
      expect(both(mdl, player)).toEqual([false, false]);
    });
    it("an entry naming the campaign as player or rumor ships under hidden; naming it dm doesn't", () => {
      const mdl = base({ n: { visibility: { a: "rumor", b: "dm" }, basedOn: "player" } }, "hidden", "hidden");
      expect(both(mdl, player)).toEqual([true, false]);
    });
    it("under vault, an entry that doesn't name the campaign is dm for it", () => {
      const mdl = base({ n: { visibility: { a: "player" }, basedOn: "player" } }, "vault", "vault");
      expect(both(mdl, player)).toEqual([true, false]);
    });
    it("an entry in another world's file doesn't apply", () => {
      const mdl = model(
        [world("w", [map("m")]), world("v", [map("m2")], { n: { visibility: { a: "player" }, basedOn: "player" } })],
        [campaign("a", { m: OPEN, m2: OPEN }, "hidden")],
      );
      expect(noteShips(resolveCampaign(mdl, [player], "a"), "n")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Rule 7: pins
// ---------------------------------------------------------------------------

describe("rule 7: a pin ships only if its note and map ship and it is not under fog", () => {
  const m = map("m", {
    visibility: { a: "player", b: "player" },
    pins: [
      { note: "dm-note", x: 10, y: 10, visibility: "player" },
      { note: "missing-note", x: 10, y: 10, visibility: "player" },
      { note: "n", x: 900, y: 10, visibility: "player" },
      { note: "n", x: 10, y: 10 }, // no visibility of its own
      { note: "n", x: 10, y: 10, visibility: "player" },
    ],
  });
  const hiddenMap = map("h", { visibility: { a: "dm", b: "player" }, pins: [{ note: "n", x: 1, y: 1, visibility: "player" }] });
  const mdl = model(
    [world("w", [m, hiddenMap])],
    [campaign("a", { m: LEFT_HALF, h: OPEN }), campaign("b", { m: OPEN, h: OPEN })],
  );
  const notes = [note("dm-note", { visibility: "dm" }), note("n")];

  it("in a (fogged)", () => {
    const r = resolveCampaign(mdl, notes, "a");
    expect(r.pins.filter((p) => p.map === "m").map((p) => p.reason)).toEqual([
      "note-hidden",
      "note-hidden",
      "fogged",
      "visibility",
      "ships",
    ]);
    expect(find(r.pins, (p) => p.map === "h").reason).toBe("map-hidden");
  });

  it("in b (open)", () => {
    const r = resolveCampaign(mdl, notes, "b");
    expect(r.pins.filter((p) => p.map === "m").map((p) => p.ships)).toEqual([false, false, true, false, true]);
    expect(pinShips(r, "h")).toBe(true);
  });

  it("a note id shared by two notes ships only if both do", () => {
    const r = resolveCampaign(mdl, [note("n"), note("n", { visibility: "dm" })], "b");
    expect(r.pins.filter((p) => p.map === "m").every((p) => !p.ships)).toBe(true);
  });
});

describe("links: a shipped item never points at a note that doesn't ship", () => {
  it("a region linking a hidden or missing note doesn't ship", () => {
    const m = map("m", {
      regions: [
        { id: "r1", name: "R1", entityId: "secret-note", points: rect(1, 1, 9, 9), visibility: "player" },
        { id: "r2", name: "R2", entityId: "ghost", points: rect(1, 1, 9, 9), visibility: "player" },
        { id: "r3", name: "R3", entityId: "n", points: rect(20, 20, 29, 29), visibility: "player" },
      ],
    });
    const mdl = model([world("w", [m])], [campaign("a", { m: OPEN })]);
    const r = resolveCampaign(mdl, [note("secret-note", { visibility: "dm" }), note("n")], "a");
    expect(find(r.regions, (x) => x.id === "r1").reason).toBe("link-hidden");
    expect(find(r.regions, (x) => x.id === "r2").reason).toBe("link-hidden");
    expect(regionShips(r, "r3")).toBe(true);
  });

  it("a route through a note with no pin on the map, or a hidden pin, doesn't ship", () => {
    const m = map("m", {
      pins: [{ note: "secret-note", x: 5, y: 5, visibility: "player" }],
      routes: [
        { id: "via-ghost", name: "G", waypoints: [[1, 1], { entityId: "ghost" }], visibility: "player" },
        { id: "via-secret", name: "S", waypoints: [[1, 1], { entityId: "secret-note" }], visibility: "player" },
      ],
    });
    const mdl = model([world("w", [m])], [campaign("a", { m: OPEN })]);
    const r = resolveCampaign(mdl, [note("secret-note", { visibility: "dm" })], "a");
    expect(routeShips(r, "via-ghost")).toBe(false);
    expect(routeShips(r, "via-secret")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 8: name collisions
// ---------------------------------------------------------------------------

describe("rule 8: name collisions and must-not-ship", () => {
  const twoCampaigns = (m: MapV2, aState: CampaignMapV2 = OPEN) =>
    model([world("w", [m])], [campaign("a", { m: aState }), campaign("b", { m: OPEN })]);

  it.each([
    { label: "title", n: note("black-spire-note", { title: "Black Spire" }) },
    { label: "alias", n: note("spire", { title: "The Spire", aliases: ["Black Spire"] }) },
    { label: "title, case and spacing differ", n: note("bs", { title: "  black   SPIRE " }) },
  ])("a hidden region named like a shipped note's $label is a collision naming both", ({ n }) => {
    const m = map("m", {
      regions: [{ id: "spire-region", name: "Black Spire", points: rect(1, 1, 9, 9), visibility: { a: "dm", b: "player" } }],
    });
    const a = resolveCampaign(twoCampaigns(m), [n], "a");
    expect(a.collisions).toEqual([
      { name: "Black Spire", hidden: { kind: "region", id: "spire-region" }, shipped: { kind: "note", id: n.note.id } },
    ]);
    expect(a.mustNotShip.names).toContain("Black Spire");
    // In b the region ships: no collision.
    expect(resolveCampaign(twoCampaigns(m), [n], "b").collisions).toEqual([]);
  });

  it("a hidden note titled like a shipped note collides; so does a hidden map named like one", () => {
    const m = map("m", { name: "Old Harbour" });
    const hiddenMap = map("h", { name: "Port Vell", visibility: "dm" });
    const mdl = model([world("w", [m, hiddenMap])], [campaign("a", { m: OPEN, h: OPEN })]);
    const r = resolveCampaign(
      mdl,
      [note("x", { title: "Old Harbour", visibility: "dm" }), note("port", { title: "Port Vell" })],
      "a",
    );
    expect(r.collisions).toEqual(
      expect.arrayContaining([
        { name: "Old Harbour", hidden: { kind: "note", id: "x" }, shipped: { kind: "map", id: "m" } },
        { name: "Port Vell", hidden: { kind: "map", id: "h" }, shipped: { kind: "note", id: "port" } },
      ]),
    );
  });

  const saltMarsh = note("salt-marsh", { title: "Salt Marsh", aliases: ["The Marsh"] });

  it.each([
    { label: "dm", vis: { a: "dm", b: "player" } as VisibilityValue, state: OPEN },
    { label: "fogged", vis: "player" as VisibilityValue, state: LEFT_HALF },
  ])("a $label region salt-marsh linking the shipped salt-marsh note: no collision, its names stay out", ({ vis, state }) => {
    const m = map("m", {
      regions: [
        {
          id: "salt-marsh",
          name: "Salt Marsh",
          entityId: "salt-marsh",
          points: rect(600, 600, 700, 700),
          visibility: vis,
        },
        { id: "marsh-edge", name: "The Marsh", entityId: "salt-marsh", points: rect(600, 600, 700, 700), visibility: vis },
      ],
    });
    const a = resolveCampaign(twoCampaigns(m, state), [saltMarsh], "a");
    expect(regionShips(a, "salt-marsh")).toBe(false);
    expect(noteShips(a, "salt-marsh")).toBe(true);
    expect(a.collisions).toEqual([]);
    expect(a.mustNotShip.ids).not.toContain("salt-marsh");
    expect(a.mustNotShip.names).not.toContain("Salt Marsh");
    expect(a.mustNotShip.names).not.toContain("The Marsh");
    // The other region's own id differs from the note's names: it stays guarded.
    expect(a.mustNotShip.ids).toContain("marsh-edge");
    expect(resolveCampaign(twoCampaigns(m, state), [saltMarsh], "b").mustNotShip.ids).toEqual([]);
  });

  it("a dm region Drow Ambush linking salt-marsh: no collision; its own id and name stay guarded", () => {
    const m = map("m", {
      regions: [
        {
          id: "drow-ambush",
          name: "Drow Ambush",
          entityId: "salt-marsh",
          points: rect(1, 1, 9, 9),
          visibility: { a: "dm", b: "player" },
        },
      ],
    });
    const a = resolveCampaign(twoCampaigns(m), [saltMarsh], "a");
    expect(a.collisions).toEqual([]);
    expect(a.mustNotShip.ids).toContain("drow-ambush");
    expect(a.mustNotShip.names).toContain("Drow Ambush");
    expect(a.mustNotShip.ids).not.toContain("salt-marsh");
    expect(a.mustNotShip.names).not.toContain("Salt Marsh");
    const b = resolveCampaign(twoCampaigns(m), [saltMarsh], "b");
    expect(b.mustNotShip.ids).not.toContain("drow-ambush");
  });

  it("the exemption follows the link: an unlinked hidden region named like the note collides", () => {
    const m = map("m", {
      regions: [{ id: "decoy", name: "Salt Marsh", points: rect(1, 1, 9, 9), visibility: "dm" }],
    });
    const a = resolveCampaign(twoCampaigns(m), [saltMarsh], "a");
    expect(a.collisions).toEqual([
      { name: "Salt Marsh", hidden: { kind: "region", id: "decoy" }, shipped: { kind: "note", id: "salt-marsh" } },
    ]);
  });

  it("a pin of the shipped salt-marsh note dropped by fog: its location is guarded, not the note's name", () => {
    const m = map("m", { pins: [{ note: "salt-marsh", x: 800, y: 300, visibility: "player" }] });
    const a = resolveCampaign(twoCampaigns(m, LEFT_HALF), [saltMarsh], "a");
    expect(pinShips(a, "m")).toBe(false);
    expect(noteShips(a, "salt-marsh")).toBe(true);
    expect(a.collisions).toEqual([]);
    expect(a.mustNotShip.pinLocations).toEqual([{ map: "m", index: 0, x: 800, y: 300 }]);
    expect(a.mustNotShip.names).toEqual([]);
    expect(a.mustNotShip.ids).toEqual([]);
    const b = resolveCampaign(twoCampaigns(m, LEFT_HALF), [saltMarsh], "b");
    expect(b.mustNotShip.pinLocations).toEqual([]);
  });

  it("a hidden note puts its id, title and aliases in must-not-ship", () => {
    const mdl = model([world("w", [map("m")])], [campaign("a", { m: OPEN })]);
    const r = resolveCampaign(mdl, [note("drow-city", { title: "Menzo", aliases: ["The Dark City"], visibility: "dm" })], "a");
    expect(r.mustNotShip.ids).toEqual(["drow-city"]);
    expect(r.mustNotShip.names).toEqual(["Menzo", "The Dark City"]);
  });
});

// ---------------------------------------------------------------------------
// The campaign itself
// ---------------------------------------------------------------------------

describe("the campaign id", () => {
  it("an unknown campaign throws", () => {
    const mdl = model([world("w", [map("m")])], [campaign("a", { m: OPEN })]);
    expect(() => resolveCampaign(mdl, [], "z")).toThrow(ResolveCampaignError);
  });
  it("two files for one campaign throw", () => {
    const mdl = model([world("w", [map("m")])], [campaign("a", { m: OPEN }), campaign("a", { m: OPEN })]);
    expect(() => resolveCampaign(mdl, [], "a")).toThrow(/2 campaign files/);
  });
  it("only the named campaign's states and fog apply", () => {
    const mdl = model([world("w", [furnished("m")])], [campaign("a", { m: OPEN }), campaign("b", { m: { state: "fogged" } })]);
    expect(everyItemOn(resolveCampaign(mdl, [note("n")], "a"), "m").every(Boolean)).toBe(true);
    expect(everyItemOn(resolveCampaign(mdl, [note("n")], "b"), "m").every((s) => !s)).toBe(true);
  });
  it("is pure: the same input gives the same output and isn't mutated", () => {
    const mdl = model([world("w", [furnished("m")])], [campaign("a", { m: LEFT_HALF })]);
    const before = JSON.stringify(mdl);
    const r1 = resolveCampaign(mdl, [note("n")], "a");
    const r2 = resolveCampaign(mdl, [note("n")], "a");
    expect(r1).toEqual(r2);
    expect(JSON.stringify(mdl)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Safety review fixes
// ---------------------------------------------------------------------------

describe("orphan notes: entries narrow, never vanish", () => {
  const narrow: NoteOverride = { visibility: { a: "dm", b: "player" }, basedOn: "player" };
  const twoVault = (worlds: WorldFileV2[]) =>
    model(worlds, [
      campaign("a", { m: OPEN, m2: OPEN }, "vault"),
      campaign("b", { m: OPEN, m2: OPEN }, "vault"),
    ]);

  it("an entry in the wrong world's file narrows the note in vault mode, in both campaigns", () => {
    const mdl = twoVault([world("w", [map("m")]), world("v", [map("m2")], { n: narrow })]);
    const a = resolveCampaign(mdl, [note("n")], "a");
    expect(find(a.notes, () => true)).toMatchObject({ ships: false, reason: "orphan-entry" });
    expect(a.orphanEntries).toEqual([{ world: "v", entry: "n" }]);
    expect(a.warnings.join("\n")).toMatch(/matches no note/);
    const b = resolveCampaign(mdl, [note("n")], "b");
    expect(noteShips(b, "n")).toBe(true);
    expect(b.orphanEntries).toEqual([{ world: "v", entry: "n" }]);
  });

  it("a key differing in case or spacing narrows the note in vault mode, in both campaigns", () => {
    const mdl = twoVault([world("w", [map("m")], { " N ": narrow })]);
    expect(noteShips(resolveCampaign(mdl, [note("n")], "a"), "n")).toBe(false);
    expect(noteShips(resolveCampaign(mdl, [note("n")], "b"), "n")).toBe(true);
    expect(resolveCampaign(mdl, [note("n")], "a").orphanEntries).toEqual([{ world: "w", entry: " N " }]);
  });

  it("an orphan that doesn't name the campaign, or is stale, narrows it too", () => {
    const mdl = twoVault([
      world("w", [map("m")], { N: { visibility: { a: "player" }, basedOn: "player" }, X: { visibility: "player" } }),
    ]);
    const notes = [note("n"), note("x")];
    expect(noteShips(resolveCampaign(mdl, notes, "a"), "n")).toBe(true);
    expect(noteShips(resolveCampaign(mdl, notes, "b"), "n")).toBe(false);
    expect(noteShips(resolveCampaign(mdl, notes, "a"), "x")).toBe(false);
    expect(noteShips(resolveCampaign(mdl, notes, "b"), "x")).toBe(false);
  });

  it("a key matching only by slug (underscores, punctuation) narrows the note, in both campaigns", () => {
    const mdl = twoVault([world("w", [map("m")], { salt_marsh: { visibility: { a: "dm" }, basedOn: "player" } })]);
    const a = resolveCampaign(mdl, [note("salt-marsh")], "a");
    expect(find(a.notes, () => true)).toMatchObject({ ships: false, reason: "orphan-entry" });
    expect(a.orphanEntries).toEqual([{ world: "w", entry: "salt_marsh" }]);
    const b = resolveCampaign(mdl, [note("salt-marsh")], "b");
    expect(find(b.notes, () => true)).toMatchObject({ ships: false, reason: "orphan-entry" });
    const shipsB = twoVault([world("w", [map("m")], { "Salt Marsh!": narrow })]);
    expect(noteShips(resolveCampaign(shipsB, [note("salt-marsh")], "a"), "salt-marsh")).toBe(false);
    expect(noteShips(resolveCampaign(shipsB, [note("salt-marsh")], "b"), "salt-marsh")).toBe(true);
  });

  it("a retitled note's entry is reported as an orphan", () => {
    const mdl = twoVault([world("w", [map("m")], { "old-name": narrow })]);
    const r = resolveCampaign(mdl, [note("new-name")], "a");
    expect(r.orphanEntries).toEqual([{ world: "w", entry: "old-name" }]);
    expect(noteShips(r, "new-name")).toBe(true);
  });

  it("an entry matching its note exactly is not an orphan", () => {
    const mdl = twoVault([world("w", [map("m")], { n: narrow })]);
    const a = resolveCampaign(mdl, [note("n")], "a");
    expect(a.orphanEntries).toEqual([]);
    expect(find(a.notes, () => true).reason).toBe("entry");
  });
});

describe("duplicate note ids", () => {
  it("every copy is hidden as duplicate-id, so no shipped note shares a guarded id or title", () => {
    const mdl = model(
      [world("w", [map("m")]), world("v", [map("m2")])],
      [campaign("a", { m: OPEN, m2: OPEN }), campaign("b", { m: OPEN, m2: OPEN })],
    );
    const notes = [note("n", { title: "Shared" }), note("n", { world: "v", title: "Secret", visibility: "dm" })];
    for (const c of ["a", "b"]) {
      const r = resolveCampaign(mdl, notes, c);
      expect(r.notes.map((n) => [n.ships, n.reason])).toEqual([
        [false, "duplicate-id"],
        [false, "duplicate-id"],
      ]);
      expect(r.mustNotShip.ids).toContain("n");
      expect(r.mustNotShip.names).toEqual(expect.arrayContaining(["Shared", "Secret"]));
      expect(r.collisions).toEqual([]);
    }
  });
});

describe("a hidden map's layers", () => {
  const layer = (id: string, src: string) => ({ id, src, x: 0, y: 0, width: SIZE, height: SIZE });
  it("its layer ids and image paths are in must-not-ship; a shared image is a collision", () => {
    const hidden = map("drow-city", {
      visibility: { a: "dm", b: "player" },
      layers: [layer("drow-city-base", "maps/menzoberranzan.webp"), layer("shared", "maps/common.webp")],
    });
    const shown = map("m", { layers: [layer("surface", "maps/common.webp")] });
    const mdl = model(
      [world("w", [shown, hidden])],
      [campaign("a", { m: OPEN, "drow-city": OPEN }), campaign("b", { m: OPEN, "drow-city": OPEN })],
    );
    const a = resolveCampaign(mdl, [], "a");
    expect(a.mustNotShip.ids).toEqual(expect.arrayContaining(["drow-city-base", "shared"]));
    expect(a.mustNotShip.paths).toEqual(["maps/common.webp", "maps/menzoberranzan.webp"]);
    expect(a.collisions).toEqual([
      { name: "maps/common.webp", hidden: { kind: "layer", id: "drow-city/shared" }, shipped: { kind: "map", id: "m" } },
    ]);
    const b = resolveCampaign(mdl, [], "b");
    expect(b.mustNotShip.paths).toEqual([]);
    expect(b.collisions).toEqual([]);
  });
});

describe("layer ids are per map; only shared images collide", () => {
  const layer = (id: string, src: string) => ({ id, src, x: 0, y: 0, width: SIZE, height: SIZE });
  it("a hidden map and a shipped map both using layer id `base` is no collision, and `base` isn't secret", () => {
    const hidden = map("drow-city", { visibility: "dm", layers: [layer("base", "maps/drow.webp"), layer("drow-only", "maps/drow2.webp")] });
    const shown = map("m", { layers: [layer("Base", "maps/surface.webp")] });
    const mdl = model([world("w", [shown, hidden])], [campaign("a", { m: OPEN, "drow-city": OPEN })]);
    const a = resolveCampaign(mdl, [], "a");
    expect(a.collisions).toEqual([]);
    expect(a.mustNotShip.ids).not.toContain("base");
    expect(a.mustNotShip.ids).toContain("drow-only");
    expect(a.mustNotShip.paths).toEqual(["maps/drow.webp", "maps/drow2.webp"]);
  });

  it("paths are normalised (leading ./, doubled slashes, case) for must-not-ship and the collision", () => {
    const hidden = map("drow-city", { visibility: "dm", layers: [layer("x", "./Maps//Common.WEBP")] });
    const shown = map("m", { layers: [layer("y", "maps/common.webp")] });
    const mdl = model([world("w", [shown, hidden])], [campaign("a", { m: OPEN, "drow-city": OPEN })]);
    const a = resolveCampaign(mdl, [], "a");
    expect(a.mustNotShip.paths).toEqual(["./Maps//Common.WEBP", "maps/common.webp"]);
    expect(a.collisions).toEqual([
      { name: "maps/common.webp", hidden: { kind: "layer", id: "drow-city/x" }, shipped: { kind: "map", id: "m" } },
    ]);
  });

  it("keeps the hidden path as written too, and a leading / doesn't dodge the collision", () => {
    const hidden = map("drow-city", { visibility: "dm", layers: [layer("x", "Maps/Drow.webp")] });
    const shown = map("m", { layers: [layer("y", "/Maps/Drow.webp")] });
    const mdl = model([world("w", [shown, hidden])], [campaign("a", { m: OPEN, "drow-city": OPEN })]);
    const a = resolveCampaign(mdl, [], "a");
    expect(a.mustNotShip.paths).toEqual(expect.arrayContaining(["Maps/Drow.webp", "maps/drow.webp"]));
    expect(a.collisions).toEqual([
      { name: "maps/drow.webp", hidden: { kind: "layer", id: "drow-city/x" }, shipped: { kind: "map", id: "m" } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Rule 9: a hidden region hides what is inside or reaching into it
// ---------------------------------------------------------------------------

describe("rule 9: a hidden region hides what is inside or reaching into it", () => {
  /** The hiding region: dm in a, player in b, so the two campaigns differ. */
  const LAIR = { id: "lair", name: "The Lair", points: rect(400, 400, 600, 600), visibility: { a: "dm", b: "player" } as VisibilityValue };
  const route = (id: string, waypoints: MapV2["routes"] extends (infer R)[] | undefined ? R extends { waypoints: infer W } ? W : never : never) => ({
    id,
    name: `Route ${id}`,
    waypoints,
    visibility: "player" as VisibilityValue,
  });
  const soundArea = (id: string, points: Point[]) => ({ id, name: `Sound ${id}`, points, visibility: "player" as VisibilityValue, bed: { src: `${id}.ogg` } });
  const region = (id: string, points: Point[], extra: Record<string, unknown> = {}) => ({ id, name: `Region ${id}`, points, visibility: "player" as VisibilityValue, ...extra });
  const two = (worlds: WorldFileV2[], states: Record<string, CampaignMapV2>) =>
    model(worlds, [campaign("a", states), campaign("b", states)]);
  const both = (mdl: CampaignResolverModel, ns: WorldNote[] = [note("n")]) =>
    [resolveCampaign(mdl, ns, "a"), resolveCampaign(mdl, ns, "b")] as const;
  const reason = <T extends { ships: boolean; reason: string }>(list: T[], pred: (t: T) => boolean) => find(list, pred).reason;

  describe("pins", () => {
    const m = map("m", {
      regions: [LAIR],
      pins: [
        { note: "n", x: 500, y: 500, visibility: "player" }, // inside
        { note: "n", x: 400, y: 500, visibility: "player" }, // on the edge
        { note: "n", x: 600, y: 600, visibility: "player" }, // on a corner
        { note: "n", x: 100, y: 100, visibility: "player" }, // outside
      ],
    });
    const [a, b] = both(two([world("w", [m])], { m: OPEN }));

    it("a pin inside or on the edge of the hiding region doesn't ship in a (in-hidden-region); all ship in b", () => {
      expect([0, 1, 2, 3].map((i) => find(a.pins, (p) => p.index === i).reason)).toEqual([
        "in-hidden-region",
        "in-hidden-region",
        "in-hidden-region",
        "ships",
      ]);
      expect(b.pins.every((p) => p.ships)).toBe(true);
    });

    it("a hidden pin adds its location, not its note's name; the note still ships", () => {
      expect(noteShips(a, "n")).toBe(true);
      expect(a.mustNotShip.pinLocations).toEqual([
        { map: "m", index: 0, x: 500, y: 500 },
        { map: "m", index: 1, x: 400, y: 500 },
        { map: "m", index: 2, x: 600, y: 600 },
      ]);
      expect(a.mustNotShip.names).toEqual(["The Lair"]);
      expect(a.mustNotShip.ids).toEqual(["lair"]);
    });

    it("hidden wins: a pin inside the hiding region and a shipped region covering it doesn't ship", () => {
      const kingdom = region("kingdom", rect(100, 100, 900, 900));
      const mm = map("m", { regions: [LAIR, kingdom], pins: [{ note: "n", x: 500, y: 500, visibility: "player" }] });
      const [ra] = both(two([world("w", [mm])], { m: OPEN }));
      expect(regionShips(ra, "kingdom")).toBe(true);
      expect(pinShips(ra, "m")).toBe(false);
    });
  });

  describe("routes", () => {
    const pinInLair = { note: "inside", x: 500, y: 500, visibility: "player" as VisibilityValue };
    const pinOut = { note: "n", x: 100, y: 100, visibility: "player" as VisibilityValue };
    const m = map("m", {
      regions: [LAIR],
      pins: [pinInLair, pinOut],
      routes: [
        route("vertex-in", [[100, 500], [500, 500]]),
        route("crosses", [[300, 500], [700, 500]]),
        route("along-edge", [[300, 400], [700, 400]]),
        route("touches-corner", [[300, 700], [400, 600], [300, 500]]),
        route("clear", [[300, 300], [700, 300]]),
        route("via-hidden-pin", [{ entityId: "n" }, { entityId: "inside" }]),
        route("crosses-via-pins", [{ entityId: "n" }, [900, 900]]),
      ],
    });
    const [a, b] = both(two([world("w", [m])], { m: OPEN }), [note("n"), note("inside")]);
    const r = (res: CampaignResolution, id: string) => reason(res.routes, (x) => x.id === id);

    it("a vertex inside, a segment crossing with no vertex inside, along an edge, or touching a corner: hidden in a", () => {
      for (const id of ["vertex-in", "crosses", "along-edge", "touches-corner"]) expect(r(a, id), id).toBe("in-hidden-region");
      expect(r(a, "clear")).toBe("ships");
    });

    it("the resolved polyline counts: pin waypoints, and a pin hidden by rule 9 makes its route waypoint-hidden", () => {
      expect(r(a, "via-hidden-pin")).toBe("waypoint-hidden");
      // (100, 100) -> (900, 900) runs through the lair's interior.
      expect(r(a, "crosses-via-pins")).toBe("in-hidden-region");
    });

    it("everything ships in b", () => {
      expect(b.routes.every((x) => x.ships)).toBe(true);
    });
  });

  describe("sound-only areas and regions", () => {
    const shapes: [string, Point[], string][] = [
      ["partly-over", rect(550, 550, 650, 650), "in-hidden-region"],
      ["inside", rect(450, 450, 550, 550), "in-hidden-region"],
      ["identical", rect(400, 400, 600, 600), "in-hidden-region"],
      ["shares-an-edge-and-contains", rect(400, 300, 700, 700), "in-hidden-region"],
      ["container", rect(300, 300, 700, 700), "ships"],
      ["neighbour", rect(600, 400, 700, 600), "ships"],
      ["corner-neighbour", rect(600, 600, 700, 700), "ships"],
      ["apart", rect(10, 10, 90, 90), "ships"],
    ];
    const m = map("m", {
      regions: [LAIR, ...shapes.map(([id, pts]) => region(`r-${id}`, pts))],
      sound: [
        ...shapes.map(([id, pts]) => soundArea(`s-${id}`, pts)),
        { id: "ride-partly", name: "Ride", regionId: "r-partly-over", bed: { src: "r.ogg" } },
        { id: "ride-container", name: "Ride 2", regionId: "r-container", bed: { src: "r2.ogg" } },
      ],
    });
    const [a, b] = both(two([world("w", [m])], { m: OPEN }));

    it.each(shapes)("%s: %s", (id, _pts, expected) => {
      void _pts;
      expect(reason(a.sound, (x) => x.id === `s-${id}`)).toBe(expected);
      expect(reason(a.regions, (x) => x.id === `r-${id}`)).toBe(expected);
      expect(soundShips(b, `s-${id}`)).toBe(true);
      expect(regionShips(b, `r-${id}`)).toBe(true);
    });

    it("a ride-on sound area follows its region, including when rule 9 hides it", () => {
      expect(reason(a.sound, (x) => x.id === "ride-partly")).toBe("region-hidden");
      expect(soundShips(a, "ride-container")).toBe(true);
      expect(soundShips(b, "ride-partly")).toBe(true);
    });

    it("a container doesn't reveal the hidden region: its id and name stay in must-not-ship", () => {
      expect(regionShips(a, "r-container")).toBe(true);
      expect(a.mustNotShip.ids).toContain("lair");
      expect(a.mustNotShip.names).toContain("The Lair");
    });
  });

  describe("frames", () => {
    const land = (lair = LAIR) => map("land", { regions: [lair] });
    const city = (frame: { x: number; y: number; width: number; height: number; rotation?: number }) =>
      ({ ...furnished("city"), parent: "land", frame: { rotation: 0, ...frame }, enterZoom: 2 }) as MapV2;
    const dungeon = { ...furnished("dungeon"), parent: "city", frame: { x: 10, y: 10, width: 50, height: 50, rotation: 0 }, enterZoom: 2 } as MapV2;
    const states = { land: OPEN, city: OPEN, dungeon: OPEN };
    const resolve = (f: Parameters<typeof city>[0]) => both(two([world("w", [land(), city(f), dungeon])], states));

    it("a frame partly over the hiding region hides the child with its whole subtree in a; ships in b", () => {
      const [a, b] = resolve({ x: 550, y: 550, width: 200, height: 200 });
      expect(find(a.maps, (x) => x.id === "city").reason).toBe("frame-in-hidden-region");
      expect(find(a.frames, (x) => x.map === "city").reason).toBe("frame-in-hidden-region");
      expect(find(a.maps, (x) => x.id === "dungeon").reason).toBe("parent-hidden");
      expect(everyItemOn(a, "city").every((s) => !s)).toBe(true);
      expect(everyItemOn(a, "dungeon").every((s) => !s)).toBe(true);
      expect(a.mustNotShip.ids).toEqual(expect.arrayContaining(["city", "dungeon", "city-region"]));
      expect(mapShips(b, "city")).toBe(true);
      expect(mapShips(b, "dungeon")).toBe(true);
    });

    it("a frame wholly containing the hiding region ships; the child decides its own items", () => {
      const [a] = resolve({ x: 300, y: 300, width: 400, height: 400 });
      expect(mapShips(a, "city")).toBe(true);
      expect(mapShips(a, "dungeon")).toBe(true);
      // The child's own region at 10..90 isn't touched by the parent's lair (no projection).
      expect(everyItemOn(a, "city").every((s) => s)).toBe(true);
    });

    it("a frame identical to the hiding region, or sharing its edge, hides; one only touching its edge ships", () => {
      expect(mapShips(resolve({ x: 400, y: 400, width: 200, height: 200 })[0], "city")).toBe(false);
      expect(mapShips(resolve({ x: 400, y: 300, width: 300, height: 400 })[0], "city")).toBe(false);
      expect(mapShips(resolve({ x: 600, y: 400, width: 100, height: 200 })[0], "city")).toBe(true);
    });

    it("a rotated frame is tested turned both ways: reaching in by a turned corner hides it", () => {
      // A 100 x 100 frame left of the lair (x < 400), level with it (y 450..550).
      // Turned 45 degrees, a corner sticks out 70.7 from the centre (centre
      // turn) or 141.4 from the top-left (corner turn), sideways either way.
      // At x 250 (centre 300) neither reaches x 400: ships. At x 290 (centre
      // 340) the centre-turned corner reaches (410.7, 500), inside: hides.
      expect(mapShips(resolve({ x: 250, y: 450, width: 100, height: 100, rotation: 45 })[0], "city")).toBe(true);
      expect(mapShips(resolve({ x: 290, y: 450, width: 100, height: 100, rotation: 45 })[0], "city")).toBe(false);
      // Unrotated, the same rectangle (290..390) misses the lair.
      expect(mapShips(resolve({ x: 290, y: 450, width: 100, height: 100, rotation: 0 })[0], "city")).toBe(true);
    });

    it("a frame decided by fog first keeps frame-fogged", () => {
      const mdl = model(
        [world("w", [land(), city({ x: 550, y: 550, width: 100, height: 100 })])],
        [campaign("a", { land: LEFT_HALF, city: OPEN })],
      );
      expect(find(resolveCampaign(mdl, [note("n")], "a").maps, (x) => x.id === "city").reason).toBe("frame-fogged");
    });
  });

  describe("what is and isn't a hiding region", () => {
    it("a region dropped only by fog hides nothing: a lit pin in it ships", () => {
      const m = map("m", {
        regions: [region("half-fogged", rect(400, 400, 600, 600))],
        pins: [{ note: "n", x: 450, y: 450, visibility: "player" }],
      });
      const r = resolveCampaign(model([world("w", [m])], [campaign("a", { m: LEFT_HALF })]), [note("n")], "a");
      expect(reason(r.regions, (x) => x.id === "half-fogged")).toBe("fogged");
      expect(pinShips(r, "m")).toBe(true);
    });

    it("a region hidden by its link to a note that doesn't ship hides (link-hidden)", () => {
      const m = map("m", {
        regions: [region("lair", rect(400, 400, 600, 600), { entityId: "secret" })],
        pins: [{ note: "n", x: 500, y: 500, visibility: "player" }],
      });
      const r = resolveCampaign(model([world("w", [m])], [campaign("a", { m: OPEN })]), [note("n"), note("secret", { visibility: "dm" })], "a");
      expect(reason(r.regions, (x) => x.id === "lair")).toBe("link-hidden");
      expect(reason(r.pins, () => true)).toBe("in-hidden-region");
    });

    it("no cascade: a region hidden only by rule 9 hides nothing", () => {
      const m = map("m", {
        regions: [LAIR, region("overlap", rect(500, 500, 800, 800))],
        pins: [{ note: "n", x: 700, y: 700, visibility: "player" }],
        sound: [soundArea("in-overlap", rect(650, 650, 750, 750))],
      });
      const [a] = both(two([world("w", [m])], { m: OPEN }));
      expect(reason(a.regions, (x) => x.id === "overlap")).toBe("in-hidden-region");
      expect(pinShips(a, "m")).toBe(true);
      expect(soundShips(a, "in-overlap")).toBe(true);
    });

    it("a region on a map that doesn't ship hides nothing on other maps", () => {
      const m = map("m", { visibility: "dm", regions: [LAIR] });
      const other = map("o", { pins: [{ note: "n", x: 500, y: 500, visibility: "player" }] });
      const r = resolveCampaign(model([world("w", [m, other])], [campaign("a", { m: OPEN, o: OPEN })]), [note("n")], "a");
      expect(pinShips(r, "o")).toBe(true);
      expect(r.badHidingRegions).toEqual([]);
    });
  });

  describe("a malformed hiding region", () => {
    it.each([
      { label: "two points", points: [[1, 1], [2, 2]] as Point[] },
      { label: "a non-finite point", points: [[1, 1], [2, Number.NaN], [3, 1]] as Point[] },
    ])("$label: reported, and everything rule 9 tests on its map is hidden", ({ points }) => {
      const m = map("m", {
        regions: [{ id: "bad", name: "Bad", points, visibility: "dm" }, region("ok", rect(10, 10, 90, 90))],
        pins: [{ note: "n", x: 900, y: 900, visibility: "player" }],
        routes: [route("road", [[700, 700], [800, 800]])],
        sound: [soundArea("hum", rect(700, 700, 800, 800))],
      });
      const kid = { ...map("kid"), parent: "m", frame: { x: 700, y: 700, width: 50, height: 50, rotation: 0 }, enterZoom: 2 } as MapV2;
      const other = map("o", { pins: [{ note: "n", x: 1, y: 1, visibility: "player" }] });
      const r = resolveCampaign(
        model([world("w", [m, kid, other])], [campaign("a", { m: OPEN, kid: OPEN, o: OPEN })]),
        [note("n")],
        "a",
      );
      expect(r.badHidingRegions).toEqual([{ map: "m", region: "bad" }]);
      expect(pinShips(r, "m")).toBe(false);
      expect(routeShips(r, "road")).toBe(false);
      expect(soundShips(r, "hum")).toBe(false);
      expect(regionShips(r, "ok")).toBe(false);
      expect(find(r.maps, (x) => x.id === "kid").reason).toBe("frame-in-hidden-region");
      expect(pinShips(r, "o")).toBe(true);
    });

    it("a malformed region that ships (player) is not reported", () => {
      const m = map("m", { regions: [{ id: "bad", name: "Bad", points: [[1, 1], [2, 2]] as Point[], visibility: "player" }] });
      const r = resolveCampaign(model([world("w", [m])], [campaign("a", { m: OPEN })]), [], "a");
      expect(r.badHidingRegions).toEqual([]);
    });
  });

  describe("rule 8 with rule 9", () => {
    const hazel = note("hazel-hollow", { title: "Hazel Hollow" });

    it("a non-linking route hidden by rule 9 named like a shipped note is a collision", () => {
      const m = map("m", {
        regions: [LAIR],
        routes: [{ ...route("hollow-road", [[300, 500], [700, 500]]), name: "Hazel Hollow" }],
      });
      const [a, b] = both(two([world("w", [m])], { m: OPEN }), [hazel]);
      expect(a.collisions).toEqual([
        { name: "Hazel Hollow", hidden: { kind: "route", id: "hollow-road" }, shipped: { kind: "note", id: "hazel-hollow" } },
      ]);
      expect(b.collisions).toEqual([]);
    });

    it("a region hidden by rule 9 that links the shipped note is exempt: no collision, its names stay out", () => {
      const m = map("m", {
        regions: [LAIR, region("hazel-hollow", rect(500, 500, 800, 800), { name: "Hazel Hollow", entityId: "hazel-hollow" })],
      });
      const [a] = both(two([world("w", [m])], { m: OPEN }), [hazel]);
      expect(reason(a.regions, (x) => x.id === "hazel-hollow")).toBe("in-hidden-region");
      expect(a.collisions).toEqual([]);
      expect(a.mustNotShip.names).not.toContain("Hazel Hollow");
    });
  });

  describe("the all-pins-hidden warning (hiddenPinNotes)", () => {
    it("names a shipped note whose every pin rule 9 hides, and the region", () => {
      const m = map("m", {
        regions: [LAIR],
        pins: [
          { note: "n", x: 500, y: 500, visibility: "player" },
          { note: "kept", x: 450, y: 450, visibility: "player" },
          { note: "kept", x: 100, y: 100, visibility: "player" },
          { note: "dm-note", x: 500, y: 500, visibility: "player" },
        ],
      });
      const [a, b] = both(two([world("w", [m])], { m: OPEN }), [note("n"), note("kept"), note("dm-note", { visibility: "dm" })]);
      expect(a.hiddenPinNotes).toEqual([{ note: "n", regions: [{ map: "m", region: "lair" }] }]);
      expect(b.hiddenPinNotes).toEqual([]);
      // Not in `warnings` (structured; the build words it).
      expect(a.warnings).toEqual([]);
    });
  });

  describe("frames iterate to a fixed point", () => {
    it("a region linking a note of another world hides a frame once that world's notes are decided", () => {
      // World w2's only map is dm in a, so w2 doesn't ship (rule 5), its note
      // doesn't ship (rule 6), the region linking it on land is link-hidden,
      // and the frame of city over that region hides city and its subtree.
      const land = map("land", { regions: [region("gate", rect(400, 400, 600, 600), { entityId: "far-note" })] });
      const cityMap = { ...furnished("city"), parent: "land", frame: { x: 500, y: 500, width: 200, height: 200, rotation: 0 }, enterZoom: 2 } as MapV2;
      const keep = { ...map("keep"), parent: "city", frame: { x: 10, y: 10, width: 20, height: 20, rotation: 0 }, enterZoom: 2 } as MapV2;
      const far = map("far", { visibility: { a: "dm", b: "player" } });
      const mdl = model(
        [world("w", [land, cityMap, keep]), world("w2", [far])],
        [campaign("a", { land: OPEN, city: OPEN, keep: OPEN, far: OPEN }), campaign("b", { land: OPEN, city: OPEN, keep: OPEN, far: OPEN })],
      );
      const ns = [note("n"), note("far-note", { world: "w2" })];
      const [a, b] = both(mdl, ns);
      expect(worldShips(a, "w2")).toBe(false);
      expect(reason(a.regions, (x) => x.id === "gate")).toBe("link-hidden");
      expect(find(a.maps, (x) => x.id === "city").reason).toBe("frame-in-hidden-region");
      expect(find(a.maps, (x) => x.id === "keep").reason).toBe("parent-hidden");
      // Worlds and notes are re-decided after the frame pass: w still ships by land.
      expect(worldShips(a, "w")).toBe(true);
      expect(noteShips(a, "n")).toBe(true);
      expect(mapShips(b, "city")).toBe(true);
    });

    it("a world whose root map ships always keeps it: frames hide children, never a root", () => {
      // So a pass-2 world loss can't happen; the loop still re-decides and ends.
      const land = map("land", { regions: [LAIR] });
      const cityMap = { ...map("city"), parent: "land", frame: { x: 500, y: 500, width: 200, height: 200, rotation: 0 }, enterZoom: 2 } as MapV2;
      const [a] = both(two([world("w", [land, cityMap])], { land: OPEN, city: OPEN }));
      expect(mapShips(a, "land")).toBe(true);
      expect(mapShips(a, "city")).toBe(false);
      expect(worldShips(a, "w")).toBe(true);
    });
  });
});
