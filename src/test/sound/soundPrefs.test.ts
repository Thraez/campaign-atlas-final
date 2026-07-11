import { describe, it, expect, beforeEach } from "vitest";
import { loadSoundPrefs, saveSoundPrefs, DEFAULT_PREFS, _resetSoundPrefsForTests } from "@/atlas/sound/soundPrefs";

describe("soundPrefs", () => {
  beforeEach(() => _resetSoundPrefsForTests());

  it("returns defaults when nothing is stored", () => {
    expect(loadSoundPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("round-trips saved prefs", () => {
    saveSoundPrefs({ soundEnabled: true, muted: false, calmMode: true });
    expect(loadSoundPrefs()).toEqual({ soundEnabled: true, muted: false, calmMode: true });
  });

  it("degrades to defaults on a corrupt blob", () => {
    localStorage.setItem("atlas-player-sound-v1", "{not json");
    expect(loadSoundPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("degrades to defaults when stored JSON is null", () => {
    localStorage.setItem("atlas-player-sound-v1", "null");
    expect(loadSoundPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("degrades to defaults when stored JSON is a non-object (number)", () => {
    localStorage.setItem("atlas-player-sound-v1", "42");
    expect(loadSoundPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("fills missing fields from defaults when stored object is partial", () => {
    localStorage.setItem("atlas-player-sound-v1", JSON.stringify({ soundEnabled: true }));
    expect(loadSoundPrefs()).toEqual({ soundEnabled: true, muted: false, calmMode: false });
  });

  it("falls back per-field to defaults when stored fields are non-boolean", () => {
    localStorage.setItem("atlas-player-sound-v1", JSON.stringify({ soundEnabled: "yes", muted: 1, calmMode: null }));
    expect(loadSoundPrefs()).toEqual(DEFAULT_PREFS);
  });
});
