import { describe, it, expect, vi, afterEach } from "vitest";
import { realAudioDeps } from "@/atlas/sound/realAudioDeps";

describe("realAudioDeps.canPlay", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts non-ogg extensions unconditionally", () => {
    vi.stubGlobal(
      "Audio",
      class {
        canPlayType() {
          return "";
        }
      } as unknown as typeof Audio,
    );
    expect(realAudioDeps.canPlay("wind-hollow.m4a")).toBe(true);
    expect(realAudioDeps.canPlay("wind-hollow.mp3")).toBe(true);
  });

  it("probes the opus codec string for .ogg sources", () => {
    const canPlayType = vi.fn((type: string) => (type.includes("opus") ? "probably" : ""));
    vi.stubGlobal(
      "Audio",
      class {
        canPlayType = canPlayType;
      } as unknown as typeof Audio,
    );
    expect(realAudioDeps.canPlay("wind-hollow.ogg")).toBe(true);
    expect(canPlayType).toHaveBeenCalledWith(expect.stringContaining("opus"));
  });

  it("rejects ogg when the browser cannot decode opus, accepts the m4a twin", () => {
    // Simulates a browser that reports Vorbis support but not Opus — this only
    // discriminates a fixed probe from a Vorbis-only probe if the probe string
    // actually matters (i.e. the test would fail against the old vorbis probe).
    vi.stubGlobal(
      "Audio",
      class {
        canPlayType(type: string) {
          return type.includes("vorbis") ? "probably" : "";
        }
      } as unknown as typeof Audio,
    );
    expect(realAudioDeps.canPlay("wind-hollow.ogg")).toBe(false);
    expect(realAudioDeps.canPlay("wind-hollow.m4a")).toBe(true);
  });
});
