// @vitest-environment node
/**
 * The one test that spawns `scripts/build-atlas.ts` as a CLI (code-retro 08).
 * Every other build test runs in-process through `buildAtlas` / `runBuild`
 * (see src/test/helpers/buildInProcess.ts). This one guards what only a real
 * process shows: argument parsing, the files written, and the exit status.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.resolve(ROOT, "scripts/build-atlas.ts");
const FIXTURE = path.resolve(__dirname, "fixtures/atlas-build");
const IS_WIN = process.platform === "win32";
const TSX = path.resolve(ROOT, "node_modules", ".bin", IS_WIN ? "tsx.cmd" : "tsx");
const execFileAsync = promisify(execFile);

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-cli-smoke-"));
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function cli(args: string[]): Promise<{ status: number; stdout: string }> {
  try {
    const { stdout } = await execFileAsync(TSX, [SCRIPT, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      shell: IS_WIN,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { status: 0, stdout: String(stdout) };
  } catch (e) {
    const err = e as { code?: number; stdout?: string };
    return {
      status: typeof err.code === "number" ? err.code : 1,
      stdout: String(err.stdout ?? ""),
    };
  }
}

describe("build-atlas CLI smoke", () => {
  it("player build writes minified atlas.json and search-index.json and exits 0", async () => {
    const out = path.join(tmp, "player");
    const r = await cli([
      "--player",
      "--config",
      path.join(FIXTURE, "atlas.config.json"),
      "--out",
      out,
    ]);
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain("=== Atlas build report (PLAYER) ===");
    const atlasText = fs.readFileSync(path.join(out, "atlas.json"), "utf8");
    expect(atlasText.startsWith('{"version"')).toBe(true); // minified
    const atlas = JSON.parse(atlasText) as { entities: { visibility: string }[] };
    expect(atlas.entities.length).toBeGreaterThan(0);
    expect(atlas.entities.every((e) => e.visibility === "player" || e.visibility === "rumor")).toBe(
      true,
    );
    expect(JSON.parse(fs.readFileSync(path.join(out, "search-index.json"), "utf8"))).toHaveLength(
      atlas.entities.length,
    );
  });

  it("a failing gate sets the process exit code", async () => {
    const out = path.join(tmp, "missing-config");
    const r = await cli(["--config", path.join(tmp, "no-such-config.json"), "--out", out]);
    expect(r.status).toBe(1);
    expect(fs.existsSync(path.join(out, "atlas.json"))).toBe(false);
  });
});
