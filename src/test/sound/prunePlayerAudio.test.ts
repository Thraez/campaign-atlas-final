import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  isSourceNamedBed,
  pruneSourceNamedBeds,
} from "../../../scripts/vite-plugin-prune-player-audio";

describe("isSourceNamedBed", () => {
  it("flags source-named audio beds", () => {
    expect(isSourceNamedBed("cavern-drone.ogg")).toBe(true);
    expect(isSourceNamedBed("cavern-drone.m4a")).toBe(true);
    expect(isSourceNamedBed("water-trickle.wav")).toBe(true);
  });

  it("spares content-hashed copies (8 hex chars + ext)", () => {
    expect(isSourceNamedBed("ce5af482.ogg")).toBe(false);
    expect(isSourceNamedBed("82635d4e.m4a")).toBe(false);
    expect(isSourceNamedBed("003bd929.ogg")).toBe(false);
  });

  it("spares non-audio files (e.g. the DM picker manifest)", () => {
    expect(isSourceNamedBed("manifest.json")).toBe(false);
    expect(isSourceNamedBed("index.html")).toBe(false);
  });

  it("does not treat a short/long hex-ish stem as hashed", () => {
    // 7 hex chars, not 8 → still a source name.
    expect(isSourceNamedBed("abc1234.ogg")).toBe(true);
    // 8 chars but not all hex → still a source name.
    expect(isSourceNamedBed("cavern12.ogg")).toBe(true);
  });
});

describe("pruneSourceNamedBeds", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "prune-audio-"));
    // Mirror the real dist/atlas/assets/audio layout: a source-named bed and
    // its hashed twin for each of two formats, plus the picker manifest.
    fs.writeFileSync(path.join(dir, "cavern-drone.ogg"), "a".repeat(100));
    fs.writeFileSync(path.join(dir, "ce5af482.ogg"), "a".repeat(100)); // hashed twin
    fs.writeFileSync(path.join(dir, "cavern-drone.m4a"), "b".repeat(200));
    fs.writeFileSync(path.join(dir, "82635d4e.m4a"), "b".repeat(200)); // hashed twin
    fs.writeFileSync(path.join(dir, "manifest.json"), "[]");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("removes only the source-named beds, keeps hashed twins + manifest", () => {
    const { removed, bytes } = pruneSourceNamedBeds(dir);
    expect(removed.sort()).toEqual(["cavern-drone.m4a", "cavern-drone.ogg"]);
    expect(bytes).toBe(300); // 100 (ogg) + 200 (m4a)

    const left = fs.readdirSync(dir).sort();
    expect(left).toEqual(["82635d4e.m4a", "ce5af482.ogg", "manifest.json"]);
  });

  it("is idempotent — a second run removes nothing", () => {
    pruneSourceNamedBeds(dir);
    const second = pruneSourceNamedBeds(dir);
    expect(second.removed).toEqual([]);
    expect(second.bytes).toBe(0);
  });

  it("no-ops on a missing directory", () => {
    const { removed, bytes } = pruneSourceNamedBeds(path.join(dir, "does-not-exist"));
    expect(removed).toEqual([]);
    expect(bytes).toBe(0);
  });
});
