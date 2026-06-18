/**
 * Artifact shape assertions.
 *
 * Builds the sentinel-vault fixture under --player --strict and asserts the
 * shape gate finds zero violations. Also constructs a deliberately malformed
 * atlas.json in memory and asserts the CLI exits 11 with each violation listed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanArtifactShape } from "../../scripts/check-artifact-shape";

const ROOT = path.resolve(__dirname, "../..");
const SHAPE_SCRIPT = path.resolve(ROOT, "scripts/check-artifact-shape.ts");
const BUILD_SCRIPT = path.resolve(ROOT, "scripts/build-atlas.ts");
const FIXTURE = path.resolve(__dirname, "fixtures/sentinel-vault");

interface RunResult { status: number; stdout: string; stderr: string; }
const IS_WIN = process.platform === "win32";
function run(script: string, args: string[], opts: ExecFileSyncOptions = {}): RunResult {
  try {
    const stdout = execFileSync(IS_WIN ? "npx.cmd" : "npx", ["tsx", script, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: IS_WIN,
      ...opts,
    });
    return { status: 0, stdout: String(stdout), stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return { status: err.status ?? 1, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? "") };
  }
}

let tmpRoot: string;
beforeAll(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-shape-")); });
afterAll(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

describe.sequential("artifact shape gate", () => {
  it("clean player build of sentinel-vault has zero shape violations", () => {
    const out = path.join(tmpRoot, "build");
    const build = run(BUILD_SCRIPT, [
      "--player",
      "--strict",
      "--config", path.join(FIXTURE, "atlas.config.json"),
      "--out", out,
    ]);
    expect(build.status, build.stderr + build.stdout).toBe(0);
    const atlas = JSON.parse(fs.readFileSync(path.join(out, "atlas.json"), "utf8"));
    const r = scanArtifactShape(atlas);
    expect(r.violations, JSON.stringify(r.violations, null, 2)).toHaveLength(0);

    const cli = run(SHAPE_SCRIPT, [path.join(out, "atlas.json")]);
    expect(cli.status, cli.stderr).toBe(0);
  });

  it("CLI exits 11 and lists each violation for a malformed atlas.json", () => {
    const dir = path.join(tmpRoot, "bad");
    fs.mkdirSync(dir, { recursive: true });
    const bad = {
      version: "1",
      publishedAt: new Date().toISOString(),
      worlds: [],
      maps: [],
      placements: [],
      assets: [],
      entities: [
        {
          id: "leak-vis",
          title: "Leak Vis",
          type: "note",
          visibility: "dm",
          aliases: [],
          tags: [],
          images: [],
          body: "ok",
          bodyHtml: "ok",
          frontmatter: {},
          sourcePath: "",
          links: [],
          backlinks: [],
        },
        {
          id: "leak-source",
          title: "Leak Source",
          type: "note",
          visibility: "player",
          aliases: [],
          tags: [],
          images: [],
          body: "ok",
          bodyHtml: "ok",
          frontmatter: {},
          sourcePath: "content/secret.md",
          links: [],
          backlinks: [],
        },
        {
          id: "leak-block",
          title: "Leak Block",
          type: "note",
          visibility: "player",
          aliases: [],
          tags: [],
          images: [],
          body: "before %% leak %% after",
          bodyHtml: "ok",
          frontmatter: {},
          sourcePath: "",
          links: [],
          backlinks: [],
        },
      ],
    };
    const file = path.join(dir, "atlas.json");
    fs.writeFileSync(file, JSON.stringify(bad));
    const cli = run(SHAPE_SCRIPT, [file]);
    expect(cli.status).toBe(11);
    const out = cli.stdout + cli.stderr;
    expect(out).toMatch(/leak-vis/);
    expect(out).toMatch(/leak-source/);
    expect(out).toMatch(/leak-block/);
    expect(out).toMatch(/visibility/);
    expect(out).toMatch(/sourcePath/);
    expect(out).toMatch(/DM block/);
  });
});

describe("scanArtifactShape — soundscape assertions", () => {
  function makeAtlas(soundscapeOverride?: unknown) {
    return {
      version: "1",
      publishedAt: "",
      worlds: [],
      maps: [
        {
          id: "test-map",
          name: "Test",
          soundscape: soundscapeOverride,
        },
      ],
      placements: [],
      assets: [],
      entities: [],
    };
  }

  it("clean soundscape with neutralised IDs and no names → zero violations", () => {
    const atlas = makeAtlas({
      enabled: true,
      areas: [
        { id: "area-0", bed: { src: "atlas/assets/audio/abc12345.ogg" }, visibility: "player" },
        { id: "area-1", bed: { src: "atlas/assets/audio/def67890.ogg" } },
      ],
    });
    const r = scanArtifactShape(atlas);
    expect(r.violations.filter((v) => v.field.includes("soundscape"))).toHaveLength(0);
  });

  it("flags a DM-visibility area", () => {
    const atlas = makeAtlas({
      areas: [{ id: "area-0", bed: { src: "audio/x.ogg" }, visibility: "dm" }],
    });
    const r = scanArtifactShape(atlas);
    expect(r.violations.some((v) => v.field.includes("soundscape") && v.message.includes("visibility"))).toBe(true);
  });

  it("flags an area with a non-neutralised id", () => {
    const atlas = makeAtlas({
      areas: [{ id: "dungeon-lair", bed: { src: "audio/x.ogg" } }],
    });
    const r = scanArtifactShape(atlas);
    expect(r.violations.some((v) => v.field.includes("soundscape") && v.message.includes("id"))).toBe(true);
  });

  it("flags an area that still has a name", () => {
    const atlas = makeAtlas({
      areas: [{ id: "area-0", bed: { src: "audio/x.ogg" }, name: "Ye Olde Tavern" }],
    });
    const r = scanArtifactShape(atlas);
    expect(r.violations.some((v) => v.field.includes("soundscape") && v.message.includes("name"))).toBe(true);
  });
});