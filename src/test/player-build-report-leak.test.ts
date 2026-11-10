// @vitest-environment node
/**
 * R-06: world.yaml warnings name region and route ids, and those ids are
 * slugs of their names. A DM-only region or route that trips a warning must
 * not reach the player atlas.json through `buildReport.warnings`; the DM
 * build keeps the full warning.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBuildCli } from "./helpers/buildInProcess";

const ROOT = path.resolve(__dirname, "../..");

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-report-leak-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(rel: string, body: string) {
  const full = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

// Each DM-only item trips a different world.yaml warning: a region nested
// under the wrong map, a region with a typo'd visibility (loads as dm), a
// route nested under the wrong map, and a duplicated route id. (A DM region
// the loader drops, too few points or a repeated id, now fails the player
// build instead: ADR-0004 rule 9, src/test/build/player-build-resolver.test.ts.)
const WORLD_YAML = `maps:
  - id: m1
    name: Map One
    width: 1000
    height: 1000
    layers: []
    regions:
      - id: drow-crypt-entrance
        mapId: elsewhere
        name: Drow Crypt Entrance
        visibility: dm
        points: [[0,0],[10,0],[10,10]]
      - id: lichs-sanctum
        name: Lich's Sanctum
        visibility: dmm
        points: [[0,0],[10,0],[10,10]]
      - id: open-field
        name: Open Field
        visibility: player
        points: [[0,0],[20,0],[20,20]]
    routes:
      - id: assassins-tunnel
        mapId: elsewhere
        name: Assassins Tunnel
        visibility: dm
        waypoints: [[0,0],[50,50]]
      - id: kings-road
        name: King's Road
        visibility: player
        waypoints: [[0,0],[60,60]]
routes:
  - id: smugglers-run
    mapId: m1
    name: Smugglers Run
    visibility: dm
    waypoints: [[0,0],[70,70]]
  - id: smugglers-run
    mapId: m1
    name: Smugglers Run Again
    visibility: dm
    waypoints: [[0,0],[80,80]]
`;

const SECRET_IDS = ["drow-crypt-entrance", "lichs-sanctum", "assassins-tunnel", "smugglers-run"];

function setup() {
  write(
    "atlas.config.json",
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "w",
      include: ["**/*.md"],
      exclude: [],
    }),
  );
  write("content/w/_atlas/world.yaml", WORLD_YAML);
  write(
    "content/w/alice.md",
    "---\ntitle: Alice\natlas:\n  type: npc\n  visibility: player\n---\nbody\n",
  );
}

async function build(mode: "player" | "dm", outName: string) {
  const outDir = path.join(tmp, outName);
  const args = ["--config", path.join(tmp, "atlas.config.json"), "--out", outDir];
  const r = await runBuildCli(mode === "player" ? ["--player", ...args] : args, ROOT);
  expect(r.status, r.stdout + r.stderr).toBe(0);
  return fs.readFileSync(path.join(outDir, "atlas.json"), "utf8");
}

// Player-visible routes that warn and then get dropped from the player build:
// one through a fogged placement (waypoint miss), one through a DM entity
// (spoiler-leak warning, then a miss because DM placements never ship).
const FOG_WORLD_YAML = `schemaVersion: 1
maps:
  - id: m1
    name: Map One
    width: 1000
    height: 1000
    layers: []
    fog:
      enabled: true
      reveals:
        - [[0,0],[100,0],[100,100],[0,100]]
    routes:
      - id: veiled-pass
        name: Veiled Pass
        visibility: player
        waypoints: [[10,10], { entityId: bob }]
      - id: cult-road
        name: Cult Road
        visibility: player
        waypoints: [[10,10], { entityId: cult-lair }]
      - id: kings-road
        name: King's Road
        visibility: player
        waypoints: [[10,10],[50,50]]
`;

function setupFog() {
  write(
    "atlas.config.json",
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "w",
      include: ["**/*.md"],
      exclude: [],
    }),
  );
  write("content/w/_atlas/world.yaml", FOG_WORLD_YAML);
  write(
    "content/w/bob.md",
    "---\ntitle: Bob\natlas:\n  type: npc\n  visibility: player\n  placements:\n    - mapId: m1\n      x: 500\n      y: 500\n---\nbody\n",
  );
  write(
    "content/w/cult-lair.md",
    "---\ntitle: Cult Lair\natlas:\n  type: location\n  visibility: dm\n  placements:\n    - mapId: m1\n      x: 20\n      y: 20\n---\nbody\n",
  );
}

describe("player build report — world.yaml warnings (R-06)", () => {
  it("never puts a DM-only region or route id anywhere in the player atlas.json", async () => {
    setup();
    const raw = await build("player", "out-player");
    for (const id of SECRET_IDS) expect(raw, id).not.toContain(id);
    const atlas = JSON.parse(raw) as { buildReport: { warnings: string[] } };
    expect(atlas.buildReport.warnings.some((w) => /world\.yaml warnings hidden/.test(w))).toBe(
      true,
    );
  });

  it("keeps the full world.yaml warnings in the DM build", async () => {
    setup();
    const raw = await build("dm", "out-dm");
    const atlas = JSON.parse(raw) as { buildReport: { warnings: string[] } };
    const text = atlas.buildReport.warnings.join("\n");
    for (const id of SECRET_IDS) expect(text, id).toContain(id);
  });

  it("ships no warning about a route the player build drops after warning (fog, DM waypoint)", async () => {
    setupFog();
    const raw = await build("player", "out-player");
    const atlas = JSON.parse(raw) as { maps: Array<{ routes?: Array<{ id: string }> }> };
    expect((atlas.maps[0].routes ?? []).map((r) => r.id)).toEqual(["kings-road"]);
    for (const id of ["veiled-pass", "cult-road", "cult-lair"]) expect(raw, id).not.toContain(id);

    const dm = JSON.parse(await build("dm", "out-dm")) as { buildReport: { warnings: string[] } };
    const text = dm.buildReport.warnings.join("\n");
    expect(text).toContain("cult-road");
  });
});
