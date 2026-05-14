/**
 * Sentinel-string scanner tests.
 *
 * Unit tests plant DM-content / editor fingerprints in a temp directory and
 * verify scanDir + the CLI exit codes. The integration test builds the
 * sentinel-vault fixture under --player --strict and asserts the output is
 * clean — proving the build filter strips DM content end-to-end.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanDir, DM_CONTENT_SENTINELS, EDITOR_CODE_FINGERPRINTS } from "../../scripts/check-no-secrets";

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.resolve(ROOT, "scripts/check-no-secrets.ts");
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
beforeAll(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-sentinel-")); });
afterAll(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

function plant(dir: string, name: string, contents: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), contents);
}

describe.sequential("sentinel scanner", () => {
  it("flags planted DM sentinel and CLI exits 8", () => {
    const dir = path.join(tmpRoot, "dm-only");
    plant(dir, "leak.html", `<html>${DM_CONTENT_SENTINELS[0]}</html>`);
    const r = scanDir(dir);
    expect(r.dmHits.length).toBeGreaterThan(0);
    expect(r.editorHits).toHaveLength(0);
    const cli = run(SCRIPT, [dir]);
    expect(cli.status).toBe(8);
  });

  it("flags planted editor fingerprint and CLI exits 9", () => {
    const dir = path.join(tmpRoot, "editor-only");
    plant(dir, "bundle.js", `console.log("${EDITOR_CODE_FINGERPRINTS[0]}");`);
    const r = scanDir(dir);
    expect(r.editorHits.length).toBeGreaterThan(0);
    expect(r.dmHits).toHaveLength(0);
    const cli = run(SCRIPT, [dir]);
    expect(cli.status).toBe(9);
  });

  it("CLI exits 10 when both kinds leak", () => {
    const dir = path.join(tmpRoot, "both");
    plant(dir, "a.html", DM_CONTENT_SENTINELS[1]);
    plant(dir, "b.js", EDITOR_CODE_FINGERPRINTS[2]);
    const cli = run(SCRIPT, [dir]);
    expect(cli.status).toBe(10);
  });

  it("clean dir exits 0", () => {
    const dir = path.join(tmpRoot, "clean");
    plant(dir, "ok.html", "<html>hello world</html>");
    const cli = run(SCRIPT, [dir]);
    expect(cli.status, cli.stderr).toBe(0);
  });

  it("missing target exits 0 with skipping message", () => {
    const cli = run(SCRIPT, [path.join(tmpRoot, "does-not-exist")]);
    expect(cli.status).toBe(0);
    expect(cli.stdout).toMatch(/skipping/i);
  });

  it("integration: building sentinel-vault under --player --strict produces a clean artifact", () => {
    const out = path.join(tmpRoot, "sentinel-build");
    const build = run(BUILD_SCRIPT, [
      "--player",
      "--strict",
      "--config", path.join(FIXTURE, "atlas.config.json"),
      "--out", out,
    ]);
    expect(build.status, build.stderr + build.stdout).toBe(0);
    const r = scanDir(out);
    expect(r.dmHits, JSON.stringify(r.dmHits)).toHaveLength(0);
    expect(r.editorHits).toHaveLength(0);
  });
});