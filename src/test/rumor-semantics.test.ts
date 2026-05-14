/**
 * Rumor visibility semantics — behavioral pins.
 *
 * `rumor` is the "public-but-uncertain" visibility tier. Docs at
 * `docs/VISIBILITY_AND_PLAYER_SAFETY.md` claim:
 *   - Rumor entities ship to player builds.
 *   - Rumor entities appear in the search index.
 *   - Rumor placements render as pins.
 *   - Rumor relationships ship (even on player entities).
 *   - A rumor relationship that points at a DM/hidden target is a leak.
 *
 * These tests pin those claims so a future regression that, say, accidentally
 * widens PLAYER_VISIBLE or narrows it will cause an obvious failure here.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PLAYER_VISIBLE } from "../../scripts/atlas/visibility";

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.resolve(ROOT, "scripts/build-atlas.ts");
const IS_WIN = process.platform === "win32";

interface RunResult { status: number; stdout: string; stderr: string; }

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
    return { status: err.status ?? 1, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? "") };
  }
}

let tmpRoot: string;
beforeAll(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rumor-")); });
afterAll(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

function makeVault(dir: string): { configPath: string } {
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
  return { configPath };
}

function readAtlas(outDir: string) {
  return JSON.parse(fs.readFileSync(path.join(outDir, "atlas.json"), "utf8")) as {
    entities: Array<{ id: string; visibility: string; relationships?: Array<{ entity: string; visibility: string }>; }>;
    placements: Array<{ entityId: string; mapId: string; }>;
  };
}

function readSearch(outDir: string) {
  return JSON.parse(fs.readFileSync(path.join(outDir, "search-index.json"), "utf8")) as Array<{ id: string }>;
}

describe.sequential("rumor visibility semantics", () => {
  it("PLAYER_VISIBLE includes rumor", () => {
    expect(PLAYER_VISIBLE.has("player")).toBe(true);
    expect(PLAYER_VISIBLE.has("rumor")).toBe(true);
    expect(PLAYER_VISIBLE.has("dm")).toBe(false);
    expect(PLAYER_VISIBLE.has("hidden")).toBe(false);
  });

  it("rumor entities ship to player builds and have placements + search index entries", () => {
    const dir = path.join(tmpRoot, "rumor-ships");
    const { configPath } = makeVault(dir);
    fs.writeFileSync(path.join(dir, "content/w/notes/Whisper.md"),
      `---\ntitle: The Whisper\natlas:\n  visibility: rumor\n  type: legend\n  placements:\n    - mapId: m1\n      x: 100\n      y: 100\n---\nLocals say something walks the marsh at night.\n`
    );
    const out = path.join(dir, "out");
    const result = run(["--player", "--strict", "--config", configPath, "--out", out]);
    expect(result.status, result.stderr).toBe(0);

    const atlas = readAtlas(out);
    const whisper = atlas.entities.find((e) => e.id === "the-whisper");
    expect(whisper).toBeDefined();
    expect(whisper!.visibility).toBe("rumor");

    expect(atlas.placements.find((p) => p.entityId === "the-whisper")).toBeDefined();

    const search = readSearch(out);
    expect(search.find((s) => s.id === "the-whisper")).toBeDefined();
  });

  it("rumor entity wikilinking to a DM target is treated as a cross-ref leak (strict fails)", () => {
    const dir = path.join(tmpRoot, "rumor-xref-leak");
    const { configPath } = makeVault(dir);
    fs.writeFileSync(path.join(dir, "content/w/notes/PublicRumor.md"),
      `---\ntitle: Public Rumor\natlas:\n  visibility: rumor\n---\nSome say [[Secret Cult Leader]] runs the docks.\n`
    );
    fs.writeFileSync(path.join(dir, "content/w/notes/SecretCultLeader.md"),
      `---\ntitle: Secret Cult Leader\natlas:\n  visibility: dm\n---\nThe villain.\n`
    );
    const out = path.join(dir, "out");
    const result = run(["--player", "--strict", "--config", configPath, "--out", out]);
    expect(result.status).toBe(8); // cross-ref leak exit
  });

  it("rumor relationship pointing at a hidden target fails strict player build", () => {
    const dir = path.join(tmpRoot, "rumor-rel-leak");
    const { configPath } = makeVault(dir);
    fs.writeFileSync(path.join(dir, "content/w/notes/Source.md"),
      `---\ntitle: Source\natlas:\n  visibility: player\n  relationships:\n    - entity: hidden-target\n      type: knows-of\n      visibility: rumor\n---\nbody\n`
    );
    fs.writeFileSync(path.join(dir, "content/w/notes/HiddenTarget.md"),
      `---\ntitle: Hidden Target\natlas:\n  id: hidden-target\n  visibility: hidden\n---\nthe secret\n`
    );
    const out = path.join(dir, "out");
    const result = run(["--player", "--strict", "--config", configPath, "--out", out]);
    expect(result.status).toBe(5); // relationship leak exit
  });

  it("rumor relationship between two player-visible entities ships in player build", () => {
    const dir = path.join(tmpRoot, "rumor-rel-ok");
    const { configPath } = makeVault(dir);
    fs.writeFileSync(path.join(dir, "content/w/notes/A.md"),
      `---\ntitle: A\natlas:\n  visibility: player\n  relationships:\n    - entity: b\n      type: rivals\n      visibility: rumor\n---\nbody\n`
    );
    fs.writeFileSync(path.join(dir, "content/w/notes/B.md"),
      `---\ntitle: B\natlas:\n  id: b\n  visibility: rumor\n---\nbody\n`
    );
    const out = path.join(dir, "out");
    const result = run(["--player", "--strict", "--config", configPath, "--out", out]);
    expect(result.status, result.stderr).toBe(0);
    const atlas = readAtlas(out);
    const a = atlas.entities.find((e) => e.id === "a");
    expect(a?.relationships?.find((r) => r.entity === "b" && r.visibility === "rumor")).toBeDefined();
  });

  it(":::dm callout in a player body is stripped from player build, kept in DM build", () => {
    const dir = path.join(tmpRoot, "callout");
    const { configPath } = makeVault(dir);
    const body = [
      "---",
      "title: Town",
      "atlas:",
      "  visibility: player",
      "---",
      "Public lore.",
      "",
      ":::dm",
      "DM CALLOUT SECRET STRING",
      ":::",
      "",
      "More public lore.",
    ].join("\n") + "\n";
    fs.writeFileSync(path.join(dir, "content/w/notes/Town.md"), body);

    const playerOut = path.join(dir, "out-player");
    const playerR = run(["--player", "--strict", "--config", configPath, "--out", playerOut]);
    expect(playerR.status, playerR.stderr).toBe(0);
    const playerAtlas = readAtlas(playerOut);
    const town = playerAtlas.entities.find((e) => e.id === "town");
    expect(town).toBeDefined();
    expect(JSON.stringify(town)).not.toMatch(/DM CALLOUT SECRET STRING/);

    const dmOut = path.join(dir, "out-dm");
    const dmR = run(["--config", configPath, "--out", dmOut]);
    expect(dmR.status).toBe(0);
    const dmAtlas = JSON.parse(fs.readFileSync(path.join(dmOut, "atlas.json"), "utf8")) as { entities: Array<{ id: string; body: string }> };
    const dmTown = dmAtlas.entities.find((e) => e.id === "town");
    expect(dmTown?.body).toMatch(/DM CALLOUT SECRET STRING/);
  });

  it("unclosed :::dm callout fails the build", () => {
    const dir = path.join(tmpRoot, "unclosed");
    const { configPath } = makeVault(dir);
    const body = [
      "---",
      "title: Bad",
      "atlas:",
      "  visibility: player",
      "---",
      "public",
      "",
      ":::dm",
      "this never closes and would leak",
      "more body that should also leak",
    ].join("\n") + "\n";
    fs.writeFileSync(path.join(dir, "content/w/notes/Bad.md"), body);

    const out = path.join(dir, "out");
    const r = run(["--player", "--config", configPath, "--out", out]);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/unbalanced DM delimiter|unclosed/i);
  });

  it("dm-visibility entity is EXCLUDED from player builds even with placement", () => {
    const dir = path.join(tmpRoot, "dm-not-shipped");
    const { configPath } = makeVault(dir);
    fs.writeFileSync(path.join(dir, "content/w/notes/Stub.md"),
      `---\ntitle: Stub\natlas:\n  visibility: player\n---\nbody\n`
    );
    fs.writeFileSync(path.join(dir, "content/w/notes/Lair.md"),
      `---\ntitle: Lair\natlas:\n  visibility: dm\n  placements:\n    - mapId: m1\n      x: 5\n      y: 5\n---\nbody\n`
    );
    const out = path.join(dir, "out");
    const result = run(["--player", "--strict", "--config", configPath, "--out", out]);
    expect(result.status).toBe(0);
    const atlas = readAtlas(out);
    expect(atlas.entities.find((e) => e.id === "lair")).toBeUndefined();
    expect(atlas.placements.find((p) => p.entityId === "lair")).toBeUndefined();
  });
});
