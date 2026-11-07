import { describe, it, expect } from "vitest";
import { useMemo, useState } from "react";
import { renderHook, act } from "@testing-library/react";
import { useSoundscapeDraft } from "@/atlas/sound-editor/useSoundscapeDraft";
import type { MapDocument } from "@/atlas/content/schema";

const region = {
  id: "r1",
  mapId: "m",
  name: "R",
  points: [
    [0, 0],
    [10, 0],
    [10, 10],
  ],
  visibility: "player",
} as never;

const map = (over: Partial<MapDocument> = {}): MapDocument =>
  ({
    id: "m",
    name: "M",
    width: 1000,
    height: 1000,
    layers: [],
    regions: [],
    ...over,
  }) as MapDocument;

/** The hook as the editor wires it: every patch lands back on the map it reads. */
function useWired(base: MapDocument) {
  const [soundscape, setSoundscape] = useState(base.soundscape);
  const m = useMemo(() => ({ ...base, soundscape }), [base, soundscape]);
  return useSoundscapeDraft(m, base.soundscape, {
    patch: (p) => {
      if ("soundscape" in p) setSoundscape(p.soundscape);
    },
    unpatch: () => setSoundscape(base.soundscape),
  });
}

const wired = (base: MapDocument) => renderHook(() => useWired(base)).result;

describe("useSoundscapeDraft", () => {
  it("starts empty when the map has no soundscape", () => {
    const result = wired(map());
    expect(result.current.effective.areas ?? []).toEqual([]);
    expect(result.current.dirtyCount).toBe(0);
  });

  it("counts no change on an untouched map whose saved soundscape is not normalized", () => {
    expect(wired(map({ soundscape: { enabled: false, areas: [] } })).current.dirtyCount).toBe(0);
    const blankName = { areas: [{ id: "s0", regionId: "r1", name: "", bed: { src: "a.ogg" } }] };
    expect(wired(map({ regions: [region], soundscape: blankName })).current.dirtyCount).toBe(0);
  });

  it("adds a ride-on area for an existing region (defaults to one bed, no leak surface)", () => {
    const result = wired(map({ regions: [region] }));
    act(() => result.current.addRideOn("r1"));
    expect(result.current.effective.areas).toHaveLength(1);
    expect(result.current.effective.areas![0].regionId).toBe("r1");
    expect(result.current.effective.areas![0].bed.src).toBe(""); // empty until DM picks a file
    expect(result.current.dirtyCount).toBe(1);
  });

  it("draws a sound-only zone and the new area defaults to visibility dm (secrecy-safe)", () => {
    const result = wired(map());
    act(() => result.current.startDraw());
    act(() => {
      result.current.addDraftPoint([0, 0]);
      result.current.addDraftPoint([100, 0]);
      result.current.addDraftPoint([100, 100]);
    });
    let id: string | null = null;
    act(() => {
      id = result.current.finishDraw();
    });
    expect(id).toBeTruthy();
    const area = result.current.effective.areas!.find((a) => a.id === id)!;
    expect(area.points).toHaveLength(3);
    expect(area.regionId).toBeUndefined();
    expect(area.visibility).toBe("dm"); // never ships until DM opts it in
  });

  it("rejects a draw with fewer than 3 points", () => {
    const result = wired(map());
    act(() => result.current.startDraw());
    act(() => result.current.addDraftPoint([0, 0]));
    let id: string | null = "x";
    act(() => {
      id = result.current.finishDraw();
    });
    expect(id).toBeNull();
  });

  it("patches a bed file + per-bed gain and the master gain", () => {
    const result = wired(map({ regions: [region] }));
    act(() => result.current.addRideOn("r1"));
    const id = result.current.effective.areas![0].id;
    act(() => result.current.patchBed(id, { src: "wind.ogg", gain: 0.4 }));
    act(() => result.current.setMasterGain(0.8));
    expect(result.current.effective.areas![0].bed).toMatchObject({ src: "wind.ogg", gain: 0.4 });
    expect(result.current.effective.masterGain).toBe(0.8);
  });

  it("keeps a name as typed, spaces included, while the DM types it", () => {
    const result = wired(map({ regions: [region] }));
    act(() => result.current.addRideOn("r1"));
    const id = result.current.effective.areas![0].id;
    act(() => result.current.patchArea(id, { name: "Wind " }));
    expect(result.current.effective.areas![0].name).toBe("Wind ");
  });

  it("removes an area and reset() puts the saved soundscape back", () => {
    const saved = { areas: [{ id: "s0", regionId: "r1", bed: { src: "sea.ogg" } }] };
    const result = wired(map({ regions: [region], soundscape: saved }));
    act(() => result.current.remove("s0"));
    expect(result.current.effective.areas ?? []).toEqual([]);
    expect(result.current.dirtyCount).toBe(1);
    act(() => result.current.addRideOn("r1"));
    act(() => result.current.reset());
    expect(result.current.dirtyCount).toBe(0);
    expect(result.current.effective.areas).toEqual(saved.areas);
  });
});
