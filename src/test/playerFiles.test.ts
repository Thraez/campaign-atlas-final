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
import { prunePlayerImagesPlugin } from "../../scripts/vite-plugin-prune-player-images";
import { run as checkPlayerFiles } from "../../scripts/check-player-files";

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
  const plugin = prunePlayerImagesPlugin();
  const logger = { info: () => {} } as unknown as ResolvedConfig["logger"];
  const configResolved = plugin.configResolved as (c: unknown) => void;
  configResolved({ root, build: { outDir: "dist" }, logger });
  (plugin.closeBundle as () => void)();
}

/** A dist/atlas with only allowed files, the shape a real player build has. */
function writeAllowedDist() {
  write(
    "dist/atlas/atlas.json",
    JSON.stringify({
      maps: [{ layers: [{ src: "atlas/assets/maps/world.fog.png" }] }],
      entities: [{ body: "![[Corven.webp]]" }],
    }),
  );
  write("dist/atlas/search-index.json", "[]");
  write("dist/atlas/.last-published.json", "{}");
  write("dist/atlas/assets/maps/world.fog.png");
  write("dist/atlas/assets/images/Corven.webp");
  write("dist/atlas/assets/images/.gitkeep", "");
  write("dist/atlas/assets/audio/ce5af482.ogg");
  write("dist/atlas/assets/audio/82635d4e.m4a");
  write("dist/atlas/assets/audio/manifest.json", "[]");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "player-files-"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("player build prune", () => {
  it("drops a .yaml and a .md copied in from public/atlas/assets", () => {
    writeAllowedDist();
    write("dist/atlas/assets/maps/world.yaml", "fog:\n  reveals: []\n");
    write("dist/atlas/assets/handouts/dm-notes.md", "# DM only");

    runPrunePlugin();

    expect(filesUnder("dist/atlas")).toEqual([
      ".last-published.json",
      "assets/audio/82635d4e.m4a",
      "assets/audio/ce5af482.ogg",
      "assets/audio/manifest.json",
      "assets/images/.gitkeep",
      "assets/images/Corven.webp",
      "assets/maps/world.fog.png",
      "atlas.json",
      "search-index.json",
    ]);
  });
});

describe("check-player-files", () => {
  const scan = () => checkPlayerFiles({ dir: path.join(root, "dist") });

  it("fails a dist with a .yaml and a .md under atlas/assets, naming each file", () => {
    writeAllowedDist();
    write("dist/atlas/assets/maps/world.yaml", "fog:\n  reveals: []\n");
    write("dist/atlas/assets/handouts/dm-notes.md", "# DM only");

    expect(scan()).not.toBe(0);
    const out = vi.mocked(console.error).mock.calls.flat().join("\n");
    expect(out).toContain("atlas/assets/maps/world.yaml");
    expect(out).toContain("atlas/assets/handouts/dm-notes.md");
  });

  it("passes a dist with only allowed files", () => {
    writeAllowedDist();
    expect(scan()).toBe(0);
  });

  it("passes allowed files with spaces and uppercase extensions", () => {
    writeAllowedDist();
    write("dist/atlas/assets/images/Old Map (v2).PNG");
    write("dist/atlas/assets/maps/My World.fog.png");
    write("dist/atlas/assets/portraits/Edric.JPEG");
    write("dist/atlas/assets/audio/ABCDEF01.OGG");
    expect(scan()).toBe(0);
  });

  it("fails files that only look allowed", () => {
    write("dist/atlas/notes.json", "{}");
    write("dist/atlas/assets/atlas.json", "{}");
    write("dist/atlas/assets/audio/cavern-drone.ogg");
    write("dist/atlas/assets/audio/nested/ce5af482.ogg");
    write("dist/atlas/assets/maps/world.png.yaml");
    write("dist/atlas/world.png");

    expect(scan()).not.toBe(0);
    const out = vi.mocked(console.error).mock.calls.flat().join("\n");
    for (const rel of [
      "atlas/notes.json",
      "atlas/assets/atlas.json",
      "atlas/assets/audio/cavern-drone.ogg",
      "atlas/assets/audio/nested/ce5af482.ogg",
      "atlas/assets/maps/world.png.yaml",
      "atlas/world.png",
    ]) {
      expect(out).toContain(rel);
    }
  });

  it("is clean when there is no built atlas yet", () => {
    expect(scan()).toBe(0);
  });
});
