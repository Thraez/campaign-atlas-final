/**
 * loadAtlasModel (R-12): version detection, v1 through the adapter, v2 with
 * every ADR-0003 cross-file rule, and every fail-closed path. Cross-file
 * failures mutate a temp copy of the committed v2 fixture, one rule per test.
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { AtlasModelError, loadAtlasModel, type ModelIssue } from "./loadAtlasModel";
import { loadWorldConfig } from "./loadWorldConfig";
import { parseNoteFields } from "./parseFrontmatter";
import { readContentFiles } from "./readContentFiles";
import { scanContentFolder } from "../../src/atlas/content/scanContentFolder";

const REPO = path.resolve(__dirname, "../..");
const FIX = path.join(REPO, "src/test/fixtures/atlas-model");
const REAL = path.join(REPO, "content");
const REAL_WORLD = "astrath-deeprealm";
const REAL_CONFIG = JSON.parse(fs.readFileSync(path.join(REPO, "atlas.config.json"), "utf8")) as {
  defaultWorld: string;
  include: string[];
  exclude: string[];
};
const EXCLUDE = ["**/_dm/**", "**/_drafts/**"];

const temps: string[] = [];
afterEach(() => {
  for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});

/** A temp copy of a fixture's content root. */
function copy(fixture: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-model-"));
  temps.push(dir);
  const root = path.join(dir, "content");
  fs.cpSync(path.join(FIX, fixture, "content"), root, { recursive: true });
  return root;
}

/** Load a YAML file under `root`, change it, write it back. */
function edit(root: string, rel: string, fn: (d: Record<string, any>) => void): void {
  const file = path.join(root, rel);
  const d = yaml.load(fs.readFileSync(file, "utf8")) as Record<string, any>;
  fn(d);
  fs.writeFileSync(file, yaml.dump(d));
}

function load(root: string, defaultWorld = "aldmoor", exclude: string[] = []) {
  return loadAtlasModel(root, { defaultWorld, exclude }, { root: path.dirname(root) });
}

/** The issues `fn` throws; fails the test if it doesn't throw AtlasModelError. */
function issuesOf(fn: () => unknown): ModelIssue[] {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AtlasModelError);
    return (e as AtlasModelError).issues;
  }
  throw new Error("expected AtlasModelError, but it loaded");
}

const ATLAS = "content/_atlas/atlas.yaml";
const ALDMOOR = "content/aldmoor/_atlas/world.yaml";
const BRINE = "content/brine/_atlas/world.yaml";
const MAIN = "content/_atlas/campaigns/main.yaml";

// ---------------------------------------------------------------------------

describe("loadAtlasModel: v1", () => {
  it("reads today's content as v1: one world, one campaign main", () => {
    const { model } = loadAtlasModel(REAL, { defaultWorld: REAL_WORLD }, { root: REPO });
    expect(model.schemaVersion).toBe(1);
    expect(model.ocean).toBeNull();
    expect(model.worlds).toHaveLength(1);
    expect(model.worlds[0].world).toEqual({ id: REAL_WORLD, name: "Astrath Deeprealm" });
    expect(model.campaigns.map((c) => c.id)).toEqual(["main"]);
    expect(model.campaigns[0].notes).toBe("vault");
  });

  it("round-trips today's world.yaml: the model holds everything loadWorldConfig reads", () => {
    const wc = loadWorldConfig(REAL, REAL_WORLD, REPO)!;
    const { model, warnings } = loadAtlasModel(REAL, { defaultWorld: REAL_WORLD }, { root: REPO });
    // Nothing the adapter adds: every v1 item made it into the model.
    expect(warnings).toEqual(wc.warnings);
    const world = model.worlds[0];
    const plain = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));

    // Maps, back in v1 shape.
    const maps = world.maps.map((m) => ({
      id: m.id,
      worldId: REAL_WORLD,
      name: m.name,
      width: m.width,
      height: m.height,
      layers: m.layers,
      scale: m.scale,
      grid: m.grid,
      oceanColor: m.oceanColor,
      water: world.water,
      wrapX: m.wrapX,
      soundscape: m.soundscape
        ? { ...m.soundscape, areas: m.sound ?? [] }
        : m.sound
          ? { areas: m.sound }
          : undefined,
    }));
    const wcMaps = wc.maps.map(({ regions: _r, routes: _t, fog: _f, ...m }) => m);
    expect(plain(maps)).toEqual(plain(wcMaps));

    // Regions and routes, with their map id put back.
    const regions = world.maps.flatMap((m) =>
      (m.regions ?? []).map((r) => ({ ...r, mapId: m.id })),
    );
    const routes = world.maps.flatMap((m) => (m.routes ?? []).map((r) => ({ ...r, mapId: m.id })));
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect(plain(regions.sort(byId))).toEqual(plain([...wc.regions].sort(byId)));
    expect(plain(routes.sort(byId))).toEqual(plain([...wc.routes].sort(byId)));

    // Enabled fog is campaign main's fogged state (fog colour has no v2 home).
    const fogged = Object.entries(model.campaigns[0].maps)
      .filter(([, s]) => s.state === "fogged")
      .map(([mapId, s]) => ({ mapId, enabled: true, reveals: s.reveals }));
    const wcFogs = wc.fogs
      .filter((f) => f.enabled)
      .map((f) => ({ mapId: f.mapId, enabled: true, reveals: f.reveals }));
    expect(plain(fogged)).toEqual(plain(wcFogs));

    expect(plain(world.calendar)).toEqual(plain(wc.calendar));
    expect(plain(world.import)).toEqual(plain(wc.importConfig));
    expect(plain(world.credits)).toEqual(plain(wc.credits));
    expect(plain(world.assetCredits)).toEqual(plain(wc.assetCredits));
    // Not vacuous: today's world has layers and sound areas to carry.
    expect(world.maps[0].layers.length).toBeGreaterThan(0);
    expect(world.maps[0].sound?.length).toBeGreaterThan(0);
  });

  it("round-trips the v1 fixture's regions, routes and fog (today's world has none)", () => {
    const root = path.join(FIX, "v1/content");
    const wc = loadWorldConfig(root, "emberwold", path.dirname(root))!;
    const { model } = load(root, "emberwold");
    const plain = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));
    const maps = model.worlds[0].maps;
    const known = new Set(maps.map((m) => m.id));
    const regions = maps.flatMap((m) => (m.regions ?? []).map((r) => ({ ...r, mapId: m.id })));
    const routes = maps.flatMap((m) => (m.routes ?? []).map((r) => ({ ...r, mapId: m.id })));
    expect(plain(regions)).toEqual(plain(wc.regions));
    // The one route on an unknown map is the only one dropped (with a warning).
    expect(plain(routes)).toEqual(plain(wc.routes.filter((r) => known.has(r.mapId))));
    expect(wc.routes).toHaveLength(2);
    for (const f of wc.fogs) {
      const s = model.campaigns[0].maps[f.mapId];
      expect(s).toEqual(f.enabled ? { state: "fogged", reveals: f.reveals } : { state: "open" });
    }
    expect(wc.fogs).toHaveLength(2);
  });

  it("reads a v1 fixture: water lifted, fog as campaign state, sound split out", () => {
    const { model, warnings } = load(path.join(FIX, "v1/content"), "emberwold");
    expect(model.schemaVersion).toBe(1);
    const w = model.worlds[0];
    expect(w.world).toEqual({ id: "emberwold", name: "The Emberwold" });
    expect(w.water).toEqual({ enabled: true, intensity: 0.4 });
    expect(w.maps.map((m) => m.id)).toEqual(["ember-overview", "ember-depths"]);
    const [ov] = w.maps;
    expect(ov.visibility).toBe("player");
    expect(ov.zoom).toEqual({ min: -6, max: 4 });
    expect(ov.regions?.find((r) => r.id === "odd-region")?.visibility).toBe("dm");
    expect(ov.routes?.map((r) => r.id)).toEqual(["slag-road"]);
    expect(ov.sound?.map((s) => s.id)).toEqual(["forge-roar", "ash-wind"]);
    expect(ov.soundscape).toEqual({ masterGain: 0.5 });
    expect(model.campaigns[0].maps["ember-overview"].state).toBe("fogged");
    expect(model.campaigns[0].maps["ember-depths"]).toEqual({ state: "open" });
    expect(w.calendar?.name).toBe("Ash Reckoning");
    expect(warnings.some((w) => w.includes('"too-small"'))).toBe(true);
    expect(warnings.some((w) => w.includes("odd-region"))).toBe(true);
  });

  it("gives a v1 world with no world.yaml the fallback overview map", () => {
    const root = path.join(REPO, "src/test/fixtures/atlas-build/content");
    const { model } = load(root, "test-world");
    expect(model.schemaVersion).toBe(1);
    expect(model.worlds[0].world.name).toBe("Test World");
    expect(model.worlds[0].maps.map((m) => m.id)).toEqual(["test-world-overview"]);
    expect(model.campaigns[0].maps["test-world-overview"]).toEqual({ state: "open" });
  });
});

describe("loadAtlasModel: v2", () => {
  it("loads the v2 fixture", () => {
    const { model, warnings } = load(path.join(FIX, "v2/content"));
    expect(model.schemaVersion).toBe(2);
    expect(model.ocean).toMatchObject({ width: 10000, height: 8000 });
    expect(model.worlds.map((w) => w.world.id)).toEqual(["aldmoor", "brine"]);
    expect(model.worlds[0]).not.toHaveProperty("schemaVersion");
    const ald = model.worlds[0].maps;
    expect(ald.map((m) => [m.id, m.parent])).toEqual([
      ["aldmoor-overview", undefined],
      ["millbrook", "aldmoor-overview"],
      ["millbrook-cellar", "millbrook"],
    ]);
    expect(model.onOcean.map((p) => p.map)).toEqual(["aldmoor-overview", "brine-isles"]);
    expect(model.campaigns.map((c) => c.id)).toEqual(["main", "sandbox"]);
    expect(model.campaigns[0].maps.millbrook).toMatchObject({ state: "fogged", featherPx: 12 });
    expect(model.worlds[0].notes?.miller.visibility).toEqual({ main: "player" });
    // Two warnings: the invalid visibility and the missing notes field.
    expect(warnings).toHaveLength(2);
  });

  it("keeps an invalid visibility as written, with a warning naming file, path and item", () => {
    const { model, warnings } = load(path.join(FIX, "v2/content"));
    const odd = model.worlds[0].maps[0].regions?.find((r) => r.id === "odd-region");
    expect(odd?.visibility).toBe("secret");
    expect(warnings).toContain(
      `${ALDMOOR}: maps[0].regions[1].visibility: region "odd-region" has invalid visibility "secret" — it resolves to "dm"`,
    );
  });

  it("reads a campaign file with no notes field as hidden, with a warning naming the file", () => {
    const { model, warnings } = load(path.join(FIX, "v2/content"));
    expect(model.campaigns[1].notes).toBe("hidden");
    expect(
      warnings.some(
        (w) => w.startsWith("content/_atlas/campaigns/sandbox.yaml") && w.includes("hidden"),
      ),
    ).toBe(true);
  });

  it("warns about an invalid per-campaign value and an invalid basedOn", () => {
    const root = copy("v2");
    edit(root, "aldmoor/_atlas/world.yaml", (d) => {
      d.maps[1].visibility = { main: "everyone" };
      d.notes.miller.basedOn = "nope";
    });
    const { warnings } = load(root);
    expect(
      warnings.some((w) => w.includes("maps[1].visibility.main") && w.includes('"everyone"')),
    ).toBe(true);
    expect(warnings.some((w) => w.includes("notes.miller.basedOn"))).toBe(true);
  });

  it("refuses a campaign notes value that is null or unknown", () => {
    for (const notes of [null, "public"]) {
      const root = copy("v2");
      edit(root, "_atlas/campaigns/main.yaml", (d) => {
        d.notes = notes;
      });
      const issues = issuesOf(() => load(root));
      expect(issues.some((i) => i.file === MAIN && i.path === "notes")).toBe(true);
    }
  });
});

describe("loadAtlasModel: version detection fails closed", () => {
  it("refuses atlas.yaml next to a v1 world.yaml", () => {
    const issues = issuesOf(() => load(path.join(FIX, "mix-atlas-and-v1-world/content")));
    expect(issues).toEqual([
      expect.objectContaining({
        file: ALDMOOR,
        path: "schemaVersion",
        message: expect.stringMatching(/v1 world\.yaml/),
      }),
    ]);
  });

  it("refuses a v2 world.yaml with no atlas.yaml, as the default world or any other", () => {
    const root = path.join(FIX, "mix-v2-world-no-atlas/content");
    const asDefault = issuesOf(() => load(root, "aldmoor"));
    expect(asDefault[0].file).toBe(ALDMOOR);
    expect(asDefault[0].message).toMatch(/schemaVersion 2/);
    const asOther = issuesOf(() => load(root, "elsewhere"));
    expect(asOther).toEqual([
      expect.objectContaining({
        file: ALDMOOR,
        message: expect.stringMatching(/needs _atlas\/atlas\.yaml/),
      }),
    ]);
  });

  it("refuses campaign files with no atlas.yaml", () => {
    const root = copy("v2");
    fs.rmSync(path.join(root, "_atlas/atlas.yaml"));
    const issues = issuesOf(() => load(root, "elsewhere"));
    expect(
      issues.some(
        (i) => i.file === "content/_atlas/campaigns" && /need _atlas\/atlas\.yaml/.test(i.message),
      ),
    ).toBe(true);
  });

  it("refuses schemaVersion 3, in atlas.yaml or a v1 root's world.yaml", () => {
    const root = path.join(FIX, "version-3/content");
    expect(issuesOf(() => load(root))).toEqual([
      expect.objectContaining({
        file: ATLAS,
        path: "schemaVersion",
        message: expect.stringMatching(/newer than/),
      }),
    ]);
    const noAtlas = copy("version-3");
    fs.rmSync(path.join(noAtlas, "_atlas/atlas.yaml"));
    expect(issuesOf(() => load(noAtlas, "aldmoor"))[0].message).toMatch(/newer than/);
    expect(issuesOf(() => load(noAtlas, "elsewhere"))[0].message).toMatch(/newer than/);
  });

  it("refuses an atlas.yaml with no schemaVersion, or one that isn't a whole number", () => {
    for (const v of [undefined, 1, "2", 2.5]) {
      const root = copy("v2");
      edit(root, "_atlas/atlas.yaml", (d) => {
        if (v === undefined) delete d.schemaVersion;
        else d.schemaVersion = v;
      });
      const issues = issuesOf(() => load(root));
      expect(issues).toEqual([expect.objectContaining({ file: ATLAS, path: "schemaVersion" })]);
    }
  });

  it("refuses atlas.yml and campaign .yml files", () => {
    const root = copy("v2");
    fs.copyFileSync(path.join(root, "_atlas/atlas.yaml"), path.join(root, "_atlas/atlas.yml"));
    expect(issuesOf(() => load(root))[0].message).toMatch(/atlas\.yaml, not atlas\.yml/);

    const root2 = copy("v2");
    fs.copyFileSync(
      path.join(root2, "_atlas/campaigns/main.yaml"),
      path.join(root2, "_atlas/campaigns/extra.yml"),
    );
    expect(issuesOf(() => load(root2)).some((i) => /\.yaml, not \.yml/.test(i.message))).toBe(true);
  });
});

describe("loadAtlasModel: ADR-0003 cross-file rules", () => {
  /** Mutate a copy of the v2 fixture and return the issues it now throws. */
  function broken(fn: (root: string) => void): ModelIssue[] {
    const root = copy("v2");
    fn(root);
    return issuesOf(() => load(root));
  }

  it("a listed world must have a folder", () => {
    const issues = broken((r) => edit(r, "_atlas/atlas.yaml", (d) => d.worlds.push("ghost")));
    expect(issues).toEqual([
      expect.objectContaining({
        file: ATLAS,
        path: "worlds[2]",
        message: expect.stringMatching(/no folder/),
      }),
    ]);
  });

  it("a listed world's folder must have a world.yaml", () => {
    const issues = broken((r) => {
      fs.mkdirSync(path.join(r, "ghost"));
      edit(r, "_atlas/atlas.yaml", (d) => d.worlds.push("ghost"));
    });
    expect(issues[0]).toMatchObject({ file: "content/ghost/_atlas/world.yaml" });
  });

  it("a world folder with a world.yaml must be listed", () => {
    const issues = broken((r) => edit(r, "_atlas/atlas.yaml", (d) => (d.worlds = ["aldmoor"])));
    expect(issues.some((i) => i.file === BRINE && /not listed/.test(i.message))).toBe(true);
  });

  it("a world's id must match its folder", () => {
    const issues = broken((r) =>
      edit(r, "brine/_atlas/world.yaml", (d) => (d.world.id = "brine2")),
    );
    expect(issues).toEqual([expect.objectContaining({ file: BRINE, path: "world.id" })]);
  });

  it("a listed world can't be listed twice, nor a campaign", () => {
    const issues = broken((r) =>
      edit(r, "_atlas/atlas.yaml", (d) => {
        d.worlds.push("brine");
        d.campaigns.push("main");
      }),
    );
    expect(issues.some((i) => i.file === ATLAS && i.path.startsWith("worlds"))).toBe(true);
    expect(issues.some((i) => i.file === ATLAS && i.path.startsWith("campaigns"))).toBe(true);
  });

  it("an unsafe world or campaign id is refused", () => {
    const issues = broken((r) =>
      edit(r, "_atlas/atlas.yaml", (d) => {
        d.worlds.push("../escape");
        d.campaigns.push("../escape");
      }),
    );
    expect(issues.some((i) => i.path === "worlds[2]")).toBe(true);
    expect(issues.some((i) => i.path === "campaigns[2]")).toBe(true);
  });

  it("a listed campaign must have a file", () => {
    const issues = broken((r) => edit(r, "_atlas/atlas.yaml", (d) => d.campaigns.push("ghost")));
    expect(issues).toEqual([expect.objectContaining({ file: ATLAS, path: "campaigns[2]" })]);
  });

  it("a campaign file must be listed", () => {
    const issues = broken((r) => edit(r, "_atlas/atlas.yaml", (d) => (d.campaigns = ["main"])));
    expect(
      issues.some(
        (i) => i.file === "content/_atlas/campaigns/sandbox.yaml" && /not listed/.test(i.message),
      ),
    ).toBe(true);
  });

  it("a campaign's id must match its file name", () => {
    const issues = broken((r) => edit(r, "_atlas/campaigns/main.yaml", (d) => (d.id = "other")));
    expect(issues).toEqual([expect.objectContaining({ file: MAIN, path: "id" })]);
  });

  it("map ids are unique across every world", () => {
    const issues = broken((r) =>
      edit(r, "brine/_atlas/world.yaml", (d) => (d.maps[0].id = "millbrook")),
    );
    expect(issues.some((i) => /already used/.test(i.message) && i.message.includes(ALDMOOR))).toBe(
      true,
    );
  });

  it("a parent must exist", () => {
    const issues = broken((r) =>
      edit(r, "aldmoor/_atlas/world.yaml", (d) => (d.maps[2].parent = "ghost")),
    );
    expect(issues).toEqual([expect.objectContaining({ file: ALDMOOR, path: "maps[2].parent" })]);
  });

  it("a parent must be in the same world", () => {
    const issues = broken((r) =>
      edit(r, "brine/_atlas/world.yaml", (d) => {
        d.maps[0].parent = "aldmoor-overview";
        d.maps[0].frame = { x: 0, y: 0, width: 10, height: 10, rotation: 0 };
        d.maps[0].enterZoom = 1;
      }),
    );
    expect(issues.some((i) => i.file === BRINE && /same world/.test(i.message))).toBe(true);
  });

  it("the map tree has no cycle, and each cycle is reported once", () => {
    const issues = broken((r) =>
      edit(r, "aldmoor/_atlas/world.yaml", (d) => {
        d.maps[0].parent = "millbrook-cellar";
        d.maps[0].frame = { x: 0, y: 0, width: 10, height: 10, rotation: 0 };
        d.maps[0].enterZoom = 1;
      }),
    );
    const cycles = issues.filter((i) => /cycle/.test(i.message));
    expect(cycles).toHaveLength(1);
    expect(cycles[0].message).toMatch(/aldmoor-overview|millbrook/);
  });

  it("every top-level map is on the ocean", () => {
    const issues = broken((r) => edit(r, "_atlas/atlas.yaml", (d) => d.onOcean.pop()));
    expect(issues).toEqual([
      expect.objectContaining({
        file: ATLAS,
        path: "onOcean",
        message: expect.stringMatching(/"brine-isles"/),
      }),
    ]);
  });

  it("a top-level map is on the ocean once", () => {
    const issues = broken((r) =>
      edit(r, "_atlas/atlas.yaml", (d) => d.onOcean.push({ ...d.onOcean[0] })),
    );
    expect(issues.some((i) => /twice/.test(i.message))).toBe(true);
  });

  it("onOcean names no child map and no unknown map", () => {
    const child = broken((r) =>
      edit(r, "_atlas/atlas.yaml", (d) =>
        d.onOcean.push({ map: "millbrook", x: 0, y: 0, scale: 1, rotation: 0 }),
      ),
    );
    expect(child.some((i) => /only top-level maps/.test(i.message))).toBe(true);
    const unknown = broken((r) =>
      edit(r, "_atlas/atlas.yaml", (d) =>
        d.onOcean.push({ map: "ghost", x: 0, y: 0, scale: 1, rotation: 0 }),
      ),
    );
    expect(unknown.some((i) => /unknown map "ghost"/.test(i.message))).toBe(true);
  });

  it("a per-campaign visibility key must be a listed campaign, wherever it is", () => {
    const issues = broken((r) =>
      edit(r, "aldmoor/_atlas/world.yaml", (d) => {
        d.maps[0].regions[0].visibility.ghost = "player";
        d.maps[1].pins[0].visibility = { ghost: "player" };
        d.maps[2].sound[0].visibility = { ghost: "player" };
        d.notes.miller.visibility = { ghost: "player" };
        d.maps[1].visibility = { ghost: "player" };
        d.maps[0].routes[0].visibility = { ghost: "player" };
      }),
    );
    expect(issues.map((i) => i.path).sort()).toEqual(
      [
        "maps[0].regions[0].visibility.ghost",
        "maps[0].routes[0].visibility.ghost",
        "maps[1].visibility.ghost",
        "maps[1].pins[0].visibility.ghost",
        "maps[2].sound[0].visibility.ghost",
        "notes.miller.visibility.ghost",
      ].sort(),
    );
  });

  it("a campaign file names only known maps", () => {
    const issues = broken((r) =>
      edit(r, "_atlas/campaigns/main.yaml", (d) => (d.maps.ghost = { state: "open" })),
    );
    expect(issues).toEqual([expect.objectContaining({ file: MAIN, path: "maps.ghost" })]);
  });

  it("a v2 note can't place itself on a map", () => {
    for (const fm of ["placements: []", "x: 1\n  y: 2"]) {
      const issues = broken((r) =>
        fs.writeFileSync(
          path.join(r, "aldmoor/npcs/pinned.md"),
          `---\natlas:\n  type: npc\n  ${fm}\n---\n\nText.\n`,
        ),
      );
      expect(issues.every((i) => i.file === "content/aldmoor/npcs/pinned.md")).toBe(true);
      expect(issues[0].path).toMatch(/^atlas\.(placements|x|y)$/);
    }
  });

  it("a v2 note whose frontmatter can't be read is refused", () => {
    const issues = broken((r) =>
      fs.writeFileSync(path.join(r, "aldmoor/npcs/bad.md"), "---\natlas: [unclosed\n---\n"),
    );
    expect(issues).toEqual([
      expect.objectContaining({ file: "content/aldmoor/npcs/bad.md", path: "frontmatter" }),
    ]);
  });

  it("reports every problem at once, in one error naming each file", () => {
    const root = copy("v2");
    edit(root, "_atlas/campaigns/main.yaml", (d) => (d.maps.ghost = { state: "open" }));
    edit(root, "aldmoor/_atlas/world.yaml", (d) => (d.maps[2].parent = "ghost"));
    let err: unknown;
    try {
      load(root);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AtlasModelError);
    const msg = (err as Error).message;
    expect(msg).toMatch(/^2 problems/);
    expect(msg).toContain(`${MAIN}: maps.ghost:`);
    expect(msg).toContain(`${ALDMOOR}: maps[2].parent:`);
  });
});

describe("loadAtlasModel: notes and v1 pins", () => {
  it("round-trips today's placements: every placed note the build reads is a pin on its map", () => {
    const { model, notes } = loadAtlasModel(REAL, REAL_CONFIG, { root: REPO });
    // What the build reads today, by its own path.
    const scan = scanContentFolder(readContentFiles(REAL, REPO), REAL_CONFIG);
    const expected = scan.notes.flatMap((n) =>
      (parseNoteFields(n).atlas.placements ?? []).map((p) => ({
        note: n.id,
        mapId: p.mapId ?? model.worlds[0].maps[0].id,
        x: p.x,
        y: p.y,
        visibility: n.visibility,
      })),
    );
    const pins = model.worlds[0].maps.flatMap((m) =>
      (m.pins ?? []).map((p) => ({ ...p, mapId: m.id })),
    );
    const key = (p: { note: string; x: number }) => `${p.note}:${p.x}`;
    expect(pins.sort((a, b) => key(a).localeCompare(key(b)))).toEqual(
      expected.sort((a, b) => key(a).localeCompare(key(b))),
    );
    expect(pins.length).toBeGreaterThanOrEqual(6);
    // And every note the build reads comes back, in the default world.
    expect(notes.map((n) => n.note.relPath).sort()).toEqual(
      scan.notes.map((n) => n.relPath).sort(),
    );
    expect(new Set(notes.map((n) => n.world))).toEqual(new Set([REAL_WORLD]));
  });

  it("puts v1 placements on their maps, the first map by default, legacy x/y as a fallback", () => {
    const { model, warnings } = load(path.join(FIX, "v1/content"), "emberwold", EXCLUDE);
    const [ov, depths] = model.worlds[0].maps;
    expect(ov.pins).toEqual([
      { note: "hermit", x: 300, y: 400, visibility: "rumor" },
      { note: "smith", x: 10, y: 20, visibility: "player" },
      { note: "smith", x: 7, y: 8, visibility: "player" },
      { note: "vault-keeper", x: 50, y: 60, visibility: "dm" },
    ]);
    expect(depths.pins).toEqual([{ note: "smith", x: 5, y: 6, visibility: "player" }]);
    // A placement on an unknown map is dropped (as the build drops it), with a warning.
    expect(warnings.some((w) => w.includes("smith") && w.includes('"no-such-map"'))).toBe(true);
    // A placement behind a secret can't ship from the model: dm, with a warning.
    expect(warnings.some((w) => w.includes("vault-keeper.md") && w.includes("hidden-door"))).toBe(
      true,
    );
  });

  it("leaves folder-excluded notes out of the notes and the pins", () => {
    const { model, notes } = load(path.join(FIX, "v1/content"), "emberwold", EXCLUDE);
    const pinned = model.worlds[0].maps.flatMap((m) => (m.pins ?? []).map((p) => p.note));
    expect(pinned).not.toContain("spy");
    expect(notes.map((n) => n.note.id)).not.toContain("spy");
    expect(notes.map((n) => n.note.id).sort()).toEqual([
      "hermit",
      "smith",
      "unplaced",
      "vault-keeper",
    ]);
    expect(notes.every((n) => n.world === "emberwold")).toBe(true);
  });

  it("returns v2 notes with their world folder; a note outside every world gets none", () => {
    const { notes } = load(path.join(FIX, "v2/content"), "aldmoor", EXCLUDE);
    const byId = Object.fromEntries(notes.map((n) => [n.note.id, n]));
    expect(Object.keys(byId).sort()).toEqual(["miller", "stray"]);
    expect(byId.miller.world).toBe("aldmoor");
    expect(byId.miller.file).toBe("content/aldmoor/npcs/miller.md");
    expect(byId.miller.note.visibility).toBe("player");
    expect(byId.stray.world).toBe("");
  });

  it("checks folder-excluded v2 notes for pins too", () => {
    const root = copy("v2");
    fs.writeFileSync(
      path.join(root, "aldmoor/_dm/mole.md"),
      "---\natlas:\n  type: npc\n  placements:\n    - { x: 1, y: 2 }\n---\n",
    );
    const issues = issuesOf(() => load(root, "aldmoor", EXCLUDE));
    expect(issues).toEqual([
      expect.objectContaining({ file: "content/aldmoor/_dm/mole.md", path: "atlas.placements" }),
    ]);
  });
});

describe("loadAtlasModel: symlinks are refused", () => {
  it("a symlinked note file or note folder, in v2 and v1", () => {
    for (const fixture of ["v2", "v1"]) {
      const world = fixture === "v2" ? "aldmoor" : "emberwold";
      const root = copy(fixture);
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-outside-"));
      temps.push(outside);
      fs.writeFileSync(
        path.join(outside, "pinned.md"),
        "---\natlas:\n  placements:\n    - { x: 1, y: 2 }\n---\n",
      );
      fs.symlinkSync(path.join(outside, "pinned.md"), path.join(root, world, "linked.md"));
      fs.symlinkSync(outside, path.join(root, world, "linked-folder"));
      const issues = issuesOf(() => load(root, world));
      expect(issues.map((i) => i.file).sort()).toEqual([
        `content/${world}/linked-folder`,
        `content/${world}/linked.md`,
      ]);
      expect(issues.every((i) => /is a symlink/.test(i.message))).toBe(true);
    }
  });

  it("a symlinked campaign file says so, not that the file is missing", () => {
    const root = copy("v2");
    const main = path.join(root, "_atlas/campaigns/main.yaml");
    const real = path.join(root, "aldmoor/main-campaign.yaml");
    fs.renameSync(main, real);
    fs.symlinkSync(real, main);
    const issues = issuesOf(() => load(root));
    expect(issues).toEqual([
      expect.objectContaining({ file: MAIN, message: expect.stringMatching(/is a symlink/) }),
    ]);
  });

  it("a listed world can't be a symlinked folder or lead outside the root", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-outside-"));
    temps.push(outside);
    const root = copy("v2");
    fs.cpSync(path.join(root, "brine"), path.join(outside, "brine"), { recursive: true });
    fs.rmSync(path.join(root, "brine"), { recursive: true });
    fs.symlinkSync(path.join(outside, "brine"), path.join(root, "brine"));
    // Caught by the content-root walk, before atlas.yaml is read.
    expect(issuesOf(() => load(root))).toEqual([
      expect.objectContaining({
        file: "content/brine",
        message: expect.stringMatching(/is a symlink/),
      }),
    ]);

    // A real folder whose world.yaml links out of the root.
    const root2 = copy("v2");
    const file = path.join(root2, "brine/_atlas/world.yaml");
    fs.rmSync(file);
    fs.symlinkSync(path.join(outside, "brine/_atlas/world.yaml"), file);
    expect(issuesOf(() => load(root2))).toEqual([
      expect.objectContaining({
        file: BRINE,
        message: expect.stringMatching(/outside the content root/),
      }),
    ]);
  });
});
