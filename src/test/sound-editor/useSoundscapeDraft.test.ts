import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSoundscapeDraft } from "@/atlas/sound-editor/useSoundscapeDraft";
import type { MapDocument } from "@/atlas/content/schema";

const map = (over: Partial<MapDocument> = {}): MapDocument =>
  ({ id: "m", name: "M", width: 1000, height: 1000, layers: [], regions: [], ...over }) as MapDocument;

describe("useSoundscapeDraft", () => {
  it("starts empty when the map has no soundscape", () => {
    const { result } = renderHook(() => useSoundscapeDraft(map()));
    expect(result.current.effective.areas ?? []).toEqual([]);
    expect(result.current.dirty).toBe(false);
  });

  it("adds a ride-on area for an existing region (defaults to one bed, no leak surface)", () => {
    const { result } = renderHook(() =>
      useSoundscapeDraft(
        map({
          regions: [
            {
              id: "r1",
              mapId: "m",
              name: "R",
              points: [
                [0, 0],
                [10, 0],
                [10, 10],
              ],
              visibility: "player",
            } as never,
          ],
        }),
      ),
    );
    act(() => result.current.addRideOn("r1"));
    expect(result.current.effective.areas).toHaveLength(1);
    expect(result.current.effective.areas![0].regionId).toBe("r1");
    expect(result.current.effective.areas![0].bed.src).toBe(""); // empty until DM picks a file
    expect(result.current.dirty).toBe(true);
  });

  it("draws a sound-only zone and the new area defaults to visibility dm (secrecy-safe)", () => {
    const { result } = renderHook(() => useSoundscapeDraft(map()));
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
    const { result } = renderHook(() => useSoundscapeDraft(map()));
    act(() => result.current.startDraw());
    act(() => result.current.addDraftPoint([0, 0]));
    let id: string | null = "x";
    act(() => {
      id = result.current.finishDraw();
    });
    expect(id).toBeNull();
  });

  it("patches a bed file + per-bed gain and the master gain", () => {
    const { result } = renderHook(() =>
      useSoundscapeDraft(
        map({
          regions: [
            {
              id: "r1",
              mapId: "m",
              name: "R",
              points: [
                [0, 0],
                [10, 0],
                [10, 10],
              ],
              visibility: "player",
            } as never,
          ],
        }),
      ),
    );
    act(() => result.current.addRideOn("r1"));
    const id = result.current.effective.areas![0].id;
    act(() => result.current.patchBed(id, { src: "wind.ogg", gain: 0.4 }));
    act(() => result.current.setMasterGain(0.8));
    expect(result.current.effective.areas![0].bed).toMatchObject({ src: "wind.ogg", gain: 0.4 });
    expect(result.current.effective.masterGain).toBe(0.8);
  });

  it("keeps one copy per id after the panel's patch feeds back into map.soundscape", () => {
    // The editor persistence loop: SoundscapeTab pushes the effective config
    // through patchMap({ soundscape }) which lands back on the SAME map this
    // hook reads (mapOverride → activeMap.soundscape). The draft's added copy
    // must supersede the fed-back canon copy — one entry per id, no spurious
    // duplicate-id issue, and later edits still land on the live copy.
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
    const base = map({ regions: [region] });
    const { result, rerender } = renderHook(({ m }: { m: MapDocument }) => useSoundscapeDraft(m), {
      initialProps: { m: base },
    });
    act(() => result.current.addRideOn("r1"));
    const id = result.current.effective.areas![0].id;
    // Feed the patched config back, as the live editor does.
    const fedBack = map({
      regions: [region],
      soundscape: { areas: result.current.effective.areas },
    });
    rerender({ m: fedBack });
    expect(result.current.effective.areas!.filter((a) => a.id === id)).toHaveLength(1);
    expect(result.current.issues.filter((i) => i.code === "duplicate-sound-area-id")).toEqual([]);
    // The draft copy still wins for subsequent edits.
    act(() => result.current.patchBed(id, { src: "wind.ogg" }));
    expect(result.current.effective.areas!.find((a) => a.id === id)!.bed.src).toBe("wind.ogg");
  });

  it("removes an area and reset() clears all local changes", () => {
    const { result } = renderHook(() =>
      useSoundscapeDraft(
        map({
          regions: [
            {
              id: "r1",
              mapId: "m",
              name: "R",
              points: [
                [0, 0],
                [10, 0],
                [10, 10],
              ],
              visibility: "player",
            } as never,
          ],
        }),
      ),
    );
    act(() => result.current.addRideOn("r1"));
    const id = result.current.effective.areas![0].id;
    act(() => result.current.remove(id));
    expect(result.current.effective.areas ?? []).toEqual([]);
    act(() => result.current.addRideOn("r1"));
    act(() => result.current.reset());
    expect(result.current.dirty).toBe(false);
    expect(result.current.effective.areas ?? []).toEqual([]);
  });
});
