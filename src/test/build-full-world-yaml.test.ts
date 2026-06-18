/**
 * Tests for src/atlas/yaml/buildFullWorldYaml.ts — the pure function that
 * emits a complete world.yaml body from in-memory editor state.
 *
 * Pin the contract:
 *  - Dump → load round-trip preserves every field the editor controls.
 *  - The output is parsed back by the SAME loader the build pipeline uses
 *    (scripts/atlas/loadWorldConfig.ts), so we can be confident a Save
 *    won't tank the next rebuild.
 *  - The leading comment block of the existing file is preserved
 *    byte-for-byte (delegated to serializeWorldYaml — covered there too,
 *    but re-asserted here to keep this test self-contained).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildFullWorldYaml } from "@/atlas/yaml/buildFullWorldYaml";
import { loadWorldConfig } from "../../scripts/atlas/loadWorldConfig";
import type { FogOverlay, MapDocument, Region, Route, WorldCalendar } from "@/atlas/content/schema";

const WORLD = "test-world";

let tmpRoot: string;

function loadEmitted(yaml: string) {
  const dir = path.join(tmpRoot, WORLD, "_atlas");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "world.yaml"), yaml);
  return loadWorldConfig(tmpRoot, WORLD);
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "build-full-world-yaml-"));
});
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function makeMap(over: Partial<MapDocument> = {}): MapDocument {
  return {
    id: "m1",
    worldId: WORLD,
    name: "Main",
    width: 1000,
    height: 800,
    layers: [],
    ...over,
  };
}

describe("buildFullWorldYaml — round-trip", () => {
  it("emits a minimal valid world.yaml from one map with no geometry", () => {
    const out = buildFullWorldYaml({
      maps: [makeMap()],
      schemaVersion: 1,
      existing: null,
    });
    const cfg = loadEmitted(out)!;
    expect(cfg.schemaVersion).toBe(1);
    expect(cfg.maps).toHaveLength(1);
    expect(cfg.maps[0].id).toBe("m1");
    expect(cfg.maps[0].name).toBe("Main");
    expect(cfg.maps[0].width).toBe(1000);
    expect(cfg.maps[0].height).toBe(800);
    expect(cfg.maps[0].layers).toEqual([]);
  });

  it("preserves layers in order with rounded geometry", () => {
    const map = makeMap({
      layers: [
        { id: "L1", src: "atlas/assets/maps/a.png", x: 10.7, y: 20.2, width: 100.6, height: 50.4, opacity: 1, zIndex: 20 },
        { id: "L2", src: "atlas/assets/maps/b.png", x: 0, y: 0, width: 200, height: 100, opacity: 0.8, zIndex: 30 },
      ],
    });
    const out = buildFullWorldYaml({
      maps: [map],
      schemaVersion: 1,
      existing: null,
    });
    const cfg = loadEmitted(out)!;
    expect(cfg.maps[0].layers).toHaveLength(2);
    expect(cfg.maps[0].layers[0]).toMatchObject({ id: "L1", x: 11, y: 20, width: 101, height: 50, opacity: 1, zIndex: 20 });
    expect(cfg.maps[0].layers[1]).toMatchObject({ id: "L2", x: 0, y: 0, width: 200, height: 100, opacity: 0.8, zIndex: 30 });
  });

  it("preserves scale and grid metadata", () => {
    const map = makeMap({
      scale: { unitsPerPixel: 0.05, unitLabel: "mi" },
      grid: { kind: "hex", size: 5000, color: "rgba(255,255,255,0.06)", enabled: false },
      oceanColor: "#18313f",
      wrapX: false,
    });
    const out = buildFullWorldYaml({
      maps: [map],
      schemaVersion: 1,
      existing: null,
    });
    const cfg = loadEmitted(out)!;
    expect(cfg.maps[0].scale).toEqual({ unitsPerPixel: 0.05, unitLabel: "mi" });
    expect(cfg.maps[0].grid).toEqual({ kind: "hex", size: 5000, color: "rgba(255,255,255,0.06)", enabled: false });
    expect(cfg.maps[0].oceanColor).toBe("#18313f");
    expect(cfg.maps[0].wrapX).toBe(false);
  });

  it("round-trips regions nested under maps", () => {
    const region: Region = {
      id: "r1",
      mapId: "m1",
      name: "Forest",
      points: [[0, 0], [100, 0], [100, 100], [0, 100]],
      visibility: "player",
      color: "#7fb069",
      fillOpacity: 0.18,
      strokeOpacity: 0.85,
    };
    const out = buildFullWorldYaml({
      maps: [makeMap({ regions: [region] })],
      schemaVersion: 1,
      existing: null,
    });
    const cfg = loadEmitted(out)!;
    expect(cfg.regions).toHaveLength(1);
    expect(cfg.regions[0]).toMatchObject({
      id: "r1",
      mapId: "m1",
      name: "Forest",
      visibility: "player",
      color: "#7fb069",
    });
    expect(cfg.regions[0].points).toEqual([[0, 0], [100, 0], [100, 100], [0, 100]]);
  });

  it("round-trips routes with coord and entityId waypoints", () => {
    const route: Route = {
      id: "rt1",
      mapId: "m1",
      name: "Trade Road",
      visibility: "player",
      mode: "horse",
      speed: 6,
      color: "#cfd6dc",
      weight: 3,
      dashed: false,
      waypoints: [[0, 0], { entityId: "thornhold" }, [200, 200]],
    };
    const out = buildFullWorldYaml({
      maps: [makeMap({ routes: [route] })],
      schemaVersion: 1,
      existing: null,
    });
    const cfg = loadEmitted(out)!;
    expect(cfg.routes).toHaveLength(1);
    expect(cfg.routes[0].name).toBe("Trade Road");
    expect(cfg.routes[0].mode).toBe("horse");
    expect(cfg.routes[0].speed).toBe(6);
    expect(cfg.routes[0].waypoints).toEqual([
      [0, 0],
      { entityId: "thornhold" },
      [200, 200],
    ]);
  });

  it("round-trips fog with reveals", () => {
    const fog: FogOverlay = {
      mapId: "m1",
      enabled: true,
      color: "rgba(0,0,0,0.55)",
      reveals: [
        [[0, 0], [10, 0], [10, 10], [0, 10]],
        [[100, 100], [150, 100], [150, 150], [100, 150]],
      ],
    };
    const out = buildFullWorldYaml({
      maps: [makeMap({ fog })],
      schemaVersion: 1,
      existing: null,
    });
    const cfg = loadEmitted(out)!;
    expect(cfg.fogs).toHaveLength(1);
    expect(cfg.fogs[0].mapId).toBe("m1");
    expect(cfg.fogs[0].enabled).toBe(true);
    expect(cfg.fogs[0].reveals).toHaveLength(2);
    expect(cfg.fogs[0].reveals[0]).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });

  it("omits empty regions/routes/fog from output so loadWorldConfig stays terse", () => {
    const out = buildFullWorldYaml({
      maps: [makeMap()],
      schemaVersion: 1,
      existing: null,
    });
    // No `regions:`, `routes:`, `fog:` keys.
    expect(out).not.toMatch(/^\s*regions:\s*$/m);
    expect(out).not.toMatch(/^\s*routes:\s*$/m);
    expect(out).not.toMatch(/^\s*fog:\s*$/m);
  });

  it("emits fog when disabled-but-has-reveals or enabled-but-empty", () => {
    // Authored reveals but currently disabled — preserve them.
    const map = makeMap({
      fog: { mapId: "m1", enabled: false, reveals: [[[0, 0], [5, 0], [5, 5]]] },
    });
    const out = buildFullWorldYaml({ maps: [map], schemaVersion: 1, existing: null });
    const cfg = loadEmitted(out)!;
    expect(cfg.fogs).toHaveLength(1);
    expect(cfg.fogs[0].enabled).toBe(false);
    expect(cfg.fogs[0].reveals).toHaveLength(1);
  });

  it("round-trips a calendar", () => {
    const calendar: WorldCalendar = {
      name: "Sundering",
      epochName: "After Sundering",
      daysPerWeek: 7,
      months: [
        { name: "Frostfall", days: 30 },
        { name: "Sunwane", days: 31 },
      ],
    };
    const out = buildFullWorldYaml({
      maps: [makeMap()],
      schemaVersion: 1,
      calendar,
      existing: null,
    });
    const cfg = loadEmitted(out)!;
    expect(cfg.calendar).toEqual(calendar);
  });

  it("preserves map order across multiple maps", () => {
    const out = buildFullWorldYaml({
      maps: [
        makeMap({ id: "alpha", name: "Alpha" }),
        makeMap({ id: "beta", name: "Beta" }),
        makeMap({ id: "gamma", name: "Gamma" }),
      ],
      schemaVersion: 1,
      existing: null,
    });
    const cfg = loadEmitted(out)!;
    expect(cfg.maps.map((m) => m.id)).toEqual(["alpha", "beta", "gamma"]);
  });
});

describe("buildFullWorldYaml — comment preservation", () => {
  it("re-prepends the existing leading comment block", () => {
    const existing =
      "# Hand-written header line one\n" +
      "# Hand-written header line two\n" +
      "\n" +
      "schemaVersion: 1\nmaps: []\n";
    const out = buildFullWorldYaml({
      maps: [makeMap()],
      schemaVersion: 1,
      existing,
    });
    expect(out.startsWith("# Hand-written header line one\n# Hand-written header line two\n\n")).toBe(true);
    // The body still parses.
    const cfg = loadEmitted(out)!;
    expect(cfg.maps[0].id).toBe("m1");
  });

  it("emits the default boilerplate when no existing file is given", () => {
    const out = buildFullWorldYaml({
      maps: [makeMap()],
      schemaVersion: 1,
      existing: null,
    });
    expect(out).toContain("# World atlas");
    expect(out).toContain("# CANON: YAML / Markdown frontmatter is the source of truth.");
  });

  it("preserves the astrath-deeprealm 9-line header byte-for-byte", () => {
    const existing =
      "# Astrath Deeprealm — map / region / fog / route / calendar config.\n" +
      "#\n" +
      "# CANON: YAML / Markdown frontmatter is the source of truth. Generated\n" +
      "# artifacts (public/atlas/atlas.json, search-index.json) are DERIVED — never\n" +
      "# edit them by hand. Visual edits in /atlas/edit emit a YAML patch that is\n" +
      "# pasted here and committed.\n" +
      "#\n" +
      "# IMPORTANT: This file must be PURE YAML. Do NOT paste markdown code fences\n" +
      "# (```yaml) from exported patch files.\n" +
      "\n" +
      "schemaVersion: 1\n" +
      "maps:\n" +
      "  - id: astrath-deeprealm-overview\n";
    const out = buildFullWorldYaml({
      maps: [makeMap({ id: "astrath-deeprealm-overview", name: "Overview" })],
      schemaVersion: 1,
      existing,
    });
    expect(out.startsWith("# Astrath Deeprealm — map / region / fog / route / calendar config.\n")).toBe(true);
    expect(out).toContain("# IMPORTANT: This file must be PURE YAML.");
  });
});

describe("buildFullWorldYaml — schema version", () => {
  it("omits schemaVersion when not given (loader will default)", () => {
    const out = buildFullWorldYaml({
      maps: [makeMap()],
      existing: null,
    });
    expect(out).not.toMatch(/^schemaVersion:/m);
  });
});

describe("buildFullWorldYaml — soundscape round-trip", () => {
  it("round-trips soundscape config through YAML", () => {
    const map = makeMap({
      soundscape: {
        enabled: true,
        masterGain: 0.7,
        areas: [
          {
            id: "area-tavern",
            bed: { src: "audio/tavern.ogg", gain: 0.8 },
            points: [[0, 0], [100, 0], [100, 100], [0, 100]],
            visibility: "player" as const,
          },
        ],
      },
    });
    const out = buildFullWorldYaml({ maps: [map], schemaVersion: 1, existing: null });
    const cfg = loadEmitted(out)!;
    const sc = cfg.maps[0].soundscape;
    expect(sc).toBeDefined();
    expect(sc!.enabled).toBe(true);
    expect(sc!.masterGain).toBe(0.7);
    expect(sc!.areas).toHaveLength(1);
    expect(sc!.areas![0].id).toBe("area-tavern");
    expect(sc!.areas![0].bed.src).toBe("audio/tavern.ogg");
    expect(sc!.areas![0].bed.gain).toBe(0.8);
  });

  it("omits soundscape key when undefined", () => {
    const out = buildFullWorldYaml({ maps: [makeMap()], schemaVersion: 1, existing: null });
    expect(out).not.toMatch(/soundscape:/);
  });
});
