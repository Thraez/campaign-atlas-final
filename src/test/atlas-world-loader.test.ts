/**
 * Tests for scripts/atlas/loadWorldConfig.ts:
 *  - top-level regions/routes/fog still parse (legacy)
 *  - nested maps[].regions/routes/fog parse (Creator Cockpit exports)
 *  - mixed top-level + nested merges
 *  - duplicate ids warn
 *  - nested entries inherit parent map id
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadWorldConfig } from "../../scripts/atlas/loadWorldConfig";

let tmpRoot: string;
const WORLD = "test-world";

function writeWorldYaml(yaml: string) {
  const dir = path.join(tmpRoot, WORLD, "_atlas");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "world.yaml"), yaml);
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "world-loader-"));
});
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const baseMap = `
maps:
  - id: m1
    name: Main
    width: 1000
    height: 1000
`;

describe("loadWorldConfig — geometry formats", () => {
  it("loads top-level regions / routes / fog (legacy format)", () => {
    writeWorldYaml(`${baseMap}
regions:
  - id: r1
    mapId: m1
    name: R1
    points: [[0,0],[100,0],[100,100]]
    visibility: player
fog:
  - mapId: m1
    enabled: true
    reveals: [[[0,0],[10,0],[10,10],[0,10]]]
routes:
  - id: route-1
    mapId: m1
    name: Route 1
    visibility: player
    waypoints: [[0,0],[100,100]]
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.regions).toHaveLength(1);
    expect(cfg.regions[0].mapId).toBe("m1");
    expect(cfg.fogs).toHaveLength(1);
    expect(cfg.routes).toHaveLength(1);
  });

  it("loads nested maps[].regions/routes/fog (editor export format)", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    width: 1000
    height: 1000
    regions:
      - id: rn
        name: Nested
        points: [[0,0],[10,0],[10,10]]
        visibility: player
    routes:
      - id: route-n
        name: Nested Route
        visibility: player
        waypoints: [[0,0],[10,10]]
    fog:
      enabled: true
      reveals: [[[0,0],[5,0],[5,5],[0,5]]]
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.regions).toHaveLength(1);
    expect(cfg.regions[0].mapId).toBe("m1");
    expect(cfg.routes).toHaveLength(1);
    expect(cfg.routes[0].mapId).toBe("m1");
    expect(cfg.fogs).toHaveLength(1);
    expect(cfg.fogs[0].mapId).toBe("m1");
  });

  it("merges top-level + nested for the same map", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    width: 1000
    height: 1000
    regions:
      - id: rn
        name: Nested
        points: [[0,0],[10,0],[10,10]]
        visibility: player
regions:
  - id: rt
    mapId: m1
    name: TopLevel
    points: [[0,0],[20,0],[20,20]]
    visibility: dm
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.regions.map((r) => r.id).sort()).toEqual(["rn", "rt"]);
  });

  it("warns on duplicate region/route ids and on duplicate fog per map", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    width: 1000
    height: 1000
    regions:
      - id: dup
        name: A
        points: [[0,0],[10,0],[10,10]]
        visibility: player
    routes:
      - id: dup-route
        name: A
        visibility: player
        waypoints: [[0,0],[1,1]]
    fog:
      enabled: true
      reveals: []
regions:
  - id: dup
    mapId: m1
    name: B
    points: [[0,0],[5,0],[5,5]]
    visibility: player
routes:
  - id: dup-route
    mapId: m1
    name: B
    visibility: player
    waypoints: [[0,0],[2,2]]
fog:
  - mapId: m1
    enabled: true
    reveals: []
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.warnings.some((w) => w.includes("duplicate region id"))).toBe(true);
    expect(cfg.warnings.some((w) => w.includes("duplicate route id"))).toBe(true);
    expect(cfg.warnings.some((w) => w.includes("fog defined twice"))).toBe(true);
    // First definition wins.
    expect(cfg.regions.filter((r) => r.id === "dup")).toHaveLength(1);
    expect(cfg.routes.filter((r) => r.id === "dup-route")).toHaveLength(1);
    expect(cfg.fogs).toHaveLength(1);
  });

  it("warns when nested entry declares a different mapId than its parent", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    width: 1000
    height: 1000
    regions:
      - id: r-mismatch
        mapId: somewhere-else
        name: X
        points: [[0,0],[5,0],[5,5]]
        visibility: player
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.warnings.some((w) => w.includes("declares mapId"))).toBe(true);
    expect(cfg.regions[0].mapId).toBe("m1");
  });
});

describe("loadWorldConfig — import block", () => {
  it("parses a valid import block into importConfig", () => {
    writeWorldYaml(`${baseMap}
import:
  folders:
    npc: npcs
    settlement: settlements
  defaultFolder: imports
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.importConfig).toEqual({
      folders: { npc: "npcs", settlement: "settlements" },
      defaultFolder: "imports",
    });
    // No import-related warnings (a schema-version advisory may appear for the
    // unversioned baseMap fixture — filter it out before asserting).
    expect(cfg.warnings.filter((w) => !w.includes("schemaVersion"))).toHaveLength(0);
  });

  it("drops invalid folder values and emits a warning per dropped entry", () => {
    writeWorldYaml(`${baseMap}
import:
  folders:
    bad1: ".."
    bad2: "../../etc/passwd"
    ok: "npcs"
  defaultFolder: imports
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.importConfig.folders).toEqual({ ok: "npcs" });
    expect(cfg.warnings.some((w) => w.includes('".."'))).toBe(true);
    expect(cfg.warnings.some((w) => w.includes('"../../etc/passwd"'))).toBe(true);
  });

  it("rejects _atlas as a folder value and warns", () => {
    writeWorldYaml(`${baseMap}
import:
  folders:
    npc: _atlas
  defaultFolder: imports
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.importConfig.folders).toEqual({});
    expect(cfg.warnings.some((w) => w.includes('"_atlas"'))).toBe(true);
  });

  it("falls back to 'imports' when defaultFolder is invalid and warns", () => {
    writeWorldYaml(`${baseMap}
import:
  defaultFolder: ".."
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.importConfig.defaultFolder).toBe("imports");
    expect(cfg.warnings.some((w) => w.includes("defaultFolder"))).toBe(true);
  });

  it("absent import block yields { folders: {}, defaultFolder: 'imports' } with no warnings", () => {
    writeWorldYaml(baseMap);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.importConfig).toEqual({ folders: {}, defaultFolder: "imports" });
    // No import-related warnings (schema-version advisory filtered out).
    expect(cfg.warnings.filter((w) => !w.includes("schemaVersion"))).toHaveLength(0);
  });
});
