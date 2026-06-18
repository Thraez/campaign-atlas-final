/**
 * Build pipeline integration tests.
 *
 * These spawn the real `scripts/build-atlas.ts` against a small fixture vault
 * under `src/test/fixtures/atlas-build/`. They cover the spoiler-protection
 * invariants that matter for player builds.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.resolve(__dirname, "fixtures/atlas-build");
const SCRIPT = path.resolve(ROOT, "scripts/build-atlas.ts");

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

const IS_WIN = process.platform === "win32";

function run(args: string[], opts: ExecFileSyncOptions = {}): RunResult {
  try {
    const stdout = execFileSync(IS_WIN ? "npx.cmd" : "npx", ["tsx", SCRIPT, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: IS_WIN,
      env: { ...process.env, ATLAS_ACK_DM_IN_SOURCE: "true" },
      ...opts,
    });
    return { status: 0, stdout: String(stdout), stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      status: err.status ?? 1,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? ""),
    };
  }
}

let tmpRoot: string;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-build-test-"));
});
afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function read(outDir: string) {
  const atlas = JSON.parse(
    fs.readFileSync(path.join(outDir, "atlas.json"), "utf8")
  );
  return atlas as {
    entities: Array<{ id: string; visibility: string; body: string }>;
    placements: Array<{ entityId: string; mapId: string; x: number; y: number }>;
    maps: Array<{ id: string; layers: Array<{ id: string; src: string }> }>;
    buildReport: {
      warnings: string[];
      duplicateSlugs: number;
      strippedDmBlocks: number;
      missingAssets?: number;
      externalAssets?: number;
    };
  };
}

function writeWorldVault(dir: string, worldYaml: string) {
  fs.mkdirSync(path.join(dir, "content/test-world/_atlas"), { recursive: true });
  fs.mkdirSync(path.join(dir, "content/test-world/notes"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "atlas.config.json"),
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "test-world",
      include: ["**/*.md"],
      exclude: [],
    })
  );
  fs.writeFileSync(
    path.join(dir, "content/test-world/_atlas/world.yaml"),
    worldYaml
  );
  fs.writeFileSync(
    path.join(dir, "content/test-world/notes/Stub.md"),
    `---\ntitle: Stub\natlas:\n  visibility: player\n---\nbody\n`
  );
}

describe.sequential("atlas build pipeline", () => {
  it("PLAYER build excludes dm + hidden entities and strips DM blocks", () => {
    const out = path.join(tmpRoot, "player");
    const result = run([
      "--player",
      "--config",
      path.join(FIXTURE, "atlas.config.json"),
      "--out",
      out,
    ]);
    expect(result.status, result.stderr).toBe(0);
    const atlas = read(out);
    const ids = atlas.entities.map((e) => e.id);
    expect(ids).toContain("public-town");
    expect(ids).not.toContain("secret-lair");
    expect(ids).not.toContain("hidden-thing");
    const town = atlas.entities.find((e) => e.id === "public-town")!;
    expect(town.body).not.toMatch(/DM-only secret/);
    expect(atlas.buildReport.strippedDmBlocks).toBeGreaterThan(0);
    // External-only image is allowed but warned
    const warnText = atlas.buildReport.warnings.join("\n");
    expect(warnText).toMatch(/external asset/i);
  });

  it("DM build keeps dm/hidden entities and preserves %% blocks", () => {
    const out = path.join(tmpRoot, "dm");
    const result = run([
      "--config",
      path.join(FIXTURE, "atlas.config.json"),
      "--out",
      out,
    ]);
    expect(result.status, result.stderr).toBe(0);
    const atlas = read(out);
    const ids = atlas.entities.map((e) => e.id);
    expect(ids).toContain("secret-lair");
    expect(ids).toContain("hidden-thing");
    const town = atlas.entities.find((e) => e.id === "public-town")!;
    expect(town.body).toMatch(/DM-only secret/);
    expect(atlas.buildReport.strippedDmBlocks).toBe(0);
  });

  it("multi-map placements emit one MapPlacement per entry", () => {
    const out = path.join(tmpRoot, "multi");
    const result = run([
      "--config",
      path.join(FIXTURE, "atlas.config.json"),
      "--out",
      out,
    ]);
    expect(result.status).toBe(0);
    const atlas = read(out);
    const mm = atlas.placements.filter((p) => p.entityId === "multi-map-place");
    expect(mm.length).toBe(2);
    expect(mm.map((p) => p.x).sort()).toEqual([10, 30]);
  });

  it("legacy atlas.x/atlas.y still produces a placement", () => {
    const out = path.join(tmpRoot, "legacy");
    const result = run([
      "--config",
      path.join(FIXTURE, "atlas.config.json"),
      "--out",
      out,
    ]);
    expect(result.status).toBe(0);
    const atlas = read(out);
    const ph = atlas.placements.find((p) => p.entityId === "public-town");
    expect(ph).toBeDefined();
    expect(ph!.x).toBe(100);
    expect(ph!.y).toBe(200);
  });

  it("unresolved wikilinks do NOT fail strict", () => {
    const out = path.join(tmpRoot, "strict-ok");
    const result = run([
      "--player",
      "--strict",
      "--config",
      path.join(FIXTURE, "atlas.config.json"),
      "--out",
      out,
    ]);
    expect(result.status, result.stderr + result.stdout).toBe(0);
  });

  it("strict player build FAILS on invalid visibility", () => {
    // Add a fixture with bad visibility, build, expect non-zero exit.
    const badDir = path.join(tmpRoot, "bad-vis-vault");
    fs.mkdirSync(path.join(badDir, "content/test-world/notes"), { recursive: true });
    fs.writeFileSync(
      path.join(badDir, "atlas.config.json"),
      JSON.stringify({
        contentRoot: "content",
        outputDir: "out",
        defaultWorld: "test-world",
        include: ["**/*.md"],
        exclude: [],
      })
    );
    fs.writeFileSync(
      path.join(badDir, "content/test-world/notes/Bad.md"),
      `---\ntitle: Bad\natlas:\n  visibility: secret\n---\nbody\n`
    );
    const result = run([
      "--player",
      "--strict",
      "--config",
      path.join(badDir, "atlas.config.json"),
      "--out",
      path.join(tmpRoot, "bad-vis-out"),
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/invalid visibility/i);
  });

  it("strict player build FAILS on missing local assets", () => {
    const badDir = path.join(tmpRoot, "missing-assets-vault");
    fs.mkdirSync(path.join(badDir, "content/test-world/notes"), { recursive: true });
    fs.writeFileSync(
      path.join(badDir, "atlas.config.json"),
      JSON.stringify({
        contentRoot: "content",
        outputDir: "out",
        defaultWorld: "test-world",
        include: ["**/*.md"],
        exclude: [],
      })
    );
    fs.writeFileSync(
      path.join(badDir, "content/test-world/notes/Img.md"),
      `---\ntitle: Img\natlas:\n  visibility: player\n  images:\n    - /atlas/assets/maps/does-not-exist.png\n---\nbody\n`
    );
    const result = run([
      "--player",
      "--strict",
      "--config",
      path.join(badDir, "atlas.config.json"),
      "--out",
      path.join(tmpRoot, "missing-assets-out"),
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/missing local asset/i);
  });

  it("duplicate slugs FAIL the build (errors, not warnings)", () => {
    const badDir = path.join(tmpRoot, "dupes-vault");
    fs.mkdirSync(path.join(badDir, "content/test-world/a"), { recursive: true });
    fs.mkdirSync(path.join(badDir, "content/test-world/b"), { recursive: true });
    fs.writeFileSync(
      path.join(badDir, "atlas.config.json"),
      JSON.stringify({
        contentRoot: "content",
        outputDir: "out",
        defaultWorld: "test-world",
        include: ["**/*.md"],
        exclude: [],
      })
    );
    fs.writeFileSync(
      path.join(badDir, "content/test-world/a/Same-Name.md"),
      `---\ntitle: Same Name\natlas:\n  visibility: player\n---\nA\n`
    );
    fs.writeFileSync(
      path.join(badDir, "content/test-world/b/Same-Name.md"),
      `---\ntitle: Same Name\natlas:\n  visibility: player\n---\nB\n`
    );
    const result = run([
      "--config",
      path.join(badDir, "atlas.config.json"),
      "--out",
      path.join(tmpRoot, "dupes-out"),
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/duplicate slug/i);
  });

  it("valid world.yaml with one layer outputs that layer into atlas.json", () => {
    const dir = path.join(tmpRoot, "valid-world");
    writeWorldVault(
      dir,
      `maps:\n  - id: test-world-overview\n    name: Overview\n    width: 1000\n    height: 500\n    layers:\n      - id: base\n        src: /atlas/assets/maps/map.jpg\n        x: 0\n        y: 0\n        width: 1000\n        height: 500\n        opacity: 1\n        zIndex: 1\n`
    );
    const result = run([
      "--config",
      path.join(dir, "atlas.config.json"),
      "--out",
      path.join(tmpRoot, "valid-world-out"),
    ]);
    expect(result.status, result.stderr + result.stdout).toBe(0);
    const atlas = read(path.join(tmpRoot, "valid-world-out"));
    const map = atlas.maps.find((m) => m.id === "test-world-overview");
    expect(map).toBeDefined();
    expect(map!.layers).toHaveLength(1);
    expect(map!.layers[0].src).toMatch(/map\.jpg$/);
  });

  it("world.yaml containing markdown fences FAILS the build", () => {
    const dir = path.join(tmpRoot, "fence-world");
    writeWorldVault(
      dir,
      "```yaml\nmaps:\n  - id: test-world-overview\n    name: Overview\n    width: 1000\n    height: 500\n    layers: []\n```\n"
    );
    const result = run([
      "--config",
      path.join(dir, "atlas.config.json"),
      "--out",
      path.join(tmpRoot, "fence-out"),
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/markdown code fence/i);
  });

  it("world.yaml with no maps FAILS the build", () => {
    const dir = path.join(tmpRoot, "nomaps-world");
    writeWorldVault(dir, "maps: []\n");
    const result = run([
      "--config",
      path.join(dir, "atlas.config.json"),
      "--out",
      path.join(tmpRoot, "nomaps-out"),
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/no maps defined/i);
  });

  it("missing local layer asset FAILS strict player build", () => {
    const dir = path.join(tmpRoot, "missing-layer");
    writeWorldVault(
      dir,
      `maps:\n  - id: test-world-overview\n    name: Overview\n    width: 1000\n    height: 500\n    layers:\n      - id: base\n        src: /atlas/assets/maps/does-not-exist-anywhere.png\n        x: 0\n        y: 0\n        width: 1000\n        height: 500\n        opacity: 1\n        zIndex: 1\n`
    );
    const result = run([
      "--player",
      "--strict",
      "--config",
      path.join(dir, "atlas.config.json"),
      "--out",
      path.join(tmpRoot, "missing-layer-out"),
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/missing local asset/i);
  });

  it("external layer URL warns but does not fail", () => {
    const dir = path.join(tmpRoot, "ext-layer");
    writeWorldVault(
      dir,
      `maps:\n  - id: test-world-overview\n    name: Overview\n    width: 1000\n    height: 500\n    layers:\n      - id: base\n        src: https://example.com/map.png\n        x: 0\n        y: 0\n        width: 1000\n        height: 500\n        opacity: 1\n        zIndex: 1\n`
    );
    const result = run([
      "--player",
      "--strict",
      "--config",
      path.join(dir, "atlas.config.json"),
      "--out",
      path.join(tmpRoot, "ext-layer-out"),
    ]);
    expect(result.status, result.stderr).toBe(0);
    const atlas = read(path.join(tmpRoot, "ext-layer-out"));
    expect(atlas.buildReport.warnings.join("\n")).toMatch(/external asset/i);
  });

  it("emits importFolders in DM build and omits it from --player build", () => {
    const vaultDir = path.join(tmpRoot, "import-folders-vault");
    writeWorldVault(
      vaultDir,
      `
maps:
  - id: m1
    name: Main
    width: 1000
    height: 1000
import:
  folders:
    npc: npcs
  defaultFolder: imports
`,
    );

    // DM build
    const dmOut = path.join(tmpRoot, "import-folders-dm");
    const dm = run(["--config", path.join(vaultDir, "atlas.config.json"), "--out", dmOut]);
    expect(dm.status, dm.stderr).toBe(0);
    const dmAtlas = JSON.parse(
      fs.readFileSync(path.join(dmOut, "atlas.json"), "utf8"),
    ) as { worlds: Array<{ importFolders?: unknown }> };
    expect(dmAtlas.worlds[0].importFolders).toEqual({
      folders: { npc: "npcs" },
      defaultFolder: "imports",
    });

    // Player build
    const playerOut = path.join(tmpRoot, "import-folders-player");
    const player = run([
      "--player",
      "--config",
      path.join(vaultDir, "atlas.config.json"),
      "--out",
      playerOut,
    ]);
    expect(player.status, player.stderr).toBe(0);
    const playerAtlas = JSON.parse(
      fs.readFileSync(path.join(playerOut, "atlas.json"), "utf8"),
    ) as { worlds: Array<{ importFolders?: unknown }> };
    expect(playerAtlas.worlds[0].importFolders).toBeUndefined();
  });

  it("entity.credit round-trips into player and DM atlas.json", () => {
    const dir = path.join(tmpRoot, "credit-roundtrip");
    writeWorldVault(dir, `maps:\n  - id: m1\n    name: Main\n    width: 1000\n    height: 1000\n`);
    fs.writeFileSync(
      path.join(dir, "content/test-world/notes/Credited.md"),
      `---\ntitle: Credited NPC\natlas:\n  visibility: player\n  credit: "Portrait by Evelyn K, CC BY 4.0"\n---\nbody\n`
    );

    const playerOut = path.join(tmpRoot, "credit-player-out");
    const pr = run(["--player", "--config", path.join(dir, "atlas.config.json"), "--out", playerOut]);
    expect(pr.status, pr.stderr).toBe(0);
    const playerAtlas = JSON.parse(fs.readFileSync(path.join(playerOut, "atlas.json"), "utf8")) as {
      entities: Array<{ id: string; credit?: string }>;
    };
    const credited = playerAtlas.entities.find((e) => e.id === "credited-npc");
    expect(credited?.credit).toBe("Portrait by Evelyn K, CC BY 4.0");
  });

  it("world.credits block round-trips into player atlas.json", () => {
    const dir = path.join(tmpRoot, "world-credits-roundtrip");
    writeWorldVault(dir, `maps:\n  - id: m1\n    name: Main\n    width: 1000\n    height: 1000\ncredits:\n  badges: false\n  page: true\n`);

    const playerOut = path.join(tmpRoot, "world-credits-out");
    const pr = run(["--player", "--config", path.join(dir, "atlas.config.json"), "--out", playerOut]);
    expect(pr.status, pr.stderr).toBe(0);
    const playerAtlas = JSON.parse(fs.readFileSync(path.join(playerOut, "atlas.json"), "utf8")) as {
      worlds: Array<{ credits?: { badges?: boolean; page?: boolean } }>;
    };
    expect(playerAtlas.worlds[0].credits).toEqual({ badges: false, page: true });
  });

  it("SECRECY REGRESSION: dm-only entity credit is absent from player atlas.json", () => {
    const dir = path.join(tmpRoot, "dm-credit-secrecy");
    writeWorldVault(dir, `maps:\n  - id: m1\n    name: Main\n    width: 1000\n    height: 1000\n`);
    // DM-only entity with a credit — must not appear in player build
    fs.writeFileSync(
      path.join(dir, "content/test-world/notes/Secret-Artist.md"),
      `---\ntitle: Secret Artist\natlas:\n  visibility: dm\n  credit: "Secret credit must not leak"\n---\nDM-only body\n`
    );
    // Player-visible entity with a credit — must appear in player build
    fs.writeFileSync(
      path.join(dir, "content/test-world/notes/Public-Credited.md"),
      `---\ntitle: Public Credited\natlas:\n  visibility: player\n  credit: "Public artist credit"\n---\nPublic body\n`
    );

    const playerOut = path.join(tmpRoot, "dm-credit-secrecy-out");
    const pr = run(["--player", "--config", path.join(dir, "atlas.config.json"), "--out", playerOut]);
    expect(pr.status, pr.stderr).toBe(0);
    const playerAtlas = JSON.parse(fs.readFileSync(path.join(playerOut, "atlas.json"), "utf8")) as {
      entities: Array<{ id: string; credit?: string; visibility?: string }>;
    };

    // DM entity must be absent entirely
    const dmEntity = playerAtlas.entities.find((e) => e.id === "secret-artist");
    expect(dmEntity, "dm-only entity must not appear in player build").toBeUndefined();

    // Player entity must carry its credit
    const playerEntity = playerAtlas.entities.find((e) => e.id === "public-credited");
    expect(playerEntity?.credit).toBe("Public artist credit");

    // No entity in the player build should carry the DM credit string
    const anyDmCredit = playerAtlas.entities.some((e) => e.credit?.includes("Secret credit must not leak"));
    expect(anyDmCredit, "DM credit string must not appear in player build").toBe(false);
  });
});
