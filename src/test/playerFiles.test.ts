/**
 * eval-2026-10/40: the player build ships only allowed files. Vite copies all
 * of public/atlas/ into dist/, so a DM file dropped there (a world.yaml with
 * fog polygons, a note) reached players. The prune plugin drops anything not
 * on the allowlist from the output, and `check-player-files` fails a dist
 * that still has one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ResolvedConfig } from "vite";
import { prunePlayerFilesPlugin } from "../../scripts/vite-plugin-prune-player-files";
import { run as checkPlayerFiles } from "../../scripts/check-player-files";
import { isAllowedPlayerFile, readPlayerAudioRefs } from "../../scripts/atlas/playerFiles";

let root: string;

function write(rel: string, body = "x") {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

/** Every file under `rel`, relative to it, sorted. */
function filesUnder(rel: string): string[] {
  const dir = path.join(root, rel);
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .sort();
}

/** Run the plugin's closeBundle the way `vite build` does, against root/dist. */
function runPrunePlugin() {
  const plugin = prunePlayerFilesPlugin();
  const logger = { info: () => {} } as unknown as ResolvedConfig["logger"];
  const configResolved = plugin.configResolved as (c: unknown) => void;
  configResolved({ root, build: { outDir: "dist" }, logger });
  (plugin.closeBundle as () => void)();
}

/** A player atlas.json: map layers plus one sound area per bed `[src, srcFallback]`. */
function atlasJson(layers: string[], beds: [string, string?][], body = "![[Corven.webp]]") {
  return JSON.stringify({
    maps: [
      {
        layers: layers.map((src) => ({ src })),
        soundscape: {
          areas: beds.map(([src, srcFallback]) => ({
            bed: { src, ...(srcFallback ? { srcFallback } : {}), gain: 0.5 },
          })),
        },
      },
    ],
    entities: [{ body }],
  });
}

/** A dist/atlas with only allowed files, the shape a real player build has. */
function writeAllowedDist() {
  write(
    "dist/atlas/atlas.json",
    atlasJson(
      ["atlas/assets/maps/world.fog.png"],
      [["atlas/assets/audio/ce5af482.ogg", "atlas/assets/audio/82635d4e.m4a"]],
    ),
  );
  write("dist/atlas/search-index.json", "[]");
  write("dist/atlas/.last-published.json", "{}");
  write("dist/atlas/assets/maps/world.fog.png");
  write("dist/atlas/assets/images/Corven.webp");
  write("dist/atlas/assets/images/.gitkeep", "");
  write("dist/atlas/assets/audio/ce5af482.ogg");
  write("dist/atlas/assets/audio/82635d4e.m4a");
}

const ALLOWED_DIST = [
  ".last-published.json",
  "assets/audio/82635d4e.m4a",
  "assets/audio/ce5af482.ogg",
  "assets/images/.gitkeep",
  "assets/images/Corven.webp",
  "assets/maps/world.fog.png",
  "atlas.json",
  "search-index.json",
];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "player-files-"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("isAllowedPlayerFile", () => {
  const refs = new Set(["assets/audio/ce5af482.opus"]);
  const allowed = (rel: string, size = 1) => isAllowedPlayerFile(rel, size, refs);

  it("allows referenced hashed audio of any extension, and nothing else in assets/audio", () => {
    expect(allowed("assets/audio/ce5af482.opus")).toBe(true);
    expect(allowed("assets/audio/deadbeef.ogg")).toBe(false);
    expect(allowed("assets/audio/manifest.json")).toBe(false);
    expect(allowed("assets/audio/cover.png")).toBe(false);
  });

  it("allows images anywhere under atlas/", () => {
    expect(allowed("world.png")).toBe(true);
    expect(allowed("maps/world.png")).toBe(true);
    expect(allowed("assets/maps/world.fog.png")).toBe(true);
  });

  it("allows .gitkeep only when empty", () => {
    expect(allowed("assets/images/.gitkeep", 0)).toBe(true);
    expect(allowed("assets/images/.gitkeep", 12)).toBe(false);
  });
});

describe("readPlayerAudioRefs", () => {
  it("reads every sound-area bed src and srcFallback as an atlas-relative path", () => {
    write(
      "dist/atlas/atlas.json",
      atlasJson(
        [],
        [
          ["atlas/assets/audio/ce5af482.opus", "/atlas/assets/audio/82635d4e.m4a"],
          ["atlas/assets/audio/33a29b91.ogg"],
        ],
      ),
    );
    expect([...readPlayerAudioRefs(path.join(root, "dist/atlas"))].sort()).toEqual([
      "assets/audio/33a29b91.ogg",
      "assets/audio/82635d4e.m4a",
      "assets/audio/ce5af482.opus",
    ]);
  });
});

describe("player build prune", () => {
  it("drops a .yaml and a .md copied in from public/atlas/assets", () => {
    writeAllowedDist();
    write("dist/atlas/assets/maps/world.yaml", "fog:\n  reveals: []\n");
    write("dist/atlas/assets/handouts/dm-notes.md", "# DM only");

    runPrunePlugin();

    expect(filesUnder("dist/atlas")).toEqual(ALLOWED_DIST);
  });

  it("drops the audio manifest (it lists the DM's source bed names)", () => {
    writeAllowedDist();
    write("dist/atlas/assets/audio/manifest.json", '["cavern-drone.ogg"]');

    runPrunePlugin();

    expect(filesUnder("dist/atlas")).toEqual(ALLOWED_DIST);
  });

  it("keeps referenced hashed audio of any extension and drops unreferenced hashed audio", () => {
    writeAllowedDist();
    write(
      "dist/atlas/atlas.json",
      atlasJson(
        ["atlas/assets/maps/world.fog.png"],
        [["atlas/assets/audio/ce5af482.opus", "atlas/assets/audio/82635d4e.m4a"]],
      ),
    );
    fs.rmSync(path.join(root, "dist/atlas/assets/audio/ce5af482.ogg"));
    write("dist/atlas/assets/audio/ce5af482.opus");
    write("dist/atlas/assets/audio/deadbeef.ogg");

    runPrunePlugin();

    const files = filesUnder("dist/atlas");
    expect(files).toContain("assets/audio/ce5af482.opus");
    expect(files).toContain("assets/audio/82635d4e.m4a");
    expect(files).not.toContain("assets/audio/deadbeef.ogg");
  });

  it("keeps a referenced image outside assets/ and drops unreferenced ones there", () => {
    writeAllowedDist();
    write(
      "dist/atlas/atlas.json",
      atlasJson(
        ["atlas/assets/maps/world.fog.png", "atlas/maps/overlay.png"],
        [["atlas/assets/audio/ce5af482.ogg", "atlas/assets/audio/82635d4e.m4a"]],
      ),
    );
    write("dist/atlas/maps/overlay.png");
    write("dist/atlas/maps/dm-only.png");
    write("dist/atlas/stray.webp");
    write("dist/atlas/assets/audio/cover.png");

    runPrunePlugin();

    const files = filesUnder("dist/atlas");
    expect(files).toContain("maps/overlay.png");
    expect(files).toContain("assets/maps/world.fog.png");
    expect(files).not.toContain("maps/dm-only.png");
    expect(files).not.toContain("stray.webp");
    expect(files).not.toContain("assets/audio/cover.png");
  });

  it("drops a .gitkeep that is not empty", () => {
    writeAllowedDist();
    write("dist/atlas/assets/maps/.gitkeep", "fog: reveals");

    runPrunePlugin();

    expect(filesUnder("dist/atlas")).not.toContain("assets/maps/.gitkeep");
  });
});

describe("check-player-files", () => {
  const scan = () => checkPlayerFiles({ dir: path.join(root, "dist") });
  const errors = () => vi.mocked(console.error).mock.calls.flat().join("\n");

  it("fails a dist with a .yaml and a .md under atlas/assets, naming each file", () => {
    writeAllowedDist();
    write("dist/atlas/assets/maps/world.yaml", "fog:\n  reveals: []\n");
    write("dist/atlas/assets/handouts/dm-notes.md", "# DM only");

    expect(scan()).not.toBe(0);
    expect(errors()).toContain("atlas/assets/maps/world.yaml");
    expect(errors()).toContain("atlas/assets/handouts/dm-notes.md");
  });

  it("passes a dist with only allowed files", () => {
    writeAllowedDist();
    expect(scan()).toBe(0);
  });

  it("passes allowed files with spaces and uppercase extensions, anywhere under atlas/", () => {
    writeAllowedDist();
    write("dist/atlas/assets/images/Old Map (v2).PNG");
    write("dist/atlas/assets/maps/My World.fog.png");
    write("dist/atlas/assets/portraits/Edric.JPEG");
    write("dist/atlas/maps/overlay.png");
    expect(scan()).toBe(0);
  });

  it("fails the audio manifest", () => {
    writeAllowedDist();
    write("dist/atlas/assets/audio/manifest.json", '["cavern-drone.ogg"]');
    expect(scan()).not.toBe(0);
    expect(errors()).toContain("atlas/assets/audio/manifest.json");
  });

  it("passes referenced hashed audio of any extension and fails unreferenced hashed audio", () => {
    writeAllowedDist();
    write(
      "dist/atlas/atlas.json",
      atlasJson(
        ["atlas/assets/maps/world.fog.png"],
        [
          ["atlas/assets/audio/ce5af482.ogg", "atlas/assets/audio/82635d4e.m4a"],
          ["atlas/assets/audio/0123abcd.opus"],
        ],
      ),
    );
    write("dist/atlas/assets/audio/0123abcd.opus");
    expect(scan()).toBe(0);

    write("dist/atlas/assets/audio/deadbeef.ogg");
    expect(scan()).not.toBe(0);
    expect(errors()).toContain("atlas/assets/audio/deadbeef.ogg");
    expect(errors()).not.toContain("0123abcd.opus");
  });

  it("fails a .gitkeep that is not empty", () => {
    writeAllowedDist();
    write("dist/atlas/assets/maps/.gitkeep", "fog: reveals");
    expect(scan()).not.toBe(0);
    expect(errors()).toContain("atlas/assets/maps/.gitkeep");
  });

  it("fails files that only look allowed", () => {
    write("dist/atlas/atlas.json", atlasJson([], []));
    write("dist/atlas/notes.json", "{}");
    write("dist/atlas/assets/atlas.json", "{}");
    write("dist/atlas/assets/audio/cavern-drone.ogg");
    write("dist/atlas/assets/audio/nested/ce5af482.ogg");
    write("dist/atlas/assets/audio/cover.png");
    write("dist/atlas/assets/maps/world.png.yaml");

    expect(scan()).not.toBe(0);
    for (const rel of [
      "atlas/notes.json",
      "atlas/assets/atlas.json",
      "atlas/assets/audio/cavern-drone.ogg",
      "atlas/assets/audio/nested/ce5af482.ogg",
      "atlas/assets/audio/cover.png",
      "atlas/assets/maps/world.png.yaml",
    ]) {
      expect(errors()).toContain(rel);
    }
  });

  it("skips, clean, when there is no dist yet", () => {
    expect(scan()).toBe(0);
    expect(vi.mocked(console.log).mock.calls.flat().join("\n")).toMatch(/does not exist/);
  });

  it("fails a dist with no atlas/ dir, saying so", () => {
    fs.mkdirSync(path.join(root, "dist"));
    expect(scan()).not.toBe(0);
    expect(errors()).toMatch(/no atlas\//);
  });
});
