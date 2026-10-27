/**
 * Vite copies all of public/ into dist/, so a DM portrait saved to
 * public/atlas/assets/images shipped to players even though no player note
 * shows it. The prune keeps only the images the player JSON names.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isReferenced } from "../../scripts/atlas/playerImageRefs";
import { pruneUnreferencedImages } from "../../scripts/vite-plugin-prune-player-images";

describe("isReferenced", () => {
  it("matches a file named by path or by bare embed name", () => {
    expect(isReferenced("Map.png", '{"src":"/atlas/assets/maps/Map.png"}')).toBe(true);
    expect(isReferenced("Corven.webp", '{"body":"![[Corven.webp]]"}')).toBe(true);
  });

  it("matches a URL-encoded name", () => {
    expect(isReferenced("old map.png", '{"src":"/atlas/assets/maps/old%20map.png"}')).toBe(true);
  });

  it("does not match a name the JSON never mentions", () => {
    expect(isReferenced("Corven.webp", '{"title":"Corven"}')).toBe(false);
  });
});

describe("pruneUnreferencedImages", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "prune-images-"));
    for (const sub of ["images", "maps", "audio"]) fs.mkdirSync(path.join(dir, sub));
    fs.writeFileSync(path.join(dir, "images", "Corven.webp"), "x".repeat(10));
    fs.writeFileSync(path.join(dir, "images", "shown.webp"), "x");
    fs.writeFileSync(path.join(dir, "images", ".gitkeep"), "");
    fs.writeFileSync(path.join(dir, "maps", "world.png"), "x");
    fs.writeFileSync(path.join(dir, "maps", "dm-only.png"), "x".repeat(5));
    fs.writeFileSync(path.join(dir, "maps", "world.yaml"), "maps: []");
    fs.writeFileSync(path.join(dir, "audio", "cave.ogg"), "x");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("removes images the player JSON does not name and keeps the rest", () => {
    const json = '{"body":"![[shown.webp]]","layers":[{"src":"/atlas/assets/maps/world.png"}]}';
    const { removed, bytes } = pruneUnreferencedImages(dir, json);

    expect(removed.sort()).toEqual(["images/Corven.webp", "maps/dm-only.png"]);
    expect(bytes).toBe(15);
    expect(fs.readdirSync(path.join(dir, "images")).sort()).toEqual([".gitkeep", "shown.webp"]);
    expect(fs.readdirSync(path.join(dir, "maps")).sort()).toEqual(["world.png", "world.yaml"]);
    expect(fs.readdirSync(path.join(dir, "audio"))).toEqual(["cave.ogg"]);
  });

  it("is a no-op when the assets dir is absent", () => {
    expect(pruneUnreferencedImages(path.join(dir, "nope"), "{}")).toEqual({
      removed: [],
      bytes: 0,
    });
  });
});
