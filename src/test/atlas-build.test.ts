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

function run(args: string[], opts: ExecFileSyncOptions = {}): RunResult {
  try {
    const stdout = execFileSync("npx", ["tsx", SCRIPT, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
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
});
