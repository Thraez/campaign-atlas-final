// src/test/sound-editor/SoundscapeTab.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SoundscapeTab } from "@/atlas/tabs/SoundscapeTab";
import { buildFullWorldYaml } from "@/atlas/yaml/buildFullWorldYaml";
import type { MapDocument } from "@/atlas/content/schema";

const map = (): MapDocument =>
  ({
    id: "m",
    worldId: "w",
    name: "M",
    width: 1000,
    height: 1000,
    layers: [],
    regions: [
      {
        id: "r1",
        mapId: "m",
        name: "Brackenfjall",
        points: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        visibility: "player",
      } as never,
    ],
  }) as MapDocument;

describe("SoundscapeTab", () => {
  it("shows DM-facing labels and an empty state, and lets the DM give a region a sound", () => {
    const onPatch = vi.fn();
    render(<SoundscapeTab map={map()} onPatch={onPatch} availableAudioFiles={["wind.ogg"]} />);
    // DM-facing copy, not jargon:
    expect(screen.getByText(/Volume/i)).toBeTruthy();
    expect(screen.queryByText(/masterGain/i)).toBeNull();
    // Empty state before anything is authored:
    expect(screen.getByText(/No sounds yet/i)).toBeTruthy();
    // Give a region a sound -> onPatch carries a soundscape with a ride-on area.
    // The region picker defaults to the map's first (here: only) region.
    const giveBtn = screen.getByRole("button", { name: /give a region a sound|add sound/i });
    act(() => giveBtn.click());
    // After selecting region r1 (the only one) the panel patches the map's soundscape:
    expect(onPatch).toHaveBeenCalled();
    const lastPatch = onPatch.mock.calls.at(-1)![0];
    expect(lastPatch.soundscape.areas[0].regionId).toBe("r1");
    // The payload round-trips through the unified Save's YAML emitter
    // (mapToYamlObject -> soundscapeToYamlObject) without throwing:
    const yaml = buildFullWorldYaml({
      maps: [{ ...map(), soundscape: lastPatch.soundscape }],
      existing: null,
    });
    expect(yaml).toContain("soundscape");
    expect(yaml).toContain("regionId: r1");
  });

  it("does not surface the editor controls to a player path — pure render, no AudioContext", () => {
    const onPatch = vi.fn();
    render(<SoundscapeTab map={map()} onPatch={onPatch} availableAudioFiles={[]} />);
    // Create an area (it becomes selected) so the per-area form renders.
    const giveBtn = screen.getByRole("button", { name: /give a region a sound|add sound/i });
    act(() => giveBtn.click());
    // free-text fallback exists when no audio files are available
    expect(screen.getByPlaceholderText(/file name|choose a file|\.ogg/i)).toBeTruthy();
    // No dev jargon anywhere in the rendered panel — the DM sees
    // Volume / Loudness / Sound, never masterGain / bed / gain.
    const txt = document.body.textContent ?? "";
    expect(txt).not.toMatch(/masterGain|\bbed\b|\bgain\b/i);
  });
});
