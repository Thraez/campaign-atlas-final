/**
 * Ticket eval-2026-10/28: audio URLs follow the same asset URL rule as images
 * (`normalizeAtlasAssetUrl`), so they resolve the same at `/atlas` and
 * `/atlas/` under the GitHub Pages base path.
 *
 * React Router matches `/atlas/` to the `/atlas` route, and Pages serves the
 * SPA for it (404.html fallback), so both document URLs are reachable.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "@/atlas/sound/AudioEngine";
import { loadAvailableAudio } from "@/atlas/sound-editor/listAvailableAudio";

const PAGES_BASE = "/campaign-atlas-final/";
const DOC_URLS = [
  "https://thraez.github.io/campaign-atlas-final/atlas",
  "https://thraez.github.io/campaign-atlas-final/atlas/",
];

function mockCtx() {
  const node = () => ({
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  const ctx: any = {
    state: "suspended",
    currentTime: 0,
    destination: {},
    createGain: vi.fn(node),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    })),
    resume: vi.fn(async () => {
      ctx.state = "running";
    }),
    suspend: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async () => ({ duration: 30 })),
    close: vi.fn(async () => {}),
  };
  return ctx;
}

async function fetchedUrl(src: string): Promise<string> {
  const fetchAudio = vi.fn(async (_url: string) => new ArrayBuffer(8));
  const eng = new AudioEngine({ createContext: mockCtx, fetchAudio, canPlay: () => true });
  await eng.unlock();
  await eng.crossfadeTo({ id: "a", bed: { src } } as any);
  return fetchAudio.mock.calls[0][0];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("audio asset URLs under the Pages base path", () => {
  for (const doc of DOC_URLS) {
    it(`engine fetches the bed from the base path at ${doc}`, async () => {
      vi.stubEnv("BASE_URL", PAGES_BASE);
      for (const src of ["atlas/assets/audio/deadbeef.ogg", "deadbeef.ogg"]) {
        expect(new URL(await fetchedUrl(src), doc).href).toBe(
          "https://thraez.github.io/campaign-atlas-final/atlas/assets/audio/deadbeef.ogg",
        );
      }
    });

    it(`editor manifest URL resolves under the base path at ${doc}`, async () => {
      vi.stubEnv("BASE_URL", PAGES_BASE);
      const fetchImpl = vi.fn(async () => new Response("[]"));
      await loadAvailableAudio(fetchImpl as unknown as typeof fetch);
      const url = String((fetchImpl.mock.calls[0] as unknown[])[0]);
      expect(new URL(url, doc).href).toBe(
        "https://thraez.github.io/campaign-atlas-final/atlas/assets/audio/manifest.json",
      );
    });
  }
});
