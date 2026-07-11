import { describe, it, expect } from "vitest";
import { audioBasenames } from "@/atlas/sound-editor/listAvailableAudio";

describe("audioBasenames", () => {
  it("keeps only audio files and returns basenames, sorted, de-duped", () => {
    expect(audioBasenames(["a/b/wind.ogg", "x/cave.mp3", "notes.txt", "x/cave.mp3"])).toEqual([
      "cave.mp3",
      "wind.ogg",
    ]);
  });
  it("returns [] for an empty or non-audio listing", () => {
    expect(audioBasenames([])).toEqual([]);
    expect(audioBasenames(["readme.md"])).toEqual([]);
  });
});
