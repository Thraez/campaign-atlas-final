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
});
