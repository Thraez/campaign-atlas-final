import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { SoundSettingsProvider, useSoundSettings } from "@/atlas/sound/SoundSettingsProvider";
import { SoundControl } from "@/atlas/sound/SoundControl";
import { _resetSoundPrefsForTests, loadSoundPrefs } from "@/atlas/sound/soundPrefs";

const stubDeps = {
  createContext: () => {
    const ctx: any = {
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
      resume: async () => {
        ctx.state = "running";
      },
      suspend: async () => {
        ctx.state = "suspended";
      },
    };
    return ctx;
  },
  fetchAudio: async () => new ArrayBuffer(8),
  canPlay: () => true,
};

/** Click the invite; enabling waits for the AudioContext to reach running. */
async function enable() {
  await act(async () => {
    screen.getByRole("button", { name: /bring the world to life/i }).click();
  });
}

const renderControl = (props: { hasSoundscape?: boolean } = {}) =>
  render(
    <SoundSettingsProvider deps={stubDeps as any} audioAvailable={true}>
      <SoundControl {...props} />
    </SoundSettingsProvider>,
  );

function SimulateAmbience({ playing }: { playing: boolean }) {
  const { setAmbiencePlaying } = useSoundSettings();
  useEffect(() => {
    setAmbiencePlaying(playing);
  }, [setAmbiencePlaying, playing]);
  return null;
}

const renderWithAmbience = (playing: boolean) =>
  render(
    <SoundSettingsProvider deps={stubDeps as any} audioAvailable={true}>
      <SoundControl />
      <SimulateAmbience playing={playing} />
    </SoundSettingsProvider>,
  );

describe("SoundControl", () => {
  beforeEach(() => _resetSoundPrefsForTests());
  afterEach(() => cleanup());

  it("shows the invite first, then the speaker after enabling", async () => {
    renderControl();
    const invite = screen.getByRole("button", { name: /bring the world to life/i });
    expect(invite).toBeTruthy();
    await act(async () => invite.click());
    expect(screen.getByRole("button", { name: /mute|sound/i })).toBeTruthy();
  });

  it("dismiss button hides the invite without enabling sound", () => {
    renderControl();
    expect(screen.getByRole("button", { name: /bring the world to life/i })).toBeTruthy();
    act(() => screen.getByRole("button", { name: /dismiss/i }).click());
    expect(screen.queryByRole("button", { name: /bring the world to life/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /mute sound|unmute sound/i })).toBeNull();
  });

  it("mute button starts with aria-label 'Mute sound' and toggles to 'Unmute sound'", async () => {
    renderControl();
    await enable();
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

  it("invite is hidden when sound is enabled, even if dismiss was not clicked", async () => {
    renderControl();
    await enable();
    expect(screen.queryByRole("button", { name: /bring the world to life/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });

  it("volume slider is absent before enabling sound", () => {
    renderControl();
    expect(screen.queryByRole("slider", { name: /volume/i })).toBeNull();
  });

  it("volume slider appears after enabling sound with default value 0.8", async () => {
    renderControl();
    await enable();
    const slider = screen.getByRole("slider", { name: /volume/i });
    expect(slider).toBeTruthy();
    expect(Number((slider as HTMLInputElement).value)).toBeCloseTo(0.8);
  });

  it("dragging the volume slider persists the new value", async () => {
    renderControl();
    await enable();
    const slider = screen.getByRole("slider", { name: /volume/i }) as HTMLInputElement;
    act(() => {
      fireEvent.change(slider, { target: { value: "0.3" } });
    });
    expect(Number(slider.value)).toBeCloseTo(0.3);
    expect(loadSoundPrefs().volume).toBeCloseTo(0.3);
  });
});

describe("Q35 — ambience playing indicator", () => {
  beforeEach(() => _resetSoundPrefsForTests());
  afterEach(() => cleanup());

  it("live region announces 'Ambience playing' when a bed is active and sound is enabled", async () => {
    renderWithAmbience(true);
    await enable();
    expect(screen.getByRole("status").textContent).toBe("Ambience playing");
  });

  it("live region is empty when muted (indicator hidden)", async () => {
    renderWithAmbience(true);
    await enable();
    act(() => screen.getByRole("button", { name: "Mute sound" }).click());
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("live region is empty before sound is enabled even if a bed would be active", () => {
    renderWithAmbience(true);
    // sound not yet enabled — indicator must not show
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("no area name appears — only the generic label", async () => {
    renderWithAmbience(true);
    await enable();
    // The live region contains only the hardcoded generic string, no area name derived from soundscape
    expect(screen.getByRole("status").textContent).toBe("Ambience playing");
    expect(screen.queryByText(/area-\d/i)).toBeNull();
  });
});

describe("Q37 — graceful fallback when Web Audio is unavailable", () => {
  beforeEach(() => _resetSoundPrefsForTests());
  afterEach(() => cleanup());

  const renderWithAudioAvailable = (audioAvailable: boolean) =>
    render(
      <SoundSettingsProvider deps={stubDeps as any} audioAvailable={audioAvailable}>
        <SoundControl hasSoundscape={true} />
      </SoundSettingsProvider>,
    );

  it("invite is hidden when audioAvailable is false", () => {
    renderWithAudioAvailable(false);
    expect(screen.queryByRole("button", { name: /bring the world to life/i })).toBeNull();
  });

  it("mute and volume controls are hidden when audioAvailable is false", () => {
    renderWithAudioAvailable(false);
    expect(screen.queryByRole("button", { name: /mute sound|unmute sound/i })).toBeNull();
    expect(screen.queryByRole("slider", { name: /volume/i })).toBeNull();
  });

  it("calm mode toggle remains visible when audioAvailable is false", () => {
    renderWithAudioAvailable(false);
    expect(screen.getByRole("button", { name: /calm mode/i })).toBeTruthy();
  });
});

describe("Q36 — hide sound controls when map has no soundscape", () => {
  beforeEach(() => _resetSoundPrefsForTests());
  afterEach(() => cleanup());

  it("invite and mute controls are hidden when hasSoundscape is false", () => {
    renderControl({ hasSoundscape: false });
    expect(screen.queryByRole("button", { name: /bring the world to life/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /mute sound|unmute sound/i })).toBeNull();
    expect(screen.queryByRole("slider", { name: /volume/i })).toBeNull();
  });

  it("calm mode toggle remains visible when hasSoundscape is false", () => {
    renderControl({ hasSoundscape: false });
    expect(screen.getByRole("button", { name: /calm mode/i })).toBeTruthy();
  });

  it("all controls render when hasSoundscape is true", () => {
    renderControl({ hasSoundscape: true });
    expect(screen.getByRole("button", { name: /bring the world to life/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /calm mode/i })).toBeTruthy();
  });
});
