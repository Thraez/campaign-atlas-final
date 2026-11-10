// @vitest-environment node
/**
 * R-02 (ADR-0001 addendum, Isak 2026-11-07): a world.yaml region, route or
 * sound-only area with no `visibility` key is `dm`. Fixture in, player build
 * out, the unmarked items absent; marked `player` controls still ship.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBuildCli } from "./helpers/buildInProcess";

const ROOT = path.resolve(__dirname, "../..");

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-missing-vis-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(rel: string, body: string) {
  const full = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

// Sound areas here are only the unmarked kind: a shipped area would make the
// player build copy its audio into the repo's public/ tree.
const WORLD_YAML = `maps:
  - id: m1
    name: Map One
    width: 1000
    height: 1000
    layers: []
    regions:
      - id: unmarked-nested-region
        name: Secret Grove
        points: [[500,500],[510,500],[510,510]]
      - id: marked-region
        name: Open Field
        visibility: player
        points: [[0,0],[20,0],[20,20]]
    routes:
      - id: unmarked-nested-route
        name: Smugglers Path
        waypoints: [[0,0],[50,50]]
      - id: marked-route
        name: King's Road
        visibility: player
        waypoints: [[0,0],[60,60]]
    soundscape:
      areas:
        - id: unmarked-sound-zone
          points: [[0,0],[30,0],[30,30]]
          bed: { src: audio/secret.ogg }
        - id: ride-on-unmarked
          regionId: unmarked-nested-region
          bed: { src: audio/grove.ogg }
regions:
  - id: unmarked-top-region
    mapId: m1
    name: Hidden Vale
    points: [[500,500],[540,500],[540,540]]
routes:
  - id: unmarked-top-route
    mapId: m1
    name: Tunnel
    waypoints: [[0,0],[70,70]]
`;

describe("player build — world.yaml items with no visibility are dm (R-02)", () => {
  it("leaves unmarked regions, routes and sound areas out; marked player ones ship", async () => {
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
    const outDir = path.join(tmp, "out");
    const r = await runBuildCli(
      ["--player", "--strict", "--config", path.join(tmp, "atlas.config.json"), "--out", outDir],
      ROOT,
    );
    expect(r.status, r.stdout + r.stderr).toBe(0);

    const raw = fs.readFileSync(path.join(outDir, "atlas.json"), "utf8");
    const atlas = JSON.parse(raw) as {
      maps: Array<{
        regions?: Array<{ id: string }>;
        routes?: Array<{ id: string }>;
        soundscape?: { areas?: unknown[] };
      }>;
    };
    const map = atlas.maps[0];
    expect((map.regions ?? []).map((x) => x.id)).toEqual(["marked-region"]);
    expect((map.routes ?? []).map((x) => x.id)).toEqual(["marked-route"]);
    expect(map.soundscape?.areas ?? []).toHaveLength(0);
    for (const secret of [
      "unmarked-nested-region",
      "Secret Grove",
      "unmarked-top-region",
      "Hidden Vale",
      "unmarked-nested-route",
      "Smugglers Path",
      "unmarked-top-route",
      "Tunnel",
      "unmarked-sound-zone",
      "secret.ogg",
      "grove.ogg",
    ]) {
      expect(raw, secret).not.toContain(secret);
    }
  });
});
