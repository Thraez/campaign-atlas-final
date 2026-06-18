import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SoundSettingsProvider } from "@/atlas/sound/SoundSettingsProvider";
import { SoundControl } from "@/atlas/sound/SoundControl";
import { _resetSoundPrefsForTests } from "@/atlas/sound/soundPrefs";

const stubDeps = {
  createContext: () => ({ state: "suspended", currentTime: 0, destination: {}, createGain: () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }), resume: async () => {}, suspend: async () => {} }) as any,
  fetchAudio: async () => new ArrayBuffer(8),
  canPlay: () => true,
};

const renderControl = () =>
  render(
    <SoundSettingsProvider deps={stubDeps as any}>
      <SoundControl />
    </SoundSettingsProvider>,
  );

describe("SoundControl", () => {
  beforeEach(() => _resetSoundPrefsForTests());

  it("shows the invite first, then the speaker after enabling", () => {
    renderControl();
    const invite = screen.getByRole("button", { name: /bring the world to life/i });
    expect(invite).toBeTruthy();
    act(() => invite.click());
    expect(screen.getByRole("button", { name: /mute|sound/i })).toBeTruthy();
  });
});
