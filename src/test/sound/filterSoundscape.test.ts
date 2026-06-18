import { describe, it, expect } from "vitest";
import { filterSoundscapeForPlayer } from "../../../scripts/atlas/filterSoundscape";
import type { SoundscapeConfig } from "@/atlas/content/schema";

function makeArea(id: string, visibility?: string, name?: string) {
  return {
    id,
    bed: { src: `audio/${id}.ogg` },
    ...(visibility ? { visibility: visibility as SoundscapeConfig["areas"][0]["visibility"] } : {}),
    ...(name ? { name } : {}),
  };
}

describe("filterSoundscapeForPlayer", () => {
  it("drops dm-visibility areas", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("tavern", "player"), makeArea("dungeon", "dm")],
    };
    const result = filterSoundscapeForPlayer(sc);
    expect(result?.areas).toHaveLength(1);
    expect(result?.areas![0].id).toBe("area-0");
  });

  it("drops hidden-visibility areas", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("forest", "player"), makeArea("secret", "hidden")],
    };
    const result = filterSoundscapeForPlayer(sc);
    expect(result?.areas).toHaveLength(1);
  });

  it("keeps player and rumor areas", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("city", "player"), makeArea("rumored", "rumor")],
    };
    const result = filterSoundscapeForPlayer(sc);
    expect(result?.areas).toHaveLength(2);
  });

  it("keeps areas with no visibility set (default player-visible)", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("ambient")],
    };
    const result = filterSoundscapeForPlayer(sc);
    expect(result?.areas).toHaveLength(1);
  });

  it("neutralises area IDs to positional indices", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("secret-cave", "player"), makeArea("town-square", "player")],
    };
    const result = filterSoundscapeForPlayer(sc);
    expect(result?.areas![0].id).toBe("area-0");
    expect(result?.areas![1].id).toBe("area-1");
  });

  it("strips name field from areas", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("tavern", "player", "Ye Olde Tavern (DM label)")],
    };
    const result = filterSoundscapeForPlayer(sc);
    expect(result?.areas![0].name).toBeUndefined();
  });

  it("preserves bed src, gain, and other safe fields", () => {
    const sc: SoundscapeConfig = {
      areas: [{ id: "x", bed: { src: "audio/x.ogg", gain: 0.5, srcFallback: "audio/x.mp3" }, visibility: "player" }],
    };
    const result = filterSoundscapeForPlayer(sc);
    expect(result?.areas![0].bed.src).toBe("audio/x.ogg");
    expect(result?.areas![0].bed.gain).toBe(0.5);
    expect(result?.areas![0].bed.srcFallback).toBe("audio/x.mp3");
  });

  it("preserves masterGain and enabled flag", () => {
    const sc: SoundscapeConfig = { enabled: true, masterGain: 0.6, areas: [] };
    const result = filterSoundscapeForPlayer(sc);
    expect(result?.enabled).toBe(true);
    expect(result?.masterGain).toBe(0.6);
  });

  it("returns undefined when input is undefined", () => {
    expect(filterSoundscapeForPlayer(undefined)).toBeUndefined();
  });

  it("returns empty areas when all areas were DM-only", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("dm-area", "dm"), makeArea("hidden-area", "hidden")],
    };
    const result = filterSoundscapeForPlayer(sc);
    expect(result?.areas).toHaveLength(0);
  });
});
