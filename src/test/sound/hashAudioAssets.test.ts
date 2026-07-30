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
  fs.writeFileSync(
    path.join(tmpDir, "atlas", "assets", "maps", "tavern.ogg"),
    "fake-audio-content-tavern",
  );
  fs.writeFileSync(
    path.join(tmpDir, "atlas", "assets", "maps", "forest.ogg"),
    "fake-audio-content-forest",
  );
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

  it("skips an empty src without throwing (half-configured sound zone)", () => {
    const areas = [area("")];
    expect(() => hashAudioAssets(areas, tmpDir)).not.toThrow();
    const map = hashAudioAssets(areas, tmpDir);
    expect(map.size).toBe(0);
  });

  it("skips a whitespace-only src without throwing", () => {
    const areas = [area("   ")];
    expect(() => hashAudioAssets(areas, tmpDir)).not.toThrow();
  });

  it("skips a blank srcFallback without throwing", () => {
    const areas: SoundArea[] = [
      { id: "a", bed: { src: "atlas/assets/maps/tavern.ogg", srcFallback: "" } },
    ];
    const map = hashAudioAssets(areas, tmpDir);
    expect(map.size).toBe(1);
    expect(map.has("atlas/assets/maps/tavern.ogg")).toBe(true);
  });

  it("prunes a hashed file whose bed was removed from the next build", () => {
    const audioDir = path.join(tmpDir, "atlas", "assets", "audio");
    const map1 = hashAudioAssets([area("atlas/assets/maps/tavern.ogg")], tmpDir);
    const staleHashedName = path.basename(map1.get("atlas/assets/maps/tavern.ogg")!);
    expect(fs.existsSync(path.join(audioDir, staleHashedName))).toBe(true);

    hashAudioAssets([area("atlas/assets/maps/forest.ogg")], tmpDir);

    expect(fs.existsSync(path.join(audioDir, staleHashedName))).toBe(false);
  });

  it("prunes all hashed files when a build has zero areas", () => {
    const audioDir = path.join(tmpDir, "atlas", "assets", "audio");
    hashAudioAssets([area("atlas/assets/maps/tavern.ogg")], tmpDir);
    expect(fs.readdirSync(audioDir).length).toBe(1);

    hashAudioAssets([], tmpDir);

    expect(fs.readdirSync(audioDir).length).toBe(0);
  });

  it("keeps a still-referenced hashed file across builds", () => {
    const audioDir = path.join(tmpDir, "atlas", "assets", "audio");
    const areas = [area("atlas/assets/maps/tavern.ogg"), area("atlas/assets/maps/forest.ogg")];
    hashAudioAssets(areas, tmpDir);
    expect(fs.readdirSync(audioDir).length).toBe(2);

    hashAudioAssets([area("atlas/assets/maps/tavern.ogg")], tmpDir);

    const remaining = fs.readdirSync(audioDir);
    expect(remaining.length).toBe(1);
    expect(remaining[0]).toMatch(/^[a-f0-9]{8}\.ogg$/);
  });

  it("does not delete manifest.json or non-hashed-name files in the audio dir", () => {
    const audioDir = path.join(tmpDir, "atlas", "assets", "audio");
    fs.mkdirSync(audioDir, { recursive: true });
    fs.writeFileSync(path.join(audioDir, "manifest.json"), "[]");
    fs.writeFileSync(path.join(audioDir, "not-a-hash-name.ogg"), "keep-me");

    hashAudioAssets([area("atlas/assets/maps/tavern.ogg")], tmpDir);

    expect(fs.existsSync(path.join(audioDir, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(audioDir, "not-a-hash-name.ogg"))).toBe(true);
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
    const areas = [
      {
        id: "a",
        bed: { src: "atlas/assets/maps/foo.ogg", srcFallback: "atlas/assets/maps/foo.mp3" },
      },
    ];
    const rewrite = new Map([
      ["atlas/assets/maps/foo.ogg", "atlas/assets/audio/abc.ogg"],
      ["atlas/assets/maps/foo.mp3", "atlas/assets/audio/abc.mp3"],
    ]);
    expect(rewriteAudioSrcs(areas, rewrite)[0].bed.srcFallback).toBe("atlas/assets/audio/abc.mp3");
  });

  it("keeps original srcFallback when rewrite map does not contain it", () => {
    const areas = [
      {
        id: "a",
        bed: { src: "atlas/assets/maps/foo.ogg", srcFallback: "atlas/assets/maps/foo.mp3" },
      },
    ];
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
