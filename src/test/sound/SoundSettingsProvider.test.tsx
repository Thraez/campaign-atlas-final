import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SoundSettingsProvider, useSoundSettings } from "@/atlas/sound/SoundSettingsProvider";
import { _resetSoundPrefsForTests, loadSoundPrefs } from "@/atlas/sound/soundPrefs";

function makeStubDeps() {
  const gainNode = () => ({
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  const mockCtx: any = {
    state: "suspended",
    currentTime: 0,
    destination: {},
    createGain: vi.fn(gainNode),
    resume: vi.fn(async () => {
      mockCtx.state = "running";
    }),
    suspend: vi.fn(async () => {
      mockCtx.state = "suspended";
    }),
    close: vi.fn(async () => {}),
  };
  return {
    deps: {
      createContext: () => mockCtx,
      fetchAudio: vi.fn(async () => new ArrayBuffer(0)),
      canPlay: vi.fn(() => true),
    },
  };
}

function CalmProbe() {
  const { calmMode, setCalmMode } = useSoundSettings();
  return (
    <button onClick={() => setCalmMode(!calmMode)}>{calmMode ? "calm-on" : "calm-off"}</button>
  );
}

function EnableProbe() {
  const { soundEnabled, enableSound } = useSoundSettings();
  return <button onClick={() => enableSound()}>{soundEnabled ? "sound-on" : "sound-off"}</button>;
}

function MuteProbe() {
  const { muted, setMuted } = useSoundSettings();
  return <button onClick={() => setMuted(!muted)}>{muted ? "muted" : "unmuted"}</button>;
}

describe("SoundSettingsProvider", () => {
  beforeEach(() => {
    _resetSoundPrefsForTests();
    document.documentElement.removeAttribute("data-calm");
  });

  it("starts from defaults and toggles calm mode, persisting + reflecting on <html>", () => {
    render(
      <SoundSettingsProvider>
        <CalmProbe />
      </SoundSettingsProvider>,
    );
    expect(screen.getByRole("button").textContent).toBe("calm-off");
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("calm-on");
    expect(document.documentElement.getAttribute("data-calm")).toBe("true");
    expect(loadSoundPrefs().calmMode).toBe(true);
  });

  it("enableSound sets soundEnabled: true and persists it", async () => {
    const { deps } = makeStubDeps();
    render(
      <SoundSettingsProvider deps={deps}>
        <EnableProbe />
      </SoundSettingsProvider>,
    );
    expect(screen.getByRole("button").textContent).toBe("sound-off");
    await act(async () => {
      screen.getByRole("button").click();
    });
    expect(screen.getByRole("button").textContent).toBe("sound-on");
    expect(loadSoundPrefs().soundEnabled).toBe(true);
  });

  it("setMuted(true/false) updates the muted value in the exposed context", () => {
    const { deps } = makeStubDeps();
    render(
      <SoundSettingsProvider deps={deps}>
        <MuteProbe />
      </SoundSettingsProvider>,
    );
    expect(screen.getByRole("button").textContent).toBe("unmuted");
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("muted");
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("unmuted");
  });

  it("muted state passes through to engine.setMuted on toggle", () => {
    const { deps } = makeStubDeps();
    const engines: any[] = [];
    function EngineCapture() {
      const { engine, muted, setMuted } = useSoundSettings();
      engines.push(engine);
      return <button onClick={() => setMuted(!muted)}>{muted ? "muted" : "unmuted"}</button>;
    }
    render(
      <SoundSettingsProvider deps={deps}>
        <EngineCapture />
      </SoundSettingsProvider>,
    );
    const spy = vi.spyOn(engines[0], "setMuted");
    act(() => screen.getByRole("button").click()); // muted: false → true
    expect(spy).toHaveBeenCalledWith(true); // effect: engine.setMuted(muted || calmMode)
  });

  it("engine ref is stable across re-renders (no new AudioEngine on state change)", () => {
    const { deps } = makeStubDeps();
    const engines: any[] = [];
    function EngineCapture() {
      const { engine, calmMode, setCalmMode } = useSoundSettings();
      engines.push(engine);
      return <button onClick={() => setCalmMode(!calmMode)}>toggle</button>;
    }
    render(
      <SoundSettingsProvider deps={deps}>
        <EngineCapture />
      </SoundSettingsProvider>,
    );
    act(() => screen.getByRole("button").click());
    expect(engines.length).toBeGreaterThanOrEqual(2);
    expect(engines[engines.length - 1]).toBe(engines[0]);
  });
});
