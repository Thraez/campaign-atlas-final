/**
 * Tests for scripts/atlas/loadWorldConfig.ts:
 *  - top-level regions/routes/fog still parse (legacy)
 *  - nested maps[].regions/routes/fog parse (Creator Cockpit exports)
 *  - mixed top-level + nested merges
 *  - duplicate ids warn
 *  - nested entries inherit parent map id
 *  - sanitizeScale branch coverage
 *  - sanitizeGrid branch coverage
 *  - calendar no-valid-months branch
 *  - normalizeVis, route edge-cases, region geometry validation
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

describe("loadWorldConfig — sanitizeScale", () => {
  it("valid scale without unitLabel defaults unitLabel to 'units'", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    scale:
      unitsPerPixel: 10
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.maps[0].scale).toEqual({ unitsPerPixel: 10, unitLabel: "units" });
    expect(cfg.warnings.filter((w) => w.includes("scale"))).toHaveLength(0);
  });

  it("valid scale with explicit unitLabel preserves it", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    scale:
      unitsPerPixel: 5
      unitLabel: miles
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.maps[0].scale).toEqual({ unitsPerPixel: 5, unitLabel: "miles" });
  });

  it("non-number unitsPerPixel warns and returns no scale", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    scale:
      unitsPerPixel: "fast"
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.maps[0].scale).toBeUndefined();
    expect(cfg.warnings.some((w) => w.includes("scale.unitsPerPixel"))).toBe(true);
  });

  it("unitsPerPixel of zero warns and returns no scale", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    scale:
      unitsPerPixel: 0
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.maps[0].scale).toBeUndefined();
    expect(cfg.warnings.some((w) => w.includes("scale.unitsPerPixel"))).toBe(true);
  });

  it("negative unitsPerPixel warns and returns no scale", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    scale:
      unitsPerPixel: -5
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.maps[0].scale).toBeUndefined();
    expect(cfg.warnings.some((w) => w.includes("scale.unitsPerPixel"))).toBe(true);
  });
});

describe("loadWorldConfig — sanitizeGrid", () => {
  it("valid square grid is returned with enabled defaulting to true", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    grid:
      kind: square
      size: 50
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.maps[0].grid).toEqual({ kind: "square", size: 50, color: undefined, enabled: true });
  });

  it("valid hex grid is accepted", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    grid:
      kind: hex
      size: 30
      color: "#aabbcc"
      enabled: false
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.maps[0].grid).toEqual({ kind: "hex", size: 30, color: "#aabbcc", enabled: false });
  });

  it("invalid grid kind warns and returns no grid", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    grid:
      kind: triangle
      size: 20
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.maps[0].grid).toBeUndefined();
    expect(cfg.warnings.some((w) => w.includes("grid.kind"))).toBe(true);
  });

  it("non-number grid size warns and returns no grid", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    grid:
      kind: square
      size: "big"
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.maps[0].grid).toBeUndefined();
    expect(cfg.warnings.some((w) => w.includes("grid.size"))).toBe(true);
  });

  it("grid size of zero warns and returns no grid", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    grid:
      kind: square
      size: 0
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.maps[0].grid).toBeUndefined();
    expect(cfg.warnings.some((w) => w.includes("grid.size"))).toBe(true);
  });
});

describe("loadWorldConfig — calendar", () => {
  it("valid calendar with all valid months is returned", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
calendar:
  name: Custom Cal
  epochName: AE
  daysPerWeek: 7
  months:
    - name: Frost
      days: 30
    - name: Thaw
      days: 28
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.calendar).toBeDefined();
    expect(cfg.calendar!.months).toHaveLength(2);
    expect(cfg.calendar!.name).toBe("Custom Cal");
    expect(cfg.calendar!.epochName).toBe("AE");
    expect(cfg.calendar!.daysPerWeek).toBe(7);
    expect(cfg.warnings.filter((w) => w.includes("calendar"))).toHaveLength(0);
  });

  it("calendar with no valid months warns and leaves calendar undefined", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
calendar:
  name: Broken Cal
  months:
    - name: 42
      days: 30
    - name: Good
      days: 0
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.calendar).toBeUndefined();
    expect(cfg.warnings.some((w) => w.includes("no valid months"))).toBe(true);
  });

  it("calendar with empty months array warns and leaves calendar undefined", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
calendar:
  name: Empty Cal
  months: []
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.calendar).toBeUndefined();
    expect(cfg.warnings.some((w) => w.includes("no valid months"))).toBe(true);
  });

  it("calendar with mixed valid/invalid months keeps only valid ones", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
calendar:
  months:
    - name: Valid
      days: 30
    - name: Bad
      days: 0
    - name: Also Valid
      days: 31
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.calendar).toBeDefined();
    expect(cfg.calendar!.months).toHaveLength(2);
    expect(cfg.calendar!.months.map((m) => m.name)).toEqual(["Valid", "Also Valid"]);
  });
});

describe("loadWorldConfig — normalizeVis, route edge-cases, region geometry", () => {
  it("region with undefined visibility defaults to 'player' with no warning", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
regions:
  - id: r1
    mapId: m1
    name: R1
    points: [[0,0],[10,0],[10,10]]
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.regions[0].visibility).toBe("player");
    expect(cfg.warnings.filter((w) => w.includes("visibility"))).toHaveLength(0);
  });

  it("region with invalid visibility warns and defaults to 'player'", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
regions:
  - id: r1
    mapId: m1
    name: R1
    points: [[0,0],[10,0],[10,10]]
    visibility: secret
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.regions[0].visibility).toBe("player");
    expect(cfg.warnings.some((w) => w.includes("invalid visibility"))).toBe(true);
  });

  it("region with fewer than 3 points warns and is dropped", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
regions:
  - id: r-small
    mapId: m1
    name: Tiny
    points: [[0,0],[10,0]]
  - id: r-ok
    mapId: m1
    name: OK
    points: [[0,0],[10,0],[10,10]]
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.regions.map((r) => r.id)).toEqual(["r-ok"]);
    expect(cfg.warnings.some((w) => w.includes("fewer than 3 points"))).toBe(true);
  });

  it("route with invalid mode warns and emits route with undefined mode", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
routes:
  - id: rt1
    mapId: m1
    name: Route
    mode: teleport
    waypoints: [[0,0],[10,10]]
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.routes[0].mode).toBeUndefined();
    expect(cfg.warnings.some((w) => w.includes("invalid mode"))).toBe(true);
  });

  it("route with string waypoint converts it to { entityId }", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
routes:
  - id: rt1
    mapId: m1
    name: Route
    waypoints:
      - "some-entity-id"
      - [5, 10]
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.routes[0].waypoints).toEqual([
      { entityId: "some-entity-id" },
      [5, 10],
    ]);
  });

  it("route with invalid waypoint warns and skips it", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
routes:
  - id: rt1
    mapId: m1
    name: Route
    waypoints:
      - [0, 0]
      - { bogus: true }
      - [10, 10]
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.routes[0].waypoints).toHaveLength(2);
    expect(cfg.warnings.some((w) => w.includes("skipped invalid waypoint"))).toBe(true);
  });
});

describe("loadWorldConfig — nested fog/route mapId handling", () => {
  it("warns when a nested fog declares a different mapId than its parent and uses the parent id", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    width: 1000
    height: 1000
    fog:
      mapId: somewhere-else
      enabled: true
      reveals: [[[0,0],[5,0],[5,5],[0,5]]]
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(
      cfg.warnings.some(
        (w) => w.includes("fog nested under map") && w.includes("somewhere-else")
      )
    ).toBe(true);
    expect(cfg.fogs).toHaveLength(1);
    expect(cfg.fogs[0].mapId).toBe("m1");
  });

  it("warns when a nested route declares a different mapId than its parent and uses the parent id", () => {
    writeWorldYaml(`
maps:
  - id: m1
    name: Main
    width: 1000
    height: 1000
    routes:
      - id: rt-mismatch
        mapId: somewhere-else
        name: X
        visibility: player
        waypoints: [[0,0],[10,10]]
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(
      cfg.warnings.some(
        (w) =>
          w.includes('route "rt-mismatch" nested under map') &&
          w.includes("somewhere-else")
      )
    ).toBe(true);
    expect(cfg.routes).toHaveLength(1);
    expect(cfg.routes[0].mapId).toBe("m1");
  });

  it("nested fog under an id-less map falls back to the fog's own mapId with no mismatch warning", () => {
    writeWorldYaml(`
maps:
  - name: NoId
    width: 1000
    height: 1000
    fog:
      mapId: explicit-fog-map
      enabled: true
      reveals: [[[0,0],[5,0],[5,5],[0,5]]]
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.fogs).toHaveLength(1);
    expect(cfg.fogs[0].mapId).toBe("explicit-fog-map");
    expect(cfg.warnings.some((w) => w.includes("fog nested under map"))).toBe(false);
  });

  it("nested route under an id-less map falls back to the route's own mapId with no mismatch warning", () => {
    writeWorldYaml(`
maps:
  - name: NoId
    width: 1000
    height: 1000
    routes:
      - id: rt-fallback
        mapId: explicit-route-map
        name: R
        visibility: player
        waypoints: [[0,0],[10,10]]
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.routes).toHaveLength(1);
    expect(cfg.routes[0].mapId).toBe("explicit-route-map");
    expect(cfg.warnings.some((w) => w.includes("nested under map"))).toBe(false);
  });
});
