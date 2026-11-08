import { describe, expect, it } from "vitest";
import {
  validateAtlasFileV2,
  validateCampaignFileV2,
  validateWorldFileV2,
  type SchemaV2Error,
  type SchemaV2Result,
} from "./schemaV2";

// plan.md section 4's sketch (branch rebuild-plan-2026-11), adapted: polygons
// filled in, layers given ids, scale written as v1's `unitLabel`, regions and
// sound areas using v1's `points` / `entityId` names, sound areas given a bed.

const atlasSample = {
  schemaVersion: 2,
  ocean: { width: 400000, height: 300000, sea: "default" },
  worlds: ["astrath-deeprealm"],
  campaigns: ["main", "sandbox"],
  onOcean: [{ map: "varn", x: 0, y: 0, scale: 1, rotation: 0 }],
};

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
      visibility: { main: "player", sandbox: "rumor" },
      layers: [{ id: "base", src: "images/varn.png", x: 0, y: 0, width: 16000, height: 12000 }],
      scale: { unitsPerPixel: 0.5, unitLabel: "mi" },
      zoom: { min: -4, max: 2 },
    },
    {
      id: "saltmere",
      visibility: { main: "player" },
      layers: [{ id: "base", src: "images/saltmere.png", x: 0, y: 0, width: 800, height: 600 }],
      scale: { unitsPerPixel: 0.01, unitLabel: "mi" },
      zoom: { min: -2, max: 3 },
      parent: "varn",
      frame: { x: 3100, y: 2200, width: 400, height: 300, rotation: 12 },
      enterZoom: 1,
      regions: [
        {
          id: "salt-marsh",
          name: "Salt Marsh",
          points: [
            [0, 0],
            [100, 0],
            [100, 100],
          ],
          visibility: "dm",
          entityId: "salt-marsh",
        },
      ],
      routes: [
        {
          id: "coast-road",
          name: "Coast Road",
          waypoints: [[0, 0], { entityId: "harbour-master" }],
          speed: 24,
          visibility: { main: "player" },
        },
      ],
      pins: [{ note: "harbour-master", x: 120, y: 340, visibility: { main: "player" } }],
      sound: [
        {
          id: "gulls",
          points: [
            [0, 0],
            [50, 0],
            [50, 50],
          ],
          visibility: { main: "player" },
          bed: { src: "atlas/assets/audio/gulls.ogg" },
        },
      ],
    },
  ],
  notes: {
    "harbour-master": {
      visibility: { main: "player", sandbox: "dm" },
      basedOn: "player",
      belongsTo: ["saltmere"],
    },
  },
});

const campaignSample = () => ({
  id: "main",
  name: "Main campaign",
  notes: "vault",
  maps: {
    varn: {
      state: "fogged",
      reveals: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
      ],
      conceals: [],
      featherPx: 24,
    },
    saltmere: { state: "open" },
  },
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
    const result = validateAtlasFileV2(atlasSample);
    expect(result).toEqual({ ok: true, value: atlasSample });
  });

  it("names a missing required field", () => {
    const { ocean: _ocean, ...noOcean } = atlasSample;
    expect(paths(validateAtlasFileV2(noOcean))).toEqual(["ocean"]);
    const noSea = { ...atlasSample, ocean: { width: 1, height: 1 } };
    expect(paths(validateAtlasFileV2(noSea))).toEqual(["ocean.sea"]);
  });

  it("rejects a schemaVersion other than 2", () => {
    expect(paths(validateAtlasFileV2({ ...atlasSample, schemaVersion: 1 }))).toEqual(["schemaVersion"]);
  });

  it("names the bad onOcean entry", () => {
    const bad = { ...atlasSample, onOcean: [atlasSample.onOcean[0], { map: "x", x: 0, y: 0, scale: 0, rotation: 0 }] };
    expect(paths(validateAtlasFileV2(bad))).toEqual(["onOcean[1].scale"]);
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

  it("names a missing required field", () => {
    const sample = worldSample();
    delete (sample.maps[1] as { id?: string }).id;
    expect(paths(validateWorldFileV2(sample))).toEqual(["maps[1].id"]);
  });

  it("rejects a frame with a negative size, naming its path", () => {
    const sample = worldSample();
    sample.maps[1].frame!.width = -400;
    const errors = errorsOf(validateWorldFileV2(sample));
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe("maps[1].frame.width");
    expect(errors[0].message).toMatch(/greater than 0/);
  });

  it("rejects a zero frame height", () => {
    const sample = worldSample();
    sample.maps[1].frame!.height = 0;
    expect(paths(validateWorldFileV2(sample))).toEqual(["maps[1].frame.height"]);
  });

  it("rejects a per-campaign visibility with a non-string value", () => {
    const sample = worldSample();
    (sample.maps[1].pins![0].visibility as Record<string, unknown>).main = 3;
    expect(paths(validateWorldFileV2(sample))).toEqual(["maps[1].pins[0].visibility.main"]);
  });

  it("rejects a visibility that is neither a string nor a mapping", () => {
    const sample = worldSample();
    (sample.maps[0] as { visibility: unknown }).visibility = ["player"];
    expect(paths(validateWorldFileV2(sample))).toEqual(["maps[0].visibility"]);
  });

  it("keeps an invalid visibility string as written (the resolver makes it dm)", () => {
    const sample = worldSample();
    sample.maps[0].visibility = { main: "plyer", sandbox: "rumor" };
    (sample.maps[1].regions![0] as { visibility: string }).visibility = "secret";
    const result = validateWorldFileV2(sample);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maps[0].visibility).toEqual({ main: "plyer", sandbox: "rumor" });
    expect(result.value.maps[1].regions![0].visibility).toBe("secret");
  });

  it("keeps a missing visibility missing (the resolver makes it dm)", () => {
    const sample = worldSample();
    delete (sample.maps[0] as { visibility?: unknown }).visibility;
    const result = validateWorldFileV2(sample);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.maps[0].visibility).toBeUndefined();
  });

  it("keeps a note entry with no basedOn (rule 6 resolves it to dm)", () => {
    const sample = worldSample();
    delete (sample.notes["harbour-master"] as { basedOn?: string }).basedOn;
    expect(validateWorldFileV2(sample).ok).toBe(true);
  });

  it("requires frame and enterZoom on a child map, and refuses them on a top-level map", () => {
    const child = worldSample();
    delete (child.maps[1] as { frame?: unknown }).frame;
    delete (child.maps[1] as { enterZoom?: unknown }).enterZoom;
    expect(paths(validateWorldFileV2(child))).toEqual(["maps[1].frame", "maps[1].enterZoom"]);

    const top = worldSample();
    (top.maps[0] as { frame?: unknown }).frame = { x: 0, y: 0, width: 1, height: 1, rotation: 0 };
    expect(paths(validateWorldFileV2(top))).toEqual(["maps[0].frame"]);
  });

  it("reports every structural error at once", () => {
    const sample = worldSample();
    (sample.maps[0].layers[0] as { src: unknown }).src = 5;
    (sample.maps[1].zoom as { min: number }).min = 10;
    (sample.maps[1].routes![0].waypoints as unknown[]).push([1]);
    expect(paths(validateWorldFileV2(sample))).toEqual([
      "maps[0].layers[0].src",
      "maps[1].zoom",
      "maps[1].routes[0].waypoints[2]",
    ]);
  });

  it("quotes note ids that aren't plain ids in paths", () => {
    const sample = worldSample();
    (sample.notes as Record<string, unknown>)["the old.mill"] = { visibility: 7 };
    expect(paths(validateWorldFileV2(sample))).toEqual(['notes["the old.mill"].visibility']);
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
    (sample.maps.saltmere as { state: string }).state = "revealed";
    expect(paths(validateCampaignFileV2(sample))).toEqual(["maps.saltmere.state"]);
  });

  it("reads a missing notes field as hidden, never vault", () => {
    const { notes: _notes, ...noNotes } = campaignSample();
    const result = validateCampaignFileV2(noNotes);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.notes).toBe("hidden");
  });

  it("rejects a notes value other than vault or hidden", () => {
    expect(paths(validateCampaignFileV2({ ...campaignSample(), notes: "player" }))).toEqual(["notes"]);
  });

  it("reads a missing maps field as no maps (every map unknown)", () => {
    const result = validateCampaignFileV2({ id: "sandbox", name: "Sandbox" });
    expect(result).toEqual({ ok: true, value: { id: "sandbox", name: "Sandbox", maps: {}, notes: "hidden" } });
  });

  it("rejects a malformed fog polygon and a negative feather", () => {
    const sample = campaignSample();
    (sample.maps.varn.reveals[0] as unknown[])[1] = "x";
    sample.maps.varn.featherPx = -1;
    expect(paths(validateCampaignFileV2(sample))).toEqual([
      "maps.varn.reveals[0][1]",
      "maps.varn.featherPx",
    ]);
  });
});
