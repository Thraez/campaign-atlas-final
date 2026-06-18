import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { hashAudioAssets } from "../../../scripts/atlas/hashAudioAssets";
import type { SoundArea } from "@/atlas/content/schema";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hash-audio-"));
  // Create fake public/atlas/assets/audio dir structure
  fs.mkdirSync(path.join(tmpDir, "atlas", "assets", "maps"), { recursive: true });
  // Create a fake audio file in the public dir
  fs.writeFileSync(path.join(tmpDir, "atlas", "assets", "maps", "tavern.ogg"), "fake-audio-content-tavern");
  fs.writeFileSync(path.join(tmpDir, "atlas", "assets", "maps", "forest.ogg"), "fake-audio-content-forest");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function area(src: string, fallback?: string): SoundArea {
  return {
    id: "a",
    bed: { src, ...(fallback ? { srcFallback: fallback } : {}) },
  };
}

describe("hashAudioAssets", () => {
  it("copies audio file to hashed name and returns src map", () => {
    const areas = [area("atlas/assets/maps/tavern.ogg")];
    const map = hashAudioAssets(areas, tmpDir);
    expect(map.size).toBe(1);
    const hashedSrc = map.get("atlas/assets/maps/tavern.ogg");
    expect(hashedSrc).toMatch(/^atlas\/assets\/audio\/[a-f0-9]{8}\.ogg$/);
    // File must exist
    expect(fs.existsSync(path.join(tmpDir, hashedSrc!))).toBe(true);
  });

  it("deduplicates: two areas referencing same src produce one copy", () => {
    const areas = [area("atlas/assets/maps/tavern.ogg"), area("atlas/assets/maps/tavern.ogg")];
    const map = hashAudioAssets(areas, tmpDir);
    expect(map.size).toBe(1);
    const audioDir = path.join(tmpDir, "atlas", "assets", "audio");
    expect(fs.readdirSync(audioDir).length).toBe(1);
  });

  it("handles srcFallback as a separate entry", () => {
    const areas = [area("atlas/assets/maps/tavern.ogg", "atlas/assets/maps/forest.ogg")];
    const map = hashAudioAssets(areas, tmpDir);
    expect(map.size).toBe(2);
    expect(map.has("atlas/assets/maps/tavern.ogg")).toBe(true);
    expect(map.has("atlas/assets/maps/forest.ogg")).toBe(true);
  });

  it("same content → same hash (idempotent)", () => {
    const areas = [area("atlas/assets/maps/tavern.ogg")];
    const map1 = hashAudioAssets(areas, tmpDir);
    const map2 = hashAudioAssets(areas, tmpDir);
    expect(map1.get("atlas/assets/maps/tavern.ogg")).toBe(map2.get("atlas/assets/maps/tavern.ogg"));
  });

  it("skips http/https URLs", () => {
    const areas = [area("https://cdn.example.com/sound.ogg")];
    const map = hashAudioAssets(areas, tmpDir);
    expect(map.size).toBe(0);
  });

  it("returns empty map when no areas", () => {
    const map = hashAudioAssets([], tmpDir);
    expect(map.size).toBe(0);
  });
});
