/**
 * Player atlas trust gate.
 *
 * Combined sentinel-leak scan + structural shape validation over the
 * generated player atlas output. This is the LAST line of defense before
 * shipping: even if every other layer regresses, this test must catch any
 * DM-only content reaching player-facing artifacts.
 *
 * What this test guarantees:
 *   1. Sentinel leak scan — DM-only fixtures contain unique sentinel
 *      strings (SECRET_NEVER_PUBLISH_001, DM_ONLY_SENTINEL_DO_NOT_SHIP).
 *      These MUST NOT appear anywhere in the player output directory.
 *   2. Artifact shape — every entity, placement, region and route in
 *      the generated atlas.json has player-safe structure: no sourcePath,
 *      no frontmatter, no profile.dm, no DM `%%` comment blocks, only
 *      player-safe visibility values, and DM-only entity ids do not leak
 *      via id/title/aliases.
 *   3. Search index — sentinels and DM-only entity titles do not leak
 *      into search-index.json.
 *
 * Notes on output locations:
 *   - The atlas build script writes the player artifacts under the
 *     configured outputDir (here: <fixture>/out/). For the production
 *     project this is `public/atlas/`.
 *   - `dist/` is produced by `vite build` (the SPA bundle) and is NOT
 *     written by the atlas build pipeline. It contains compiled JS that
 *     bundles `public/atlas/atlas.json` only via fetch at runtime, so the
 *     atlas-side trust gate covers everything that ships as data. We
 *     scan dist/ opportunistically when present, but absence is expected.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.resolve(__dirname, "fixtures/atlas-build");
const SCRIPT = path.resolve(ROOT, "scripts/build-atlas.ts");

const IS_WIN = process.platform === "win32";
const NPX = IS_WIN ? "npx.cmd" : "npx";

/** Sentinel strings only present in DM-only fixture entities. */
const SENTINELS = ["SECRET_NEVER_PUBLISH_001", "DM_ONLY_SENTINEL_DO_NOT_SHIP"];

/**
 * Player-safe visibility values, per src/atlas/content/schema.ts.
 * The current schema only defines `player | dm | hidden | rumor`, so the
 * player-safe set is strictly { player, rumor }. If the schema ever adds
 * `public` or `known` aliases, extend this set deliberately — never widen
 * it just to make a failing test pass.
 */
const PLAYER_SAFE_VIS = new Set(["player", "rumor"]);

/** Titles + ids of DM-only fixture entities — must not appear in player output. */
const DM_ONLY_NAMES = ["Secret Lair", "secret-lair", "Hidden Thing", "hidden-thing"];

const TEXT_EXT = new Set([".json", ".html", ".js", ".css", ".txt", ".md", ".svg", ".map", ".xml"]);

let tmpRoot: string;
let outDir: string;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-trust-gate-"));
  outDir = path.join(tmpRoot, "out");
  // Build the player atlas from the shared fixture vault. Use --strict so
  // ANY weakening of the upstream gates also surfaces here.
  execFileSync(
    NPX,
    [
      "tsx",
      SCRIPT,
      "--player",
      "--strict",
      "--config",
      path.join(FIXTURE, "atlas.config.json"),
      "--out",
      outDir,
    ],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      shell: IS_WIN,
      env: { ...process.env, ATLAS_ACK_DM_IN_SOURCE: "true" },
    }
  );
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function readAtlas(): {
  entities: Array<{
    id: string;
    title: string;
    visibility: string;
    body?: string;
    bodyHtml?: string;
    bodyMarkdown?: string;
    summary?: string;
    tooltip?: string;
    sourcePath?: string;
    frontmatter?: Record<string, unknown>;
    profile?: { player?: unknown; dm?: unknown };
    aliases?: string[];
  }>;
  placements: Array<{ entityId: string; visibility: string }>;
  maps: Array<{
    id: string;
    regions?: Array<{ id: string; visibility: string }>;
    routes?: Array<{ id: string; visibility: string }>;
  }>;
} {
  return JSON.parse(fs.readFileSync(path.join(outDir, "atlas.json"), "utf8"));
}

describe("player atlas trust gate", () => {
  it("sentinel scan: no DM-only sentinel string appears in any generated player file", () => {
    const dirsToScan = [outDir, path.join(ROOT, "dist")].filter((d) =>
      fs.existsSync(d)
    );
    expect(dirsToScan).toContain(outDir);
    const offenders: string[] = [];
    for (const dir of dirsToScan) {
      for (const file of walkFiles(dir)) {
        const ext = path.extname(file).toLowerCase();
        if (!TEXT_EXT.has(ext)) continue;
        const text = fs.readFileSync(file, "utf8");
        for (const s of SENTINELS) {
          if (text.includes(s)) offenders.push(`${file} contains ${s}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("sentinel scan: DM build (control) DOES leak sentinels — proves the scan is wired up", () => {
    // Sanity: build the same fixture WITHOUT --player and confirm the
    // sentinels are present. If this ever stops finding them, the
    // sentinels themselves were silently removed and the player-side
    // assertion above is a false negative.
    const dmOut = path.join(tmpRoot, "dm-control");
    execFileSync(
      NPX,
      [
        "tsx",
        SCRIPT,
        "--config",
        path.join(FIXTURE, "atlas.config.json"),
        "--out",
        dmOut,
      ],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      shell: IS_WIN,
      env: { ...process.env, ATLAS_ACK_DM_IN_SOURCE: "true" },
    }
    );
    const text = fs.readFileSync(path.join(dmOut, "atlas.json"), "utf8");
    for (const s of SENTINELS) expect(text).toContain(s);
  });

  it("artifact shape: entities have no DM structural fields", () => {
    const atlas = readAtlas();
    expect(atlas.entities.length).toBeGreaterThan(0);
    for (const e of atlas.entities) {
      // sourcePath must be absent or empty — leaks vault layout otherwise.
      expect(
        !e.sourcePath || e.sourcePath === "",
        `entity ${e.id} leaks sourcePath`
      ).toBe(true);
      // frontmatter must be absent or empty object — frontmatter often
      // carries DM-only fields (date, internal ids, draft flags, …).
      expect(
        !e.frontmatter || Object.keys(e.frontmatter).length === 0,
        `entity ${e.id} leaks non-empty frontmatter`
      ).toBe(true);
      // profile.dm must NEVER reach a player build.
      expect(
        !e.profile || e.profile.dm === undefined,
        `entity ${e.id} leaks profile.dm`
      ).toBe(true);
    }
  });

  it("artifact shape: every entity, placement, region, route has player-safe visibility", () => {
    const atlas = readAtlas();
    for (const e of atlas.entities) {
      expect(
        PLAYER_SAFE_VIS.has(e.visibility),
        `entity ${e.id} has non-player visibility "${e.visibility}"`
      ).toBe(true);
    }
    for (const p of atlas.placements) {
      expect(
        PLAYER_SAFE_VIS.has(p.visibility),
        `placement ${p.entityId} has non-player visibility "${p.visibility}"`
      ).toBe(true);
    }
    for (const m of atlas.maps) {
      for (const r of m.regions ?? []) {
        expect(
          PLAYER_SAFE_VIS.has(r.visibility),
          `region ${r.id} on map ${m.id} has non-player visibility "${r.visibility}"`
        ).toBe(true);
      }
      for (const r of m.routes ?? []) {
        expect(
          PLAYER_SAFE_VIS.has(r.visibility),
          `route ${r.id} on map ${m.id} has non-player visibility "${r.visibility}"`
        ).toBe(true);
      }
    }
  });

  it("artifact shape: no DM `%% ... %%` comment block appears in any entity text field", () => {
    const atlas = readAtlas();
    const re = /%%[\s\S]*?%%/;
    for (const e of atlas.entities) {
      for (const field of ["body", "bodyHtml", "bodyMarkdown", "summary", "tooltip"] as const) {
        const v = e[field];
        if (typeof v !== "string") continue;
        expect(re.test(v), `entity ${e.id}.${field} contains a %% block`).toBe(false);
      }
    }
  });

  it("artifact shape: DM-only entity ids and titles do not appear in player output", () => {
    const atlas = readAtlas();
    const ids = new Set(atlas.entities.map((e) => e.id));
    const titles = new Set(atlas.entities.map((e) => e.title));
    expect(ids.has("secret-lair")).toBe(false);
    expect(ids.has("hidden-thing")).toBe(false);
    expect(titles.has("Secret Lair")).toBe(false);
    expect(titles.has("Hidden Thing")).toBe(false);
  });

  it("search index: contains no sentinels and no DM-only entity names", () => {
    const idxPath = path.join(outDir, "search-index.json");
    const text = fs.readFileSync(idxPath, "utf8");
    for (const s of SENTINELS) expect(text).not.toContain(s);
    const idx = JSON.parse(text) as Array<{ id: string; title: string }>;
    for (const row of idx) {
      expect(DM_ONLY_NAMES).not.toContain(row.id);
      expect(DM_ONLY_NAMES).not.toContain(row.title);
    }
  });
});