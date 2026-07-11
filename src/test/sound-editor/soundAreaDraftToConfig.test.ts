import { describe, it, expect } from "vitest";
import { soundAreaDraftToConfig } from "@/atlas/sound-editor/soundAreaDraftToConfig";

describe("soundAreaDraftToConfig", () => {
  it("returns undefined when there are no areas (drops the key)", () => {
    expect(soundAreaDraftToConfig({ areas: [] })).toBeUndefined();
    expect(soundAreaDraftToConfig({ enabled: true, masterGain: 0.6, areas: [] })).toBeUndefined();
  });

  it("keeps a populated soundscape and preserves ride-on + sound-only shapes", () => {
    const out = soundAreaDraftToConfig({
      enabled: false,
      masterGain: 0.8,
      areas: [
        { id: "s0", regionId: "r1", name: "  ", bed: { src: "wind.ogg" } },
        {
          id: "s1",
          points: [
            [0, 0],
            [10, 0],
            [10, 10],
          ],
          visibility: "dm",
          bed: { src: "cave.ogg", gain: 0.4 },
        },
      ],
    })!;
    expect(out.enabled).toBe(false);
    expect(out.masterGain).toBe(0.8);
    expect(out.areas).toHaveLength(2);
    expect(out.areas![0].name).toBeUndefined(); // blank name trimmed away
    expect(out.areas![1].visibility).toBe("dm");
  });
});
