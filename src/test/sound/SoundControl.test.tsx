import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { SoundSettingsProvider } from "@/atlas/sound/SoundSettingsProvider";
import { SoundControl } from "@/atlas/sound/SoundControl";
import { _resetSoundPrefsForTests, loadSoundPrefs } from "@/atlas/sound/soundPrefs";

const stubDeps = {
  createContext: () =>
    ({
      state: "suspended",
      currentTime: 0,
      destination: {},
      createGain: () => ({
        gain: {
          value: 0,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          cancelScheduledValues() {},
        },
        connect() {},
        disconnect() {},
      }),
      resume: async () => {},
      suspend: async () => {},
    }) as any,
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

  it("dismiss button hides the invite without enabling sound", () => {
    renderControl();
    expect(screen.getByRole("button", { name: /bring the world to life/i })).toBeTruthy();
    act(() => screen.getByRole("button", { name: /dismiss/i }).click());
    expect(screen.queryByRole("button", { name: /bring the world to life/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /mute sound|unmute sound/i })).toBeNull();
  });

  it("mute button starts with aria-label 'Mute sound' and toggles to 'Unmute sound'", () => {
    renderControl();
    act(() => screen.getByRole("button", { name: /bring the world to life/i }).click());
    const muteBtn = screen.getByRole("button", { name: "Mute sound" });
    expect(muteBtn).toBeTruthy();
    act(() => muteBtn.click());
    expect(screen.getByRole("button", { name: "Unmute sound" })).toBeTruthy();
  });

  it("calm mode button starts 'off', toggles 'on', and reflects aria-pressed", () => {
    renderControl();
    const calmBtn = screen.getByRole("button", { name: /calm mode/i });
    expect(calmBtn.textContent).toMatch(/off/i);
    expect(calmBtn.getAttribute("aria-pressed")).toBe("false");
    act(() => calmBtn.click());
    expect(calmBtn.textContent).toMatch(/on/i);
    expect(calmBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("invite is hidden when sound is enabled, even if dismiss was not clicked", () => {
    renderControl();
    act(() => screen.getByRole("button", { name: /bring the world to life/i }).click());
    expect(screen.queryByRole("button", { name: /bring the world to life/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });

  it("volume slider is absent before enabling sound", () => {
    renderControl();
    expect(screen.queryByRole("slider", { name: /volume/i })).toBeNull();
  });

  it("volume slider appears after enabling sound with default value 0.8", () => {
    renderControl();
    act(() => screen.getByRole("button", { name: /bring the world to life/i }).click());
    const slider = screen.getByRole("slider", { name: /volume/i });
    expect(slider).toBeTruthy();
    expect(Number((slider as HTMLInputElement).value)).toBeCloseTo(0.8);
  });

  it("dragging the volume slider persists the new value", () => {
    renderControl();
    act(() => screen.getByRole("button", { name: /bring the world to life/i }).click());
    const slider = screen.getByRole("slider", { name: /volume/i }) as HTMLInputElement;
    act(() => {
      fireEvent.change(slider, { target: { value: "0.3" } });
    });
    expect(Number(slider.value)).toBeCloseTo(0.3);
    expect(loadSoundPrefs().volume).toBeCloseTo(0.3);
  });
});
