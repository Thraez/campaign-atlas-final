import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSoundPrefs,
  saveSoundPrefs,
  DEFAULT_PREFS,
  _resetSoundPrefsForTests,
} from "@/atlas/sound/soundPrefs";

describe("soundPrefs", () => {
  beforeEach(() => _resetSoundPrefsForTests());

  it("returns defaults when nothing is stored", () => {
    expect(loadSoundPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("default volume is 0.8", () => {
    expect(DEFAULT_PREFS.volume).toBe(0.8);
    expect(loadSoundPrefs().volume).toBe(0.8);
  });

  it("round-trips saved prefs including volume", () => {
    saveSoundPrefs({ soundEnabled: true, muted: false, calmMode: true, volume: 0.5 });
    expect(loadSoundPrefs()).toEqual({
      soundEnabled: true,
      muted: false,
      calmMode: true,
      volume: 0.5,
    });
  });

  it("persists volume and restores it on reload", () => {
    saveSoundPrefs({ ...DEFAULT_PREFS, volume: 0.3 });
    expect(loadSoundPrefs().volume).toBe(0.3);
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
    expect(loadSoundPrefs()).toEqual({
      soundEnabled: true,
      muted: false,
      calmMode: false,
      volume: 0.8,
    });
  });

  it("falls back per-field to defaults when stored fields are non-boolean", () => {
    localStorage.setItem(
      "atlas-player-sound-v1",
      JSON.stringify({ soundEnabled: "yes", muted: 1, calmMode: null }),
    );
    expect(loadSoundPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("degrades volume to default when stored value is out of range", () => {
    localStorage.setItem(
      "atlas-player-sound-v1",
      JSON.stringify({ ...DEFAULT_PREFS, volume: 1.5 }),
    );
    expect(loadSoundPrefs().volume).toBe(DEFAULT_PREFS.volume);
  });

  it("degrades volume to default when stored value is a non-number", () => {
    localStorage.setItem(
      "atlas-player-sound-v1",
      JSON.stringify({ ...DEFAULT_PREFS, volume: "loud" }),
    );
    expect(loadSoundPrefs().volume).toBe(DEFAULT_PREFS.volume);
  });

  it("accepts volume at boundary values 0 and 1", () => {
    saveSoundPrefs({ ...DEFAULT_PREFS, volume: 0 });
    expect(loadSoundPrefs().volume).toBe(0);
    saveSoundPrefs({ ...DEFAULT_PREFS, volume: 1 });
    expect(loadSoundPrefs().volume).toBe(1);
  });
});
