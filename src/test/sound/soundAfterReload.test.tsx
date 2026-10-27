import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup, fireEvent } from "@testing-library/react";
import type { MapDocument } from "@/atlas/content/schema";
import { SoundSettingsProvider } from "@/atlas/sound/SoundSettingsProvider";
import { SoundControl } from "@/atlas/sound/SoundControl";
import { SoundscapeLayer } from "@/atlas/sound/SoundscapeLayer";
import { _resetSoundPrefsForTests, saveSoundPrefs, DEFAULT_PREFS } from "@/atlas/sound/soundPrefs";

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

function makeDeps() {
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
        ctx.state = "running";
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

function renderPage(deps: ReturnType<typeof makeDeps>["deps"]) {
  return render(
    <SoundSettingsProvider deps={deps} audioAvailable={true}>
      <SoundscapeLayer map={mapDoc} />
      <SoundControl />
      <p>Map body</p>
    </SoundSettingsProvider>,
  );
}

/** Let the 150 ms viewport debounce and the async buffer load settle. */
async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(200);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
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

  it("the first pointerdown anywhere unlocks audio and starts the current ambience", async () => {
    const { deps, started, createContext } = makeDeps();
    renderPage(deps);
    await settle();

    fireEvent.pointerDown(screen.getByText("Map body"));
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

    fireEvent.pointerDown(screen.getByText("Map body"));
    await settle();

    expect(screen.getByRole("status").textContent).toBe("");
  });
});
