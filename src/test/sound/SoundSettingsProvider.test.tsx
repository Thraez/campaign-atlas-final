import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
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

function VolumeProbe() {
  const { volume, setVolume } = useSoundSettings();
  return (
    <button onClick={() => setVolume(0.4)} data-volume={volume}>
      volume-{volume}
    </button>
  );
}

function GainProbe() {
  const { engine, setMapMasterGain, setVolume } = useSoundSettings();
  return (
    <>
      <button id="vol" onClick={() => setVolume(0.5)}>
        set-vol
      </button>
      <button id="gain" onClick={() => setMapMasterGain(0.6)}>
        set-gain
      </button>
      <span data-testid="engine-ref">{String(!!engine)}</span>
    </>
  );
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

  it("setVolume updates volume in context and persists it", () => {
    const { deps } = makeStubDeps();
    render(
      <SoundSettingsProvider deps={deps}>
        <VolumeProbe />
      </SoundSettingsProvider>,
    );
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("data-volume")).toBe("0.8");
    act(() => btn.click());
    expect(btn.getAttribute("data-volume")).toBe("0.4");
    expect(loadSoundPrefs().volume).toBe(0.4);
  });

  describe("Q34 — AudioContext suspend/resume on mute/calm/visibility", () => {
    afterEach(() => {
      vi.useRealTimers();
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
    });

    it("muting suspends the engine after the 0.2s ramp delay", async () => {
      vi.useFakeTimers();
      const { deps } = makeStubDeps();
      const engines: any[] = [];
      function MuteCapture() {
        const { engine, muted, setMuted } = useSoundSettings();
        engines.push(engine);
        return <button onClick={() => setMuted(!muted)}>{muted ? "muted" : "unmuted"}</button>;
      }
      render(
        <SoundSettingsProvider deps={deps}>
          <MuteCapture />
        </SoundSettingsProvider>,
      );
      const engine = engines[0];
      const suspendSpy = vi.spyOn(engine, "suspend");
      act(() => screen.getByRole("button").click()); // mute
      expect(suspendSpy).not.toHaveBeenCalled(); // not yet — ramp still settling
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(suspendSpy).toHaveBeenCalledTimes(1);
    });

    it("unmuting resumes the engine immediately (page visible)", async () => {
      vi.useFakeTimers();
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      const { deps } = makeStubDeps();
      const engines: any[] = [];
      function MuteCapture() {
        const { engine, muted, setMuted } = useSoundSettings();
        engines.push(engine);
        return <button onClick={() => setMuted(!muted)}>{muted ? "muted" : "unmuted"}</button>;
      }
      render(
        <SoundSettingsProvider deps={deps}>
          <MuteCapture />
        </SoundSettingsProvider>,
      );
      const engine = engines[0];
      // Mute then advance past the ramp so the context is suspended.
      act(() => screen.getByRole("button").click());
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      const resumeSpy = vi.spyOn(engine, "resume");
      // Unmute — should resume immediately.
      act(() => screen.getByRole("button").click());
      expect(resumeSpy).toHaveBeenCalledTimes(1);
    });

    it("visibilitychange does not resume when muted", () => {
      const { deps } = makeStubDeps();
      const engines: any[] = [];
      function MuteCapture() {
        const { engine, muted, setMuted } = useSoundSettings();
        engines.push(engine);
        return <button onClick={() => setMuted(!muted)}>{muted ? "muted" : "unmuted"}</button>;
      }
      render(
        <SoundSettingsProvider deps={deps}>
          <MuteCapture />
        </SoundSettingsProvider>,
      );
      const engine = engines[0];
      act(() => screen.getByRole("button").click()); // mute
      const resumeSpy = vi.spyOn(engine, "resume");
      // Simulate page becoming visible while muted.
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      expect(resumeSpy).not.toHaveBeenCalled();
    });
  });

  describe("Q37 — graceful Web Audio fallback", () => {
    it("audioAvailable prop is exposed in context", () => {
      const { deps } = makeStubDeps();
      let captured: boolean | undefined;
      function Probe() {
        const { audioAvailable } = useSoundSettings();
        captured = audioAvailable;
        return null;
      }
      render(
        <SoundSettingsProvider deps={deps} audioAvailable={false}>
          <Probe />
        </SoundSettingsProvider>,
      );
      expect(captured).toBe(false);
    });

    it("enableSound rolls back soundEnabled to false when unlock() rejects", async () => {
      const failingDeps = {
        createContext: () => {
          throw new Error("Web Audio not available");
        },
        fetchAudio: async () => new ArrayBuffer(0),
        canPlay: () => true,
      };
      function Probe() {
        const { soundEnabled, enableSound } = useSoundSettings();
        return (
          <button onClick={() => enableSound()}>{soundEnabled ? "sound-on" : "sound-off"}</button>
        );
      }
      render(
        <SoundSettingsProvider deps={failingDeps as any} audioAvailable={true}>
          <Probe />
        </SoundSettingsProvider>,
      );
      expect(screen.getByRole("button").textContent).toBe("sound-off");
      await act(async () => {
        screen.getByRole("button").click();
        // Flush microtasks so the rejection + catch run
        await Promise.resolve();
      });
      expect(screen.getByRole("button").textContent).toBe("sound-off");
    });
  });

  describe("Q38 — prefers-reduced-motion decoupled from audio", () => {
    it("motionReduced=true sets data-calm on <html> without muting the engine", () => {
      const { deps } = makeStubDeps();
      const engines: any[] = [];
      function EngineCapture() {
        const { engine } = useSoundSettings();
        engines.push(engine);
        return null;
      }
      render(
        <SoundSettingsProvider deps={deps} motionReduced={true}>
          <EngineCapture />
        </SoundSettingsProvider>,
      );
      expect(document.documentElement.getAttribute("data-calm")).toBe("true");
      const spy = vi.spyOn(engines[0], "setMuted");
      // engine.setMuted should have been called with false (muted=false, calmMode=false)
      expect(spy).not.toHaveBeenCalledWith(true);
    });

    it("motionReduced=false with calmMode=false leaves data-calm absent", () => {
      const { deps } = makeStubDeps();
      render(
        <SoundSettingsProvider deps={deps} motionReduced={false}>
          <div />
        </SoundSettingsProvider>,
      );
      expect(document.documentElement.getAttribute("data-calm")).toBeNull();
    });

    it("calmMode=true still mutes the engine even when motionReduced=true", () => {
      const { deps } = makeStubDeps();
      const engines: any[] = [];
      function Probe() {
        const { engine, calmMode, setCalmMode } = useSoundSettings();
        engines.push(engine);
        return <button onClick={() => setCalmMode(!calmMode)}>toggle</button>;
      }
      render(
        <SoundSettingsProvider deps={deps} motionReduced={true}>
          <Probe />
        </SoundSettingsProvider>,
      );
      const spy = vi.spyOn(engines[0], "setMuted");
      act(() => screen.getByRole("button").click()); // calmMode → true
      expect(spy).toHaveBeenCalledWith(true);
    });

    it("motionReduced prop is exposed in context", () => {
      const { deps } = makeStubDeps();
      let captured: boolean | undefined;
      function Probe() {
        const { motionReduced } = useSoundSettings();
        captured = motionReduced;
        return null;
      }
      render(
        <SoundSettingsProvider deps={deps} motionReduced={true}>
          <Probe />
        </SoundSettingsProvider>,
      );
      expect(captured).toBe(true);
    });
  });

  it("combined effective gain = volume × mapMasterGain pushed to engine.setMasterGain", () => {
    const { deps } = makeStubDeps();
    const engines: any[] = [];
    function CaptureEngine() {
      const { engine, setVolume, setMapMasterGain } = useSoundSettings();
      engines.push(engine);
      return (
        <>
          <button id="vol" onClick={() => setVolume(0.5)}>
            vol
          </button>
          <button id="gain" onClick={() => setMapMasterGain(0.6)}>
            gain
          </button>
        </>
      );
    }
    render(
      <SoundSettingsProvider deps={deps}>
        <CaptureEngine />
      </SoundSettingsProvider>,
    );
    const spy = vi.spyOn(engines[0], "setMasterGain");
    // Set volume to 0.5; mapMasterGain remains 0.6 → effective = 0.5 × 0.6 = 0.3
    act(() => screen.getByText("vol").click());
    expect(spy).toHaveBeenCalledWith(0.5 * 0.6);
    // Set mapMasterGain to 0.6 again (already 0.6, but triggers effect); volume is 0.5
    act(() => screen.getByText("gain").click());
    expect(spy).toHaveBeenCalledWith(0.5 * 0.6);
  });
});
