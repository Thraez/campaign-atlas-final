// @vitest-environment node
/**
 * R-11b: the player build ships what the per-campaign resolver (ADR-0004)
 * decides for campaign `main`, read through R-12's v1 adapter. Fixture vaults
 * are temp roots, built in process: buildAtlas only plans the fog and audio
 * files and writeBuildOutput (which writes them) isn't called.
 *
 * - arch-02: a sound-only area with any part under fog doesn't ship.
 * - A region and a route under fog still don't ship; a ride-on sound area of a
 *   DM region still doesn't.
 * - A rule-8 name collision fails every player build, strict or not (exit
 *   10), naming both items; the player build report never names the hidden
 *   one (R-06).
 * - Rule 9 (R-11e): a hidden region too malformed to test fails every player
 *   build (exit 12), naming map and region; a shipped note whose every pin a
 *   hidden region hides warns, naming note and region, never in the report.
 * - An orphan `notes:` entry fails the build (exit 11), naming world and key.
 *   v1 content has no `notes:` entries, so the v2 fixture drives that gate.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import { buildAtlas } from "../../../scripts/build-atlas";
import { loadAtlasModel } from "../../../scripts/atlas/loadAtlasModel";
import { playerResolution, resolverFailure } from "../../../scripts/atlas/playerResolution";
import { resolveCampaign } from "@/atlas/content/resolveCampaign";
import type { MapDocument, SoundArea } from "@/atlas/content/schema";

const ROOT = path.resolve(__dirname, "../../..");
const tmps: string[] = [];
afterEach(() => {
  for (const t of tmps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});

function vault(worldYaml: Record<string, unknown>, notes: Record<string, string>): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-resolver-build-"));
  tmps.push(tmp);
  const put = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), body);
  };
  put(
    "atlas.config.json",
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "w",
      include: ["**/*.md"],
      exclude: [],
    }),
  );
  put("content/w/_atlas/world.yaml", yaml.dump(worldYaml));
  for (const [rel, body] of Object.entries(notes)) put(`content/w/${rel}`, body);
  return tmp;
}

const note = (title: string, visibility: string, extra = "") =>
  `---\ntitle: ${title}\natlas:\n  type: settlement\n  visibility: ${visibility}\n${extra}---\nbody\n`;

const rect = (x0: number, y0: number, x1: number, y1: number) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const LIT = rect(10, 10, 100, 100);
/** Two corners in the lit half, two under fog. */
const HALF_FOGGED = rect(400, 10, 600, 100);
/** In the lit half, clear of every lit item (a dm region hides what it overlaps, rule 9). */
const DM_SPOT = rect(200, 600, 300, 700);

/** One 1000 x 1000 map whose fog reveals only its left half (x < 500). */
function foggedWorld(extra: Record<string, unknown> = {}, sound: unknown[] = []) {
  return {
    maps: [
      {
        id: "m1",
        name: "Map One",
        width: 1000,
        height: 1000,
        layers: [],
        fog: { enabled: true, reveals: [rect(0, 0, 500, 1000)] },
        soundscape: { areas: sound },
      },
    ],
    ...extra,
  };
}

const bed = (src: string) => ({ src: `atlas/assets/audio/${src}.ogg` });

async function build(root: string, player: boolean, strict = player) {
  return buildAtlas(root, { player, strict });
}

function map(project: { maps: MapDocument[] }): MapDocument {
  return project.maps.find((m) => m.id === "m1")!;
}

describe("player build: fog decided by the resolver", () => {
  const world = foggedWorld(
    {
      regions: [
        { id: "lit-region", mapId: "m1", name: "Lit", visibility: "player", points: LIT },
        { id: "fog-region", mapId: "m1", name: "Foggy", visibility: "player", points: HALF_FOGGED },
        // Lit, but apart from every lit item: rule 9 would hide what it overlaps.
        { id: "dm-region", mapId: "m1", name: "Secret", visibility: "dm", points: DM_SPOT },
      ],
      routes: [
        {
          id: "lit-route",
          mapId: "m1",
          name: "Lit Road",
          visibility: "player",
          waypoints: [
            [10, 10],
            [100, 100],
          ],
        },
        {
          id: "fog-route",
          mapId: "m1",
          name: "Fog Road",
          visibility: "player",
          waypoints: [
            [10, 10],
            [900, 900],
          ],
        },
      ],
    },
    [
      { id: "lit-sound", name: "Lit", visibility: "player", points: LIT, bed: bed("lit") },
      {
        id: "fog-sound",
        name: "Foggy",
        visibility: "player",
        points: HALF_FOGGED,
        bed: bed("fog"),
      },
      { id: "ride-lit", regionId: "lit-region", bed: bed("ride-lit") },
      { id: "ride-dm", regionId: "dm-region", visibility: "player", bed: bed("ride-dm") },
      { id: "ride-fog", regionId: "fog-region", bed: bed("ride-fog") },
    ],
  );
  const notes = { "harbor.md": note("Harbor", "player", "  x: 100\n  y: 100\n") };

  it("drops a sound-only area with a point under fog (arch-02); the lit one ships", async () => {
    const { project, report } = await build(vault(world, notes), true);
    expect(report.failure).toBeUndefined();
    const areas: SoundArea[] = map(project).soundscape?.areas ?? [];
    const srcs = areas.map((a) => a.bed.src);
    expect(srcs).toContain("atlas/assets/audio/lit.ogg");
    expect(srcs).not.toContain("atlas/assets/audio/fog.ogg");
    expect(JSON.stringify(project)).not.toContain("fog-sound");
  });

  it("still drops a region and a route under fog, and ride-on sound of a DM or fogged region", async () => {
    const { project } = await build(vault(world, notes), true);
    const m = map(project);
    expect((m.regions ?? []).map((r) => r.id)).toEqual(["lit-region"]);
    expect((m.routes ?? []).map((r) => r.id)).toEqual(["lit-route"]);
    const srcs = (m.soundscape?.areas ?? []).map((a) => a.bed.src).sort();
    expect(srcs).toEqual(["atlas/assets/audio/lit.ogg", "atlas/assets/audio/ride-lit.ogg"]);
    expect(project.placements.map((p) => p.entityId)).toEqual(["harbor"]);
  });

  it("the DM build still keeps everything", async () => {
    const { project } = await build(vault(world, notes), false);
    const m = map(project);
    expect((m.regions ?? []).map((r) => r.id)).toEqual(["lit-region", "fog-region", "dm-region"]);
    expect((m.routes ?? []).map((r) => r.id)).toEqual(["lit-route", "fog-route"]);
    expect(m.soundscape?.areas).toHaveLength(5);
  });

  it("drops a pin under fog", async () => {
    const fogged = { ...notes, "tower.md": note("Tower", "player", "  x: 900\n  y: 900\n") };
    const { project } = await build(vault(world, fogged), true);
    expect(project.placements.map((p) => p.entityId)).toEqual(["harbor"]);
  });
});

describe("player build: rule-8 name collisions", () => {
  const world = foggedWorld({
    regions: [{ id: "lair", mapId: "m1", name: "Vampire Lord", visibility: "player", points: LIT }],
  });
  const notes = {
    "harbor.md": note("Harbor", "player"),
    "vampire-lord.md": note("Vampire Lord", "dm"),
  };

  it("fail the strict player build with exit 10, naming both items", async () => {
    const { report } = await build(vault(world, notes), true, true);
    expect(report.failure?.exitCode).toBe(10);
    expect(report.failure?.message).toContain('note "vampire-lord"');
    expect(report.failure?.message).toContain('region "lair"');
  });

  it("fail a non-strict player build too (exit 10), and never reach its shipped report (R-06)", async () => {
    const { project, report } = await build(vault(world, notes), true, false);
    expect(report.failure?.exitCode).toBe(10);
    expect(report.failure?.message).toContain('note "vampire-lord"');
    expect(report.warnings.some((w) => w.includes('note "vampire-lord"'))).toBe(true);
    expect(JSON.stringify(project.buildReport)).not.toContain("vampire-lord");
  });

  it("don't affect the DM build", async () => {
    const { report } = await build(vault(world, notes), false, true);
    expect(report.failure).toBeUndefined();
  });
});

describe("orphan notes: entries fail the build", () => {
  it("names the world and the key (v2 fixture)", () => {
    const root = path.join(ROOT, "src/test/fixtures/atlas-model/v2/content");
    const { model, notes } = loadAtlasModel(
      root,
      { defaultWorld: "aldmoor", include: [], exclude: [] },
      { root: path.dirname(root) },
    );
    const clean = playerResolution(model, resolveCampaign(model, notes, "main"));
    expect(clean.orphanEntries).toEqual([]);

    const world = model.worlds[0];
    world.notes = {
      ...(world.notes ?? {}),
      "No Such Note": { visibility: "player", basedOn: "player" },
    };
    const res = playerResolution(model, resolveCampaign(model, notes, "main"));
    expect(res.orphanEntries).toHaveLength(1);
    const failure = resolverFailure(res);
    expect(failure?.exitCode).toBe(11);
    expect(failure?.message).toContain(`world "${world.world.id}"`);
    expect(failure?.message).toContain('"No Such Note"');
  });
});

describe("player build: rule 9, hidden regions (R-11e)", () => {
  const harbor = { "harbor.md": note("Harbor", "player", "  x: 100\n  y: 100\n") };

  describe("a hidden region too malformed to test", () => {
    const world = foggedWorld({
      regions: [
        {
          id: "drowned-crypt",
          mapId: "m1",
          name: "Drowned Crypt",
          visibility: "dm",
          // A non-finite point (YAML `.nan`): v1's world loader keeps it,
          // so the resolver sees a region it can't test. (A region with
          // fewer than 3 points never reaches it: the loader drops it.)
          points: [
            [10, 10],
            [90, Number.NaN],
            [10, 90],
          ],
        },
      ],
    });

    it.each([true, false])(
      "fails the player build (strict %s) with exit 12, naming map and region",
      async (strict) => {
        const { project, report } = await build(vault(world, harbor), true, strict);
        expect(report.failure?.exitCode).toBe(12);
        expect(report.failure?.message).toContain('map "m1"');
        expect(report.failure?.message).toContain('hidden region "drowned-crypt"');
        expect(JSON.stringify(project.buildReport)).not.toContain("drowned-crypt");
        // It hides what might lie inside it: everything rule 9 tests on its map.
        expect(project.placements).toEqual([]);
      },
    );

    it("doesn't affect the DM build", async () => {
      const { report } = await build(vault(world, harbor), false, true);
      expect(report.failure).toBeUndefined();
    });
  });

  describe("a shipped note whose every pin a hidden region hides", () => {
    const world = foggedWorld({
      regions: [
        {
          id: "drowned-crypt",
          mapId: "m1",
          name: "Drowned Crypt",
          visibility: "dm",
          points: rect(50, 50, 150, 150),
        },
      ],
    });

    it("ships the note with no pin and warns, naming note and region, never in the shipped report", async () => {
      const { project, report } = await build(vault(world, harbor), true, true);
      expect(report.failure).toBeUndefined();
      expect(project.placements).toEqual([]);
      expect(JSON.stringify(project)).toContain("Harbor");
      const warning = report.warnings.find((w) => w.includes('note "harbor"'));
      expect(warning).toContain('region "drowned-crypt"');
      expect(warning).toContain('map "m1"');
      expect(report.hiddenPinNotes).toEqual([warning]);
      expect(JSON.stringify(project.buildReport)).not.toContain("drowned-crypt");
      expect(JSON.stringify(project)).not.toContain("Drowned Crypt");
    });

    it("no warning when the pin sits outside the hidden region", async () => {
      const outside = { "harbor.md": note("Harbor", "player", "  x: 300\n  y: 300\n") };
      const { project, report } = await build(vault(world, outside), true, true);
      expect(report.failure).toBeUndefined();
      expect(project.placements.map((p) => p.entityId)).toEqual(["harbor"]);
      expect(report.hiddenPinNotes).toEqual([]);
    });
  });
});
