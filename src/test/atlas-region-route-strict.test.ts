/**
 * Integration tests for region/route strict-mode failures in player builds.
 *
 * Locked-in exit-code contract (see scripts/build-atlas.ts):
 *   - exit 6 → one or more region "leaks" (player-visible region linked to
 *              a DM-only / hidden / unknown entity) in --player --strict
 *   - exit 7 → one or more route "leaks"  (player-visible route waypoint
 *              referencing a DM-only / hidden / unknown entity) in
 *              --player --strict
 *
 * These tests build minimal fixture vaults on disk, invoke the real build
 * script, and assert both the exit code AND that the warning text contains
 * enough context (entity id, region/route id) to fix the source record.
 *
 * Coverage matrix:
 *   1. player-safe region (top-level)              → exit 0
 *   2. player-safe route  (top-level)              → exit 0
 *   3. region linked to dm entity                  → exit 6
 *   4. region linked to hidden entity              → exit 6
 *   5. route waypoint → dm entity                  → exit 7
 *   6. route waypoint → unknown entity             → exit 7
 *
 * Note on warning text: in `--player` mode DM/hidden source entities are
 * filtered out of the entity table BEFORE the leak scan runs, so the
 * warning describes the target as `unknown entity` rather than `dm entity`.
 * The assertions therefore lock the entity id (which is enough context to
 * fix the source record) instead of the target's classification word.
 *   7. mixed safe + unsafe regions                 → exit 6, only the bad id is named
 *   8. mixed safe + unsafe routes                  → exit 7, only the bad id is named
 *   9. nested maps[].regions player-safe           → exit 0
 *  10. nested maps[].regions linked to dm          → exit 6
 *  11. nested maps[].routes  player-safe           → exit 0
 *  12. nested maps[].routes  waypoint → dm         → exit 7
 *  13. dm-visibility region (no link) drops silently in player + strict → exit 0
 *      (regions/routes whose own visibility is dm/hidden are filtered out
 *       by the player build itself; the strict gate only fires when a
 *       player-visible record reveals a DM target.)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = "scripts/build-atlas.ts"; // relative to ROOT (cwd)

const IS_WIN = process.platform === "win32";
const NPX = IS_WIN ? "npx.cmd" : "npx";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-strict-rr-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(rel: string, body: string) {
  const full = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

/** Build a vault with a config + world.yaml + entity files, then return paths. */
function makeVault(opts: {
  worldYaml: string;
  entities: Array<{ rel: string; visibility: "player" | "dm" | "hidden" | "rumor"; title?: string }>;
}): { configPath: string; outDir: string } {
  write(
    "atlas.config.json",
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "w",
      include: ["**/*.md"],
      exclude: [],
    })
  );
  write("content/w/_atlas/world.yaml", opts.worldYaml);
  for (const e of opts.entities) {
    write(
      `content/w/${e.rel}`,
      `---\ntitle: ${e.title ?? path.basename(e.rel, ".md").replace(/-/g, " ")}\natlas:\n  type: settlement\n  visibility: ${e.visibility}\n  placements:\n    - mapId: m1\n      x: 100\n      y: 100\n---\nbody\n`
    );
  }
  return {
    configPath: path.join(tmp, "atlas.config.json"),
    outDir: path.join(tmp, "out"),
  };
}

function runBuild(args: string[]): { status: number; out: string } {
  try {
    const opts: ExecFileSyncOptions = {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: IS_WIN,
      // Auto-ack the source-DM privacy gate; this suite is testing
      // region/route gating, not the privacy gate.
      env: { ...process.env, ATLAS_ACK_DM_IN_SOURCE: "true" },
    };
    const stdout = execFileSync(NPX, ["tsx", SCRIPT, ...args], opts);
    return { status: 0, out: String(stdout) };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      status: err.status ?? 1,
      out: String(err.stdout ?? "") + String(err.stderr ?? ""),
    };
  }
}

function build(configPath: string, outDir: string) {
  return runBuild(["--player", "--strict", "--config", configPath, "--out", outDir]);
}

/** Single-map skeleton, used by every fixture. */
const MAP_SKELETON = `maps:
  - id: m1
    name: Map One
    width: 1000
    height: 1000
    layers: []
`;

// ---------------------------------------------------------------------------
// Top-level (legacy) regions
// ---------------------------------------------------------------------------
describe("strict player build — top-level regions (exit code 6)", () => {
  it("(1) player-safe region linked to a player entity → exit 0", () => {
    const v = makeVault({
      worldYaml:
        MAP_SKELETON +
        `regions:\n  - id: safe-region\n    mapId: m1\n    name: Safe\n    entityId: alice\n    visibility: player\n    points: [[0,0],[10,0],[10,10]]\n`,
      entities: [{ rel: "alice.md", visibility: "player" }],
    });
    const r = build(v.configPath, v.outDir);
    expect(r.status, r.out).toBe(0);
  });

  it("(3) region linked to a DM entity → exit 6, names the region + entity", () => {
    const v = makeVault({
      worldYaml:
        MAP_SKELETON +
        `regions:\n  - id: leaky-region\n    mapId: m1\n    name: Leaky\n    entityId: secret-base\n    visibility: player\n    points: [[0,0],[10,0],[10,10]]\n`,
      entities: [{ rel: "secret-base.md", visibility: "dm" }],
    });
    const r = build(v.configPath, v.outDir);
    expect(r.status, r.out).toBe(6);
    expect(r.out).toMatch(/region "leaky-region"/);
    expect(r.out).toMatch(/secret-base/);
    expect(r.out).toMatch(/spoiler leak/);
  });

  it("(4) region linked to a hidden entity → exit 6", () => {
    const v = makeVault({
      worldYaml:
        MAP_SKELETON +
        `regions:\n  - id: leaky-region\n    mapId: m1\n    name: Leaky\n    entityId: hidden-thing\n    visibility: rumor\n    points: [[0,0],[10,0],[10,10]]\n`,
      entities: [{ rel: "hidden-thing.md", visibility: "hidden" }],
    });
    const r = build(v.configPath, v.outDir);
    expect(r.status, r.out).toBe(6);
    expect(r.out).toMatch(/region "leaky-region"/);
    expect(r.out).toMatch(/hidden-thing/);
  });

  it("(7) mixed safe + unsafe regions → exit 6 names ONLY the unsafe id", () => {
    const v = makeVault({
      worldYaml:
        MAP_SKELETON +
        `regions:\n` +
        `  - id: ok-region\n    mapId: m1\n    name: OK\n    entityId: alice\n    visibility: player\n    points: [[0,0],[10,0],[10,10]]\n` +
        `  - id: bad-region\n    mapId: m1\n    name: Bad\n    entityId: secret-base\n    visibility: player\n    points: [[0,0],[10,0],[10,10]]\n`,
      entities: [
        { rel: "alice.md", visibility: "player" },
        { rel: "secret-base.md", visibility: "dm" },
      ],
    });
    const r = build(v.configPath, v.outDir);
    expect(r.status, r.out).toBe(6);
    expect(r.out).toMatch(/region "bad-region"/);
    // Should not slander the safe one.
    expect(r.out).not.toMatch(/region "ok-region": .* spoiler leak/);
  });

  it("(13) DM-only region (no entity link) is silently dropped → exit 0", () => {
    // The player build filter strips any region whose own visibility isn't
    // player-safe, so a `visibility: dm` region with no leaky link should
    // simply not appear in player output and not trigger the strict gate.
    const v = makeVault({
      worldYaml:
        MAP_SKELETON +
        `regions:\n  - id: dm-only-region\n    mapId: m1\n    name: DM Only\n    visibility: dm\n    points: [[0,0],[10,0],[10,10]]\n`,
      entities: [],
    });
    const r = build(v.configPath, v.outDir);
    expect(r.status, r.out).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Top-level (legacy) routes
// ---------------------------------------------------------------------------
describe("strict player build — top-level routes (exit code 7)", () => {
  it("(2) player-safe route through player entity → exit 0", () => {
    const v = makeVault({
      worldYaml:
        MAP_SKELETON +
        `routes:\n  - id: safe-route\n    mapId: m1\n    name: Safe Road\n    visibility: player\n    waypoints:\n      - { entityId: alice }\n      - [500, 500]\n`,
      entities: [{ rel: "alice.md", visibility: "player" }],
    });
    const r = build(v.configPath, v.outDir);
    expect(r.status, r.out).toBe(0);
  });

  it("(5) route waypoint to a DM entity → exit 7", () => {
    const v = makeVault({
      worldYaml:
        MAP_SKELETON +
        `routes:\n  - id: leaky-route\n    mapId: m1\n    name: Bad Road\n    visibility: player\n    waypoints:\n      - [0, 0]\n      - { entityId: secret-base }\n`,
      entities: [{ rel: "secret-base.md", visibility: "dm" }],
    });
    const r = build(v.configPath, v.outDir);
    expect(r.status, r.out).toBe(7);
    expect(r.out).toMatch(/route "leaky-route"/);
    expect(r.out).toMatch(/secret-base/);
    expect(r.out).toMatch(/spoiler leak/);
  });

  it("(6) route waypoint to an unknown entity → exit 7", () => {
    const v = makeVault({
      worldYaml:
        MAP_SKELETON +
        `routes:\n  - id: unknown-route\n    mapId: m1\n    name: "Unknown Road"\n    visibility: player\n    waypoints:\n      - [0,0]\n      - { entityId: never-defined }\n`,
      entities: [{ rel: "alice.md", visibility: "player" }],
    });
    const r = build(v.configPath, v.outDir);
    expect(r.status, r.out).toBe(7);
    expect(r.out).toMatch(/never-defined/);
    expect(r.out).toMatch(/unknown entity/);
  });

  it("(8) mixed safe + unsafe routes → exit 7 names ONLY the unsafe id", () => {
    const v = makeVault({
      worldYaml:
        MAP_SKELETON +
        `routes:\n` +
        `  - id: ok-route\n    mapId: m1\n    name: OK\n    visibility: player\n    waypoints:\n      - { entityId: alice }\n      - [500,500]\n` +
        `  - id: bad-route\n    mapId: m1\n    name: Bad\n    visibility: player\n    waypoints:\n      - { entityId: alice }\n      - { entityId: secret-base }\n`,
      entities: [
        { rel: "alice.md", visibility: "player" },
        { rel: "secret-base.md", visibility: "dm" },
      ],
    });
    const r = build(v.configPath, v.outDir);
    expect(r.status, r.out).toBe(7);
    expect(r.out).toMatch(/route "bad-route"/);
    expect(r.out).not.toMatch(/route "ok-route": .* spoiler leak/);
  });
});

// ---------------------------------------------------------------------------
// Nested maps[].regions / maps[].routes
// ---------------------------------------------------------------------------
describe("strict player build — nested maps[] geometry", () => {
  function nestedMap(extraIndented: string): string {
    return `maps:\n  - id: m1\n    name: Map One\n    width: 1000\n    height: 1000\n    layers: []\n${extraIndented}`;
  }

  it("(9) nested regions player-safe → exit 0", () => {
    const v = makeVault({
      worldYaml: nestedMap(
        `    regions:\n      - id: nested-safe\n        name: Safe\n        entityId: alice\n        visibility: player\n        points: [[0,0],[10,0],[10,10]]\n`
      ),
      entities: [{ rel: "alice.md", visibility: "player" }],
    });
    const r = build(v.configPath, v.outDir);
    expect(r.status, r.out).toBe(0);
  });

  it("(10) nested regions linked to DM entity → exit 6, names the region", () => {
    const v = makeVault({
      worldYaml: nestedMap(
        `    regions:\n      - id: nested-bad\n        name: Bad\n        entityId: secret-base\n        visibility: player\n        points: [[0,0],[10,0],[10,10]]\n`
      ),
      entities: [{ rel: "secret-base.md", visibility: "dm" }],
    });
    const r = build(v.configPath, v.outDir);
    expect(r.status, r.out).toBe(6);
    expect(r.out).toMatch(/region "nested-bad"/);
    expect(r.out).toMatch(/secret-base/);
  });

  it("(11) nested routes player-safe → exit 0", () => {
    const v = makeVault({
      worldYaml: nestedMap(
        `    routes:\n      - id: nested-safe-route\n        name: Safe\n        visibility: player\n        waypoints:\n          - { entityId: alice }\n          - [500,500]\n`
      ),
      entities: [{ rel: "alice.md", visibility: "player" }],
    });
    const r = build(v.configPath, v.outDir);
    expect(r.status, r.out).toBe(0);
  });

  it("(12) nested routes waypoint → DM entity → exit 7, names the route", () => {
    const v = makeVault({
      worldYaml: nestedMap(
        `    routes:\n      - id: nested-bad-route\n        name: Bad\n        visibility: player\n        waypoints:\n          - [0,0]\n          - { entityId: secret-base }\n`
      ),
      entities: [{ rel: "secret-base.md", visibility: "dm" }],
    });
    const r = build(v.configPath, v.outDir);
    expect(r.status, r.out).toBe(7);
    expect(r.out).toMatch(/route "nested-bad-route"/);
    expect(r.out).toMatch(/secret-base/);
  });
});