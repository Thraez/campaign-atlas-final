import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeAudioManifest } from "../../../scripts/atlas/hashAudioAssets";

let publicDir: string;
let audioDir: string;

beforeEach(() => {
  publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-manifest-"));
  audioDir = path.join(publicDir, "atlas", "assets", "audio");
});

afterEach(() => {
  fs.rmSync(publicDir, { recursive: true, force: true });
});

describe("writeAudioManifest", () => {
  it("lists source audio basenames sorted, excluding hashed copies, the manifest itself and non-audio files", () => {
    fs.mkdirSync(audioDir, { recursive: true });
    for (const f of [
      "wind-hollow.wav",
      "cavern-drone.wav",
      "fb96ecf7.wav", // hashed copy — excluded by 8-hex pattern
      "notes.txt", // not audio
      "manifest.json", // never lists itself
    ]) {
      fs.writeFileSync(path.join(audioDir, f), "x");
    }

    const listed = writeAudioManifest(publicDir);

    expect(listed).toEqual(["cavern-drone.wav", "wind-hollow.wav"]);
    const onDisk = JSON.parse(fs.readFileSync(path.join(audioDir, "manifest.json"), "utf8"));
    expect(onDisk).toEqual(listed);
  });

  it("returns [] and writes nothing when the audio dir does not exist", () => {
    const listed = writeAudioManifest(publicDir);
    expect(listed).toEqual([]);
    expect(fs.existsSync(path.join(audioDir, "manifest.json"))).toBe(false);
  });

  it("is idempotent: a second run overwrites with the same content", () => {
    fs.mkdirSync(audioDir, { recursive: true });
    fs.writeFileSync(path.join(audioDir, "water-trickle.wav"), "x");
    writeAudioManifest(publicDir);
    const listed = writeAudioManifest(publicDir);
    expect(listed).toEqual(["water-trickle.wav"]);
    const onDisk = JSON.parse(fs.readFileSync(path.join(audioDir, "manifest.json"), "utf8"));
    expect(onDisk).toEqual(["water-trickle.wav"]);
  });
});
