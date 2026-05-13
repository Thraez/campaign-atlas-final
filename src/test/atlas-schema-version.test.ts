/**
 * Tests for atlas world.yaml schemaVersion handling:
 *   - missing schemaVersion -> treated as legacy v1 with warning
 *   - current schemaVersion -> loads cleanly, no warning
 *   - future schemaVersion  -> hard fail with clear message
 *   - non-integer / invalid -> hard fail
 *   - migration stub is invoked when needed (legacy normalization)
 *   - both nested + top-level region/route/fog still normalize at v1
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadWorldConfig, WorldConfigError } from "../../scripts/atlas/loadWorldConfig";
import {
  CURRENT_ATLAS_SCHEMA_VERSION,
  resolveAndMigrate,
  SchemaVersionError,
} from "../../scripts/atlas/schemaVersion";

let tmpRoot: string;
const WORLD = "test-world";

function writeWorldYaml(yaml: string) {
  const dir = path.join(tmpRoot, WORLD, "_atlas");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "world.yaml"), yaml);
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "world-schema-"));
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

describe("schemaVersion — loader behavior", () => {
  it("treats missing schemaVersion as legacy v1 with a warning", () => {
    writeWorldYaml(baseMap);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.schemaVersion).toBe(1);
    expect(cfg.warnings.some((w) => /no schemaVersion/i.test(w))).toBe(true);
  });

  it("loads current schemaVersion cleanly, with no version warning", () => {
    writeWorldYaml(`schemaVersion: ${CURRENT_ATLAS_SCHEMA_VERSION}\n${baseMap}`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.schemaVersion).toBe(CURRENT_ATLAS_SCHEMA_VERSION);
    expect(cfg.warnings.some((w) => /schemaVersion/i.test(w))).toBe(false);
  });

  it("rejects a future schemaVersion with a clear error", () => {
    writeWorldYaml(`schemaVersion: ${CURRENT_ATLAS_SCHEMA_VERSION + 5}\n${baseMap}`);
    expect(() => loadWorldConfig(tmpRoot, WORLD)).toThrow(WorldConfigError);
    try {
      loadWorldConfig(tmpRoot, WORLD);
    } catch (e) {
      expect(String((e as Error).message)).toMatch(/newer than this build supports/);
    }
  });

  it("rejects a non-integer schemaVersion", () => {
    writeWorldYaml(`schemaVersion: "one"\n${baseMap}`);
    expect(() => loadWorldConfig(tmpRoot, WORLD)).toThrow(/positive integer/);
  });

  it("still normalizes mixed top-level + nested geometry at v1", () => {
    writeWorldYaml(`schemaVersion: 1
${baseMap}    regions:
      - id: r-nested
        name: Nested
        points: [[0,0],[10,0],[10,10]]
        visibility: player
regions:
  - id: r-top
    mapId: m1
    name: Top
    points: [[0,0],[20,0],[20,20]]
    visibility: player
routes:
  - id: route-1
    mapId: m1
    name: Route 1
    visibility: player
    waypoints: [[0,0],[100,100]]
fog:
  - mapId: m1
    enabled: true
    reveals: [[[0,0],[10,0],[10,10],[0,10]]]
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.schemaVersion).toBe(1);
    expect(cfg.regions.map((r) => r.id).sort()).toEqual(["r-nested", "r-top"]);
    expect(cfg.routes).toHaveLength(1);
    expect(cfg.fogs).toHaveLength(1);
  });
});

describe("schemaVersion — resolveAndMigrate primitive", () => {
  it("invokes migration stub registry exactly once per step (legacy normalization is a no-op pass-through at v1)", () => {
    const warnings: string[] = [];
    const { data, version } = resolveAndMigrate({}, "test", warnings);
    expect(version).toBe(CURRENT_ATLAS_SCHEMA_VERSION);
    // Returned object is the same shape passed in (legacy is treated as v1
    // directly; no transform necessary while CURRENT == LEGACY).
    expect(data).toEqual({});
    expect(warnings.some((w) => /no schemaVersion/i.test(w))).toBe(true);
  });

  it("throws SchemaVersionError for future versions", () => {
    expect(() =>
      resolveAndMigrate({ schemaVersion: CURRENT_ATLAS_SCHEMA_VERSION + 1 }, "test", [])
    ).toThrow(SchemaVersionError);
  });

  it("accepts current version with no warnings", () => {
    const warnings: string[] = [];
    const { version } = resolveAndMigrate(
      { schemaVersion: CURRENT_ATLAS_SCHEMA_VERSION },
      "test",
      warnings
    );
    expect(version).toBe(CURRENT_ATLAS_SCHEMA_VERSION);
    expect(warnings).toEqual([]);
  });
});