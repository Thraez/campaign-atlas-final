import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup, fireEvent } from "@testing-library/react";
import type { MapDocument } from "@/atlas/content/schema";
import { SoundSettingsProvider } from "@/atlas/sound/SoundSettingsProvider";
import { SoundControl } from "@/atlas/sound/SoundControl";
import { SoundscapeLayer } from "@/atlas/sound/SoundscapeLayer";
import { AudioEngine } from "@/atlas/sound/AudioEngine";
import { prepareAreas } from "@/atlas/sound/resolveSoundscape";
import {
  _resetSoundPrefsForTests,
  saveSoundPrefs,
  loadSoundPrefs,
  DEFAULT_PREFS,
} from "@/atlas/sound/soundPrefs";

// The view sits well inside the single area, so the bed is chosen at once.
const fakeLeaflet = {
  getCenter: () => ({ lat: 500, lng: 500 }),
  getBounds: () => ({
    getSouthWest: () => ({ lat: 100, lng: 100 }),
    getNorthEast: () => ({ lat: 900, lng: 900 }),
  }),
  on: () => {},
  off: () => {},
};
vi.mock("react-leaflet", () => ({ useMap: () => fakeLeaflet }));

const mapDoc = {
  id: "m",
  name: "M",
  width: 1000,
  height: 1000,
  layers: [],
  soundscape: {
    areas: [
      {
        id: "sea",
        points: [
          [0, 0],
          [1000, 0],
          [1000, 1000],
          [0, 1000],
        ],
        bed: { src: "sea.ogg" },
      },
    ],
  },
} as unknown as MapDocument;

/**
 * resume: "works" puts the context in running; "ignored" leaves it suspended
 * (the browser didn't count the gesture); "rejects" throws.
 */
function makeDeps({ resume = "works" }: { resume?: "works" | "ignored" | "rejects" } = {}) {
  const started: unknown[] = [];
  const gainNode = () => ({
    gain: {
      value: 0,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      cancelScheduledValues() {},
    },
    connect() {},
    disconnect() {},
  });
  const createContext = vi.fn(() => {
    const ctx: any = {
      state: "suspended",
      currentTime: 0,
      destination: {},
      createGain: gainNode,
      createBufferSource: () => {
        const src: any = {
          connect() {},
          disconnect() {},
          stop() {},
          start: () => started.push(src),
        };
        return src;
      },
      decodeAudioData: async () => ({ duration: 10 }),
      resume: async () => {
        if (resume === "rejects") throw new Error("not allowed");
        if (resume === "works") ctx.state = "running";
      },
      suspend: async () => {
        ctx.state = "suspended";
      },
      close: async () => {},
    };
    return ctx as AudioContext;
  });
  return {
    started,
    createContext,
    deps: {
      createContext,
      fetchAudio: async () => new ArrayBuffer(8),
      canPlay: () => true,
    },
  };
}

function renderPage(deps: ReturnType<typeof makeDeps>["deps"], map: MapDocument = mapDoc) {
  return render(
    <SoundSettingsProvider deps={deps} audioAvailable={true}>
      <SoundscapeLayer map={map} />
      <SoundControl />
      <p>Map body</p>
    </SoundSettingsProvider>,
  );
}

/** Let unlock(), the 150 ms viewport debounce and the async buffer load settle. */
async function settle() {
  const flush = async () => {
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  };
  await flush(); // unlock() resolving
  await act(async () => {
    vi.advanceTimersByTime(200);
  });
  await flush(); // buffer fetch + decode
}

describe("sound after a reload with sound saved on", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetSoundPrefsForTests();
    saveSoundPrefs({ ...DEFAULT_PREFS, soundEnabled: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    _resetSoundPrefsForTests();
  });

  it("shows a resume invite and announces nothing before the first gesture", async () => {
    const { deps, started, createContext } = makeDeps();
    renderPage(deps);
    await settle();

    expect(screen.getByRole("button", { name: /resume sound/i })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByText(/ambience playing/i)).toBeNull();
    expect(createContext).not.toHaveBeenCalled();
    expect(started).toHaveLength(0);
  });

  it("the first pointerup anywhere unlocks audio and starts the current ambience", async () => {
    const { deps, started, createContext } = makeDeps();
    renderPage(deps);
    await settle();

    fireEvent.pointerUp(screen.getByText("Map body"));
    await settle();

    expect(createContext).toHaveBeenCalledTimes(1);
    expect(started).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Ambience playing");
    expect(screen.queryByRole("button", { name: /resume sound/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Mute sound" })).toBeTruthy();
  });

  it("a key press also unlocks audio", async () => {
    const { deps, started } = makeDeps();
    renderPage(deps);
    await settle();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await settle();

    expect(started).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Ambience playing");
  });

  it("does not claim playback when the bed fails to load", async () => {
    const { deps } = makeDeps();
    const failing = {
      ...deps,
      fetchAudio: async () => {
        throw new Error("404");
      },
    };
    renderPage(failing);
    await settle();

    fireEvent.pointerUp(screen.getByText("Map body"));
    await settle();

    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("a touch (touchend) unlocks audio", async () => {
    const { deps, started } = makeDeps();
    renderPage(deps);
    await settle();

    fireEvent.touchEnd(screen.getByText("Map body"));
    await settle();

    expect(started).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Ambience playing");
  });

  it("Escape and lone modifier keys don't unlock audio", async () => {
    const { deps, createContext } = makeDeps();
    renderPage(deps);
    await settle();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Shift" });
    await settle();

    expect(createContext).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /resume sound/i })).toBeTruthy();
  });

  it("Dismiss on the resume invite leaves sound silent, even after later taps", async () => {
    const { deps, started, createContext } = makeDeps();
    renderPage(deps);
    await settle();

    const dismiss = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.pointerUp(dismiss);
    fireEvent.click(dismiss);
    await settle();

    expect(screen.queryByRole("button", { name: /resume sound/i })).toBeNull();
    fireEvent.pointerUp(screen.getByText("Map body"));
    await settle();

    expect(createContext).not.toHaveBeenCalled();
    expect(started).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(loadSoundPrefs().soundEnabled).toBe(true);
  });

  it("a gesture that leaves the context suspended announces nothing and keeps the invite", async () => {
    const { deps, started } = makeDeps({ resume: "ignored" });
    renderPage(deps);
    await settle();

    fireEvent.pointerUp(screen.getByText("Map body"));
    await settle();

    expect(started).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByRole("button", { name: /resume sound/i })).toBeTruthy();
  });

  it("a failed resume on an automatic gesture keeps the saved sound-on and the invite", async () => {
    const { deps } = makeDeps({ resume: "rejects" });
    renderPage(deps);
    await settle();

    fireEvent.pointerUp(screen.getByText("Map body"));
    await settle();

    expect(loadSoundPrefs().soundEnabled).toBe(true);
    expect(screen.getByRole("button", { name: /resume sound/i })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("keeps announcing when the soundscape effect re-runs over the same bed", async () => {
    const { deps, started } = makeDeps();
    const view = renderPage(deps);
    await settle();
    fireEvent.pointerUp(screen.getByText("Map body"));
    await settle();
    expect(screen.getByRole("status").textContent).toBe("Ambience playing");

    // A new map object with the same id re-runs the effect; the bed keeps playing.
    view.rerender(
      <SoundSettingsProvider deps={deps} audioAvailable={true}>
        <SoundscapeLayer map={{ ...mapDoc }} />
        <SoundControl />
        <p>Map body</p>
      </SoundSettingsProvider>,
    );
    await settle();

    expect(started).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Ambience playing");
  });
});

describe("AudioEngine.crossfadeTo results", () => {
  it("two crossfades to the same bed during decode both report playing", async () => {
    const { deps, started } = makeDeps();
    const engine = new AudioEngine(deps);
    expect(await engine.unlock()).toBe(true);
    const [area] = prepareAreas(mapDoc);

    const results = await Promise.all([engine.crossfadeTo(area), engine.crossfadeTo(area)]);

    expect(results).toEqual(["playing", "playing"]);
    expect(started).toHaveLength(1);
  });

  it("reports locked before unlock and paused while the context is suspended", async () => {
    const { deps } = makeDeps({ resume: "ignored" });
    const engine = new AudioEngine(deps);
    const [area] = prepareAreas(mapDoc);

    expect(await engine.crossfadeTo(area)).toBe("locked");
    expect(await engine.unlock()).toBe(false);
    expect(await engine.crossfadeTo(area)).toBe("paused");
  });
});
