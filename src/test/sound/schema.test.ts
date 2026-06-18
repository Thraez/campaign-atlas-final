import { describe, it, expect } from "vitest";
import type { MapDocument, SoundscapeConfig, SoundArea, SoundBed } from "@/atlas/content/schema";

describe("soundscape schema", () => {
  it("accepts a fully-formed soundscape on a map (type-level + runtime shape)", () => {
    const bed: SoundBed = { src: "a.ogg", srcFallback: "a.mp3", gain: 0.7 };
    const area: SoundArea = { id: "s0", regionId: "brackenfjall", bed };
    const sound: SoundscapeConfig = { enabled: true, masterGain: 0.6, areas: [area] };
    const map = { id: "m", name: "M", width: 10, height: 10, soundscape: sound } as Partial<MapDocument>;
    expect(map.soundscape?.areas?.[0].bed.src).toBe("a.ogg");
  });
});
