/**
 * Roundtrip test: build → snapshot atlas.json → build again → compare.
 *
 * Catches schema-regression bugs that change the build's output for the same
 * input. The build is deterministic up to the timestamp fields (`version` and
 * `publishedAt`), so we compare the rest of the artifact for equality.
 *
 * If a future change accidentally adds non-deterministic ordering or new
 * fields without backward compatibility, this test will surface it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.resolve(ROOT, "scripts/build-atlas.ts");
const IS_WIN = process.platform === "win32";

function run(args: string[], opts: ExecFileSyncOptions = {}): { status: number; stdout: string; stderr: string } {
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
    return { status: err.status ?? 1, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? "") };
  }
}

let tmpRoot: string;
beforeAll(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "roundtrip-")); });
afterAll(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

interface MutableAtlasShape extends Record<string, unknown> {
  version?: unknown;
  publishedAt?: unknown;
  buildReport?: Record<string, unknown>;
}

function makeVault(dir: string): string {
  fs.mkdirSync(path.join(dir, "content/w/_atlas"), { recursive: true });
  fs.mkdirSync(path.join(dir, "content/w/notes"), { recursive: true });
  const configPath = path.join(dir, "atlas.config.json");
  fs.writeFileSync(configPath, JSON.stringify({
    contentRoot: "content", outputDir: "out", defaultWorld: "w",
    include: ["**/*.md"], exclude: [],
  }));
  fs.writeFileSync(path.join(dir, "content/w/_atlas/world.yaml"),
    `schemaVersion: 1\nmaps:\n  - id: m1\n    name: M1\n    width: 1000\n    height: 1000\n    layers: []\n`
  );
  fs.writeFileSync(path.join(dir, "content/w/notes/A.md"),
    `---\ntitle: A\natlas:\n  visibility: player\n  type: settlement\n  placements:\n    - mapId: m1\n      x: 100\n      y: 100\n---\nBody A with [[B]].\n`
  );
  fs.writeFileSync(path.join(dir, "content/w/notes/B.md"),
    `---\ntitle: B\natlas:\n  visibility: player\n  type: ruin\n  placements:\n    - mapId: m1\n      x: 500\n      y: 500\n---\nBody B with no links.\n`
  );
  fs.writeFileSync(path.join(dir, "content/w/notes/Secret.md"),
    `---\ntitle: Secret\natlas:\n  visibility: dm\n---\nDM only.\n`
  );
  return configPath;
}

function normalize(o: unknown): unknown {
  if (Array.isArray(o)) return o.map(normalize);
  if (o && typeof o === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) {
      out[k] = normalize((o as Record<string, unknown>)[k]);
    }
    return out;
  }
  return o;
}

function stripVolatile(obj: MutableAtlasShape): MutableAtlasShape {
  // `version` and `publishedAt` reflect the build timestamp — they change every
  // run by design. `buildReport.warnings` may contain absolute paths in DM
  // builds (e.g. asset audit warnings), which differ across temp dirs even
  // for identical canon.
  const { version: _v, publishedAt: _p, ...rest } = obj;
  void _v; void _p;
  if (rest.buildReport && typeof rest.buildReport === "object") {
    rest.buildReport = { ...rest.buildReport };
    delete (rest.buildReport as Record<string, unknown>).warnings;
  }
  return rest;
}

describe.sequential("atlas build roundtrip", () => {
  it("two consecutive player builds produce identical artifacts (modulo timestamps)", () => {
    const dir = path.join(tmpRoot, "roundtrip-player");
    const configPath = makeVault(dir);

    const out1 = path.join(dir, "out1");
    const out2 = path.join(dir, "out2");
    const r1 = run(["--player", "--strict", "--config", configPath, "--out", out1]);
    expect(r1.status, r1.stderr).toBe(0);
    const r2 = run(["--player", "--strict", "--config", configPath, "--out", out2]);
    expect(r2.status, r2.stderr).toBe(0);

    const a1 = JSON.parse(fs.readFileSync(path.join(out1, "atlas.json"), "utf8")) as MutableAtlasShape;
    const a2 = JSON.parse(fs.readFileSync(path.join(out2, "atlas.json"), "utf8")) as MutableAtlasShape;

    expect(normalize(stripVolatile(a1))).toEqual(normalize(stripVolatile(a2)));
  });

  it("two consecutive DM builds produce identical artifacts (modulo timestamps)", () => {
    const dir = path.join(tmpRoot, "roundtrip-dm");
    const configPath = makeVault(dir);

    const out1 = path.join(dir, "out1");
    const out2 = path.join(dir, "out2");
    const r1 = run(["--config", configPath, "--out", out1]);
    expect(r1.status, r1.stderr).toBe(0);
    const r2 = run(["--config", configPath, "--out", out2]);
    expect(r2.status, r2.stderr).toBe(0);

    const a1 = JSON.parse(fs.readFileSync(path.join(out1, "atlas.json"), "utf8")) as MutableAtlasShape;
    const a2 = JSON.parse(fs.readFileSync(path.join(out2, "atlas.json"), "utf8")) as MutableAtlasShape;

    expect(normalize(stripVolatile(a1))).toEqual(normalize(stripVolatile(a2)));
  });

  it("search-index.json is also stable across two builds", () => {
    const dir = path.join(tmpRoot, "roundtrip-search");
    const configPath = makeVault(dir);

    const out1 = path.join(dir, "out1");
    const out2 = path.join(dir, "out2");
    run(["--player", "--config", configPath, "--out", out1]);
    run(["--player", "--config", configPath, "--out", out2]);

    const s1 = fs.readFileSync(path.join(out1, "search-index.json"), "utf8");
    const s2 = fs.readFileSync(path.join(out2, "search-index.json"), "utf8");
    expect(s1).toBe(s2);
  });
});
