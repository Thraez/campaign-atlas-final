import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  validateAtlasFileV2,
  validateCampaignFileV2,
  validateWorldFileV2,
  type SchemaV2Error,
  type SchemaV2Result,
} from "./schemaV2";

// plan.md section 4's sketch (branch rebuild-plan-2026-11), adapted: polygons
// filled in, maps given a name and size, layers given ids, and v1's field
// names (`unitLabel`, `points`, `entityId`, `bed`) in place of the sketch's.

const atlasSample = () => ({
  schemaVersion: 2,
  ocean: { width: 400000, height: 300000, sea: "default" },
  worlds: ["astrath-deeprealm"],
  campaigns: ["main", "sandbox"],
  onOcean: [{ map: "varn", x: 0, y: 0, scale: 1, rotation: 0 }],
});

const triangle = () => [
  [0, 0],
  [100, 0],
  [100, 100],
];

const worldSample = () => ({
  schemaVersion: 2,
  world: { id: "astrath-deeprealm", name: "Astrath Deeprealm" },
  calendar: { name: "Reckoning", months: [{ name: "Thaw", days: 30 }] },
  credits: { badges: true, page: false },
  assetCredits: { "images/varn.png": { credit: "Map by Isak", enabled: true } },
  import: { folders: { npc: "people" }, defaultFolder: "notes" },
  water: { enabled: true, intensity: 0.35 },
  maps: [
    {
      id: "varn",
      name: "Varn",
      width: 16000,
      height: 12000,
      visibility: { main: "player", sandbox: "rumor" } as Record<string, unknown>,
      layers: [{ id: "base", src: "images/varn.png", x: 0, y: 0, width: 16000, height: 12000 }],
      scale: { unitsPerPixel: 0.5, unitLabel: "mi" },
      zoom: { min: -4, max: 2 },
    },
    {
      id: "saltmere",
      name: "Saltmere",
      width: 800,
      height: 600,
      visibility: { main: "player" },
      layers: [{ id: "base", src: "images/saltmere.png", x: 0, y: 0, width: 800, height: 600 }],
      scale: { unitsPerPixel: 0.01, unitLabel: "mi" },
      zoom: { min: -2, max: 3 },
      parent: "varn" as unknown,
      frame: { x: 3100, y: 2200, width: 400, height: 300, rotation: 12 },
      enterZoom: 1,
      regions: [
        {
          id: "salt-marsh",
          name: "Salt Marsh",
          points: triangle(),
          visibility: "dm",
          entityId: "salt-marsh",
        } as Record<string, unknown>,
      ],
      routes: [
        {
          id: "coast-road",
          name: "Coast Road",
          waypoints: [[0, 0], { entityId: "harbour-master" }] as unknown[],
          speed: 24,
          visibility: { main: "player" },
        },
      ],
      pins: [
        { note: "harbour-master", x: 120, y: 340, visibility: { main: "player" } as Record<string, unknown> },
      ],
      sound: [
        {
          id: "gulls",
          points: triangle(),
          visibility: { main: "player" },
          bed: { src: "atlas/assets/audio/gulls.ogg" },
        } as Record<string, unknown>,
      ],
    } as Record<string, unknown> & { frame: Record<string, number> },
  ],
  notes: {
    "harbour-master": {
      visibility: { main: "player", sandbox: "dm" },
      basedOn: "player",
      belongsTo: ["saltmere"],
    } as Record<string, unknown>,
  } as Record<string, unknown>,
});

type WorldSample = ReturnType<typeof worldSample>;
type ChildMap = Record<string, unknown> & { frame: Record<string, number> };
const child = (s: WorldSample) => s.maps[1] as ChildMap;
const firstOf = (s: WorldSample, key: "regions" | "pins" | "sound") =>
  (child(s)[key] as Record<string, unknown>[])[0];

const campaignSample = () => ({
  id: "main",
  name: "Main campaign",
  notes: "vault" as unknown,
  maps: {
    varn: {
      state: "fogged",
      reveals: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
      ] as unknown[][],
      conceals: [],
      featherPx: 24,
    },
    saltmere: { state: "open" },
  } as Record<string, Record<string, unknown>>,
});

function errorsOf<T>(result: SchemaV2Result<T>): SchemaV2Error[] {
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
}

function paths<T>(result: SchemaV2Result<T>): string[] {
  return errorsOf(result).map((e) => e.path);
}

describe("validateAtlasFileV2", () => {
  it("accepts the plan's sample and returns it typed", () => {
    const sample = atlasSample();
    expect(validateAtlasFileV2(sample)).toEqual({ ok: true, value: sample });
  });

  it("names a missing required field", () => {
    const { ocean: _ocean, ...noOcean } = atlasSample();
    expect(paths(validateAtlasFileV2(noOcean))).toEqual(["ocean"]);
    const noSea = { ...atlasSample(), ocean: { width: 1, height: 1 } };
    expect(paths(validateAtlasFileV2(noSea))).toEqual(["ocean.sea"]);
  });

  it("rejects a schemaVersion other than 2", () => {
    expect(paths(validateAtlasFileV2({ ...atlasSample(), schemaVersion: 1 }))).toEqual(["schemaVersion"]);
  });

  it("names the bad onOcean entry", () => {
    const sample = atlasSample();
    sample.onOcean.push({ map: "x", x: 0, y: 0, scale: 0, rotation: 0 });
    expect(paths(validateAtlasFileV2(sample))).toEqual(["onOcean[1].scale"]);
  });

  it("reports unknown fields, at the root and inside entries", () => {
    const sample = { ...atlasSample(), campaign: ["main"] } as Record<string, unknown>;
    (sample.onOcean as Record<string, unknown>[])[0].zoom = 1;
    expect(paths(validateAtlasFileV2(sample))).toEqual(["campaign", "onOcean[0].zoom"]);
  });

  it("rejects a non-mapping file", () => {
    expect(paths(validateAtlasFileV2(["schemaVersion", 2]))).toEqual(["(root)"]);
  });
});

describe("validateWorldFileV2", () => {
  it("accepts the plan's sample and returns it typed", () => {
    const sample = worldSample();
    expect(validateWorldFileV2(sample)).toEqual({ ok: true, value: sample });
  });

  it("keeps every field of today's overview map (content/astrath-deeprealm)", () => {
    const file = path.resolve(__dirname, "../../../content/astrath-deeprealm/_atlas/world.yaml");
    const v1 = yaml.load(fs.readFileSync(file, "utf8")) as { maps: Record<string, unknown>[] };
    const { soundscape, ...overview } = v1.maps[0] as {
      soundscape: { areas: unknown[] } & Record<string, unknown>;
    } & Record<string, unknown>;
    const { areas, ...settings } = soundscape;
    // The v1 -> v2 move for this map: soundscape areas go to `sound`, the rest
    // of `soundscape` stays; v2 adds a zoom range.
    const map = {
      ...overview,
      ...(Object.keys(settings).length > 0 ? { soundscape: settings } : {}),
      sound: areas,
      zoom: { min: -4, max: 2 },
    };
    for (const key of ["name", "width", "height", "oceanColor", "wrapX", "grid", "scale", "layers"]) {
      expect(map, key).toHaveProperty(key);
    }
    const result = validateWorldFileV2({
      schemaVersion: 2,
      world: { id: "astrath-deeprealm", name: "Astrath Deeprealm" },
      maps: [map],
    });
    expect(result.ok ? [] : result.errors).toEqual([]);
    if (result.ok) expect(result.value.maps[0]).toEqual(map);
  });

  it("names a missing required field", () => {
    const sample = worldSample();
    delete child(sample).id;
    delete child(sample).name;
    expect(paths(validateWorldFileV2(sample))).toEqual(["maps[1].id", "maps[1].name"]);
  });

  it("requires a map's positive width and height", () => {
    const sample = worldSample();
    delete (sample.maps[0] as Record<string, unknown>).width;
    child(sample).height = -1;
    expect(paths(validateWorldFileV2(sample))).toEqual(["maps[0].width", "maps[1].height"]);
  });

  it("rejects a frame with a negative size, naming its path", () => {
    const sample = worldSample();
    child(sample).frame.width = -400;
    const errors = errorsOf(validateWorldFileV2(sample));
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe("maps[1].frame.width");
    expect(errors[0].message).toMatch(/greater than 0/);
  });

  it("rejects a zero frame height", () => {
    const sample = worldSample();
    child(sample).frame.height = 0;
    expect(paths(validateWorldFileV2(sample))).toEqual(["maps[1].frame.height"]);
  });

  it("says a NaN or Infinity is not a finite number", () => {
    const sample = worldSample();
    child(sample).frame.x = Number.NaN;
    child(sample).frame.y = Number.POSITIVE_INFINITY;
    const errors = errorsOf(validateWorldFileV2(sample));
    expect(errors.map((e) => e.path)).toEqual(["maps[1].frame.x", "maps[1].frame.y"]);
    for (const e of errors) expect(e.message).toMatch(/finite number/);
  });

  it("rejects a per-campaign visibility with a non-string value", () => {
    const sample = worldSample();
    (firstOf(sample, "pins").visibility as Record<string, unknown>).main = 3;
    expect(paths(validateWorldFileV2(sample))).toEqual(["maps[1].pins[0].visibility.main"]);
  });

  it("rejects a visibility that is neither a string nor a mapping", () => {
    const sample = worldSample();
    (sample.maps[0] as Record<string, unknown>).visibility = ["player"];
    expect(paths(validateWorldFileV2(sample))).toEqual(["maps[0].visibility"]);
  });

  it("keeps an invalid visibility string as written (the resolver makes it dm)", () => {
    const sample = worldSample();
    sample.maps[0].visibility = { main: "plyer", sandbox: "rumor" };
    firstOf(sample, "regions").visibility = "secret";
    const result = validateWorldFileV2(sample);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maps[0].visibility).toEqual({ main: "plyer", sandbox: "rumor" });
    expect(result.value.maps[1].regions![0].visibility).toBe("secret");
  });

  it("keeps a missing visibility missing (the resolver makes it dm)", () => {
    const sample = worldSample();
    delete (sample.maps[0] as Record<string, unknown>).visibility;
    const result = validateWorldFileV2(sample);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.maps[0].visibility).toBeUndefined();
  });

  it("keeps a note entry with no basedOn (rule 6 resolves it to dm)", () => {
    const sample = worldSample();
    delete (sample.notes["harbour-master"] as Record<string, unknown>).basedOn;
    expect(validateWorldFileV2(sample).ok).toBe(true);
  });

  it("requires frame and enterZoom on a child map, and refuses them on a top-level map", () => {
    const sample = worldSample();
    delete (child(sample) as Record<string, unknown>).frame;
    delete child(sample).enterZoom;
    expect(paths(validateWorldFileV2(sample))).toEqual(["maps[1].frame", "maps[1].enterZoom"]);

    const top = worldSample();
    (top.maps[0] as Record<string, unknown>).frame = { x: 0, y: 0, width: 1, height: 1, rotation: 0 };
    expect(paths(validateWorldFileV2(top))).toEqual(["maps[0].frame"]);
  });

  it("reports only the type error for a non-string parent", () => {
    const sample = worldSample();
    child(sample).parent = 5;
    expect(paths(validateWorldFileV2(sample))).toEqual(["maps[1].parent"]);
  });

  it("rejects empty id references", () => {
    const sample = worldSample();
    child(sample).parent = "";
    firstOf(sample, "regions").entityId = " ";
    firstOf(sample, "pins").note = "";
    firstOf(sample, "sound").regionId = "";
    const errors = errorsOf(validateWorldFileV2(sample));
    expect(errors.map((e) => e.path)).toEqual([
      "maps[1].parent",
      "maps[1].regions[0].entityId",
      "maps[1].pins[0].note",
      "maps[1].sound[0].regionId",
    ]);
    for (const e of errors) expect(e.message).toBe("must not be empty");
  });

  it("reports a misspelled field and a plan-style region note: as unknown fields", () => {
    const sample = worldSample();
    const map = sample.maps[0] as Record<string, unknown>;
    map.visiblity = map.visibility;
    delete map.visibility;
    firstOf(sample, "regions").note = "salt-marsh";
    const errors = errorsOf(validateWorldFileV2(sample));
    expect(errors).toEqual([
      { path: "maps[0].visiblity", message: "unknown field" },
      { path: "maps[1].regions[0].note", message: "unknown field" },
    ]);
  });

  it("reports unknown fields in nested blocks and world-level settings", () => {
    const sample = worldSample() as WorldSample & Record<string, unknown>;
    sample.fog = [];
    child(sample).frame.depth = 1;
    (sample.water as Record<string, unknown>).waves = 3;
    expect(paths(validateWorldFileV2(sample))).toEqual(["fog", "water.waves", "maps[1].frame.depth"]);
  });

  it("refuses soundscape areas: they live in sound", () => {
    const sample = worldSample();
    (sample.maps[0] as Record<string, unknown>).soundscape = { enabled: true, areas: [] };
    expect(paths(validateWorldFileV2(sample))).toEqual(["maps[0].soundscape.areas"]);
  });

  it("needs at least 3 points for a region or a sound area", () => {
    const sample = worldSample();
    firstOf(sample, "regions").points = [
      [0, 0],
      [1, 1],
    ];
    firstOf(sample, "sound").points = [];
    expect(paths(validateWorldFileV2(sample))).toEqual(["maps[1].regions[0].points", "maps[1].sound[0].points"]);
  });

  it("names errors in the world-level blocks", () => {
    const sample: Record<string, unknown> = worldSample();
    sample.calendar = { months: [{ name: "Thaw", days: 0 }] };
    sample.import = { folders: { npc: 4 } };
    sample.water = { intensity: "high" };
    sample.assetCredits = { "a.png": { credit: 1, enabled: "yes" } };
    expect(paths(validateWorldFileV2(sample))).toEqual([
      "calendar.months[0].days",
      "assetCredits[\"a.png\"].credit",
      "assetCredits[\"a.png\"].enabled",
      "import.folders.npc",
      "import.defaultFolder",
      "water.intensity",
    ]);
  });

  it("reads a v1-style asset credit with no enabled as disabled", () => {
    const sample = worldSample();
    (sample as Record<string, unknown>).assetCredits = { "a.png": { credit: "Art by K" } };
    const result = validateWorldFileV2(sample);
    expect(result.ok && result.value.assetCredits).toEqual({ "a.png": { credit: "Art by K", enabled: false } });
  });

  it("reports every structural error at once", () => {
    const sample = worldSample();
    (sample.maps[0] as { layers: Record<string, unknown>[] }).layers[0].src = 5;
    (child(sample).zoom as { min: number }).min = 10;
    (child(sample).routes as { waypoints: unknown[] }[])[0].waypoints.push([1]);
    expect(paths(validateWorldFileV2(sample))).toEqual([
      "maps[0].layers[0].src",
      "maps[1].zoom",
      "maps[1].routes[0].waypoints[2]",
    ]);
  });

  it("quotes note ids that aren't plain ids in paths", () => {
    const sample = worldSample();
    sample.notes["the old.mill"] = { visibility: 7 };
    expect(paths(validateWorldFileV2(sample))).toEqual(['notes["the old.mill"].visibility']);
  });

  it("refuses prototype keys in notes and per-campaign visibility", () => {
    const parsed = yaml.load(
      [
        "schemaVersion: 2",
        "world: { id: w, name: W }",
        "maps:",
        "  - id: m",
        "    name: M",
        "    width: 10",
        "    height: 10",
        "    layers: []",
        "    scale: { unitsPerPixel: 1, unitLabel: mi }",
        "    zoom: { min: 0, max: 1 }",
        "    visibility: { __proto__: player, main: player }",
        "notes:",
        "  __proto__: { visibility: player }",
        "  constructor: { visibility: player }",
      ].join("\n"),
    );
    expect(paths(validateWorldFileV2(parsed))).toEqual([
      "maps[0].visibility.__proto__",
      "notes.__proto__",
      "notes.constructor",
    ]);
    expect(({} as Record<string, unknown>).visibility).toBeUndefined();
  });

  it("builds records on a null prototype", () => {
    const result = validateWorldFileV2(worldSample());
    expect(result.ok && Object.getPrototypeOf(result.value.notes)).toBeNull();
  });
});

describe("validateCampaignFileV2", () => {
  it("accepts the plan's sample and returns it typed", () => {
    const sample = campaignSample();
    expect(validateCampaignFileV2(sample)).toEqual({ ok: true, value: sample });
  });

  it("names a missing required field", () => {
    const { id: _id, ...noId } = campaignSample();
    expect(paths(validateCampaignFileV2(noId))).toEqual(["id"]);
  });

  it("rejects a wrong map state", () => {
    const sample = campaignSample();
    sample.maps.saltmere.state = "revealed";
    expect(paths(validateCampaignFileV2(sample))).toEqual(["maps.saltmere.state"]);
  });

  it("reads a missing notes field as hidden, never vault", () => {
    const { notes: _notes, ...noNotes } = campaignSample();
    const result = validateCampaignFileV2(noNotes);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.notes).toBe("hidden");
  });

  it("rejects a notes value other than vault or hidden, null included", () => {
    expect(paths(validateCampaignFileV2({ ...campaignSample(), notes: "player" }))).toEqual(["notes"]);
    expect(paths(validateCampaignFileV2({ ...campaignSample(), notes: null }))).toEqual(["notes"]);
  });

  it("reads a missing maps field as no maps (every map unknown), but rejects maps: null", () => {
    const result = validateCampaignFileV2({ id: "sandbox", name: "Sandbox" });
    expect(result).toEqual({ ok: true, value: { id: "sandbox", name: "Sandbox", maps: {}, notes: "hidden" } });
    expect(paths(validateCampaignFileV2({ ...campaignSample(), maps: null }))).toEqual(["maps"]);
  });

  it("rejects a malformed fog polygon and a negative feather", () => {
    const sample = campaignSample();
    sample.maps.varn.reveals = [[[0, 0], "x"]];
    sample.maps.varn.featherPx = -1;
    expect(paths(validateCampaignFileV2(sample))).toEqual(["maps.varn.reveals[0][1]", "maps.varn.featherPx"]);
  });

  it("reports unknown fields in the file and in a map entry", () => {
    const sample = campaignSample() as ReturnType<typeof campaignSample> & Record<string, unknown>;
    sample.fog = {};
    sample.maps.saltmere.reveal = [];
    expect(paths(validateCampaignFileV2(sample))).toEqual(["fog", "maps.saltmere.reveal"]);
  });

  it("refuses a __proto__ map id from parsed YAML", () => {
    const parsed = yaml.load("id: main\nname: Main\nmaps:\n  __proto__: { state: open }\n  varn: { state: open }\n");
    expect(paths(validateCampaignFileV2(parsed))).toEqual(["maps.__proto__"]);
  });
});
