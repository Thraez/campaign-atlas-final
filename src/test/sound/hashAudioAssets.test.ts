import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { hashAudioAssets, rewriteAudioSrcs } from "../../../scripts/atlas/hashAudioAssets";
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

describe("rewriteAudioSrcs", () => {
  it("rewrites src when rewrite map contains it", () => {
    const areas = [{ id: "a", bed: { src: "atlas/assets/maps/foo.ogg" } }];
    const rewrite = new Map([["atlas/assets/maps/foo.ogg", "atlas/assets/audio/abc12345.ogg"]]);
    expect(rewriteAudioSrcs(areas, rewrite)[0].bed.src).toBe("atlas/assets/audio/abc12345.ogg");
  });

  it("keeps original src when rewrite map does not contain it", () => {
    const areas = [{ id: "a", bed: { src: "atlas/assets/maps/bar.ogg" } }];
    expect(rewriteAudioSrcs(areas, new Map())[0].bed.src).toBe("atlas/assets/maps/bar.ogg");
  });

  it("rewrites srcFallback when rewrite map contains it", () => {
    const areas = [{ id: "a", bed: { src: "atlas/assets/maps/foo.ogg", srcFallback: "atlas/assets/maps/foo.mp3" } }];
    const rewrite = new Map([
      ["atlas/assets/maps/foo.ogg", "atlas/assets/audio/abc.ogg"],
      ["atlas/assets/maps/foo.mp3", "atlas/assets/audio/abc.mp3"],
    ]);
    expect(rewriteAudioSrcs(areas, rewrite)[0].bed.srcFallback).toBe("atlas/assets/audio/abc.mp3");
  });

  it("keeps original srcFallback when rewrite map does not contain it", () => {
    const areas = [{ id: "a", bed: { src: "atlas/assets/maps/foo.ogg", srcFallback: "atlas/assets/maps/foo.mp3" } }];
    const rewrite = new Map([["atlas/assets/maps/foo.ogg", "atlas/assets/audio/abc.ogg"]]);
    expect(rewriteAudioSrcs(areas, rewrite)[0].bed.srcFallback).toBe("atlas/assets/maps/foo.mp3");
  });

  it("omits srcFallback from output when area has no srcFallback", () => {
    const areas = [{ id: "a", bed: { src: "atlas/assets/maps/foo.ogg" } }];
    const rewrite = new Map([["atlas/assets/maps/foo.ogg", "atlas/assets/audio/abc.ogg"]]);
    expect(rewriteAudioSrcs(areas, rewrite)[0].bed.srcFallback).toBeUndefined();
  });

  it("returns empty array when areas is empty", () => {
    expect(rewriteAudioSrcs([], new Map())).toEqual([]);
  });

  it("rewrites all areas in a multi-area array", () => {
    const areas = [
      { id: "a1", bed: { src: "atlas/assets/maps/foo.ogg" } },
      { id: "a2", bed: { src: "atlas/assets/maps/bar.ogg" } },
    ];
    const rewrite = new Map([
      ["atlas/assets/maps/foo.ogg", "atlas/assets/audio/aaa.ogg"],
      ["atlas/assets/maps/bar.ogg", "atlas/assets/audio/bbb.ogg"],
    ]);
    const result = rewriteAudioSrcs(areas, rewrite);
    expect(result[0].bed.src).toBe("atlas/assets/audio/aaa.ogg");
    expect(result[1].bed.src).toBe("atlas/assets/audio/bbb.ogg");
  });

  it("does not mutate the original areas", () => {
    const areas = [{ id: "a", bed: { src: "atlas/assets/maps/foo.ogg" } }];
    const rewrite = new Map([["atlas/assets/maps/foo.ogg", "atlas/assets/audio/abc.ogg"]]);
    rewriteAudioSrcs(areas, rewrite);
    expect(areas[0].bed.src).toBe("atlas/assets/maps/foo.ogg");
  });
});
