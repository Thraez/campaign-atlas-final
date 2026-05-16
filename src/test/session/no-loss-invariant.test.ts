import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { serializeSession, deserializeSession, sessionHasWork, type SessionState } from "@/atlas/session/sessionSnapshot";
import { useRegionDraft } from "@/atlas/regions/useRegionDraft";
import { useRouteDraft } from "@/atlas/routes/useRouteDraft";
import { useFogDraft } from "@/atlas/fog/useFogDraft";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";
import type { MapDocument } from "@/atlas/content/schema";

const mapA: MapDocument = { id: "A", worldId: "w", name: "A", width: 100, height: 100, layers: [], regions: [], routes: [] };
const mapB: MapDocument = { ...mapA, id: "B", name: "B" };

function emptyState(savedAt = 1): SessionState {
  return { overrides: {}, mapOverrideByMap: {}, regionByMap: {}, routeByMap: {}, fogByMap: {}, layerByMap: {}, entityEdit: null, savedAt };
}

describe("no-loss invariant — per holder", () => {
  it("region draft survives serialize → deserialize → fresh hook applySnapshot", () => {
    const { result } = renderHook(() => useRegionDraft(mapA, {}, undefined));
    act(() => { result.current.startDraw(); });
    act(() => {
      result.current.addDraftPoint([1, 1]);
      result.current.addDraftPoint([9, 1]);
      result.current.addDraftPoint([5, 9]);
    });
    act(() => { result.current.finishDraw(); });
    const snap = result.current.snapshot();

    const state = emptyState();
    state.regionByMap.A = snap;
    const restored = deserializeSession(serializeSession(state))!;

    const fresh = renderHook(() => useRegionDraft(mapA, {}, undefined));
    act(() => { fresh.result.current.applySnapshot(restored.regionByMap.A); });
    expect(fresh.result.current.snapshot()).toEqual(snap);
    expect(fresh.result.current.effective.length).toBe(1);
  });

  it("route draft survives the round-trip", () => {
    const { result } = renderHook(() => useRouteDraft(null, mapA, {}, undefined));
    act(() => { result.current.startDraw(); });
    act(() => { result.current.addDraftPoint([0, 0]); result.current.addDraftPoint([10, 10]); });
    act(() => { result.current.finishDraw(); });
    const snap = result.current.snapshot();

    const state = emptyState();
    state.routeByMap.A = snap;
    const restored = deserializeSession(serializeSession(state))!;

    const fresh = renderHook(() => useRouteDraft(null, mapA, {}, undefined));
    act(() => { fresh.result.current.applySnapshot(restored.routeByMap.A); });
    expect(fresh.result.current.snapshot()).toEqual(snap);
  });

  it("fog draft survives the round-trip", () => {
    const { result } = renderHook(() => useFogDraft(mapA, undefined));
    act(() => { result.current.setEnabled(true); });
    act(() => { result.current.addDraftPoint([0, 0]); result.current.addDraftPoint([9, 0]); result.current.addDraftPoint([5, 9]); });
    act(() => { result.current.finishDraftPolygon(); });
    const snap = result.current.snapshot();

    const state = emptyState();
    state.fogByMap.A = snap;
    const restored = deserializeSession(serializeSession(state))!;

    const fresh = renderHook(() => useFogDraft(mapA, undefined));
    act(() => { fresh.result.current.applySnapshot(restored.fogByMap.A); });
    expect(fresh.result.current.snapshot()).toEqual(snap);
  });

  it("entityEdit draft survives serialize → deserialize (no-loss)", () => {
    const entityEditRef = renderHook(() => useEntityEditDraft());
    act(() => {
      entityEditRef.result.current.load({
        sourcePath: "content/npc/corven.md",
        baseHash: "abc123",
        fields: { id: "corven", type: "npc", visibility: "dm", summary: "A rogue merchant." },
        body: "## Corven\nEdited body content.",
      });
    });
    act(() => {
      entityEditRef.result.current.setBody("## Corven\nDirty edited body content.");
    });
    const snap = entityEditRef.result.current.snapshot();
    expect(snap).not.toBeNull();

    const state = emptyState();
    state.entityEdit = snap;

    // Dirty state is recognized as work
    expect(sessionHasWork(state)).toBe(true);

    // Survives a round-trip
    const restored = deserializeSession(serializeSession(state))!;
    expect(restored).not.toBeNull();
    expect(restored.entityEdit).toEqual(snap);
    expect(sessionHasWork(restored)).toBe(true);

    // discardAll equivalent: setting entityEdit to null clears work
    const cleared = { ...state, entityEdit: null };
    expect(sessionHasWork(cleared)).toBe(false);
  });

  it("switch-away-and-back is non-destructive (per-map slices)", () => {
    const onA = renderHook(({ m }) => useRegionDraft(m, {}, undefined), { initialProps: { m: mapA } });
    act(() => { onA.result.current.startDraw(); });
    act(() => {
      onA.result.current.addDraftPoint([1, 1]);
      onA.result.current.addDraftPoint([9, 1]);
      onA.result.current.addDraftPoint([5, 9]);
    });
    act(() => { onA.result.current.finishDraw(); });
    const sliceA = onA.result.current.snapshot();

    const state = emptyState();
    state.regionByMap.A = sliceA;

    // Switch to B: coordinator would applySnapshot(B-slice ?? EMPTY).
    onA.rerender({ m: mapB });
    act(() => { onA.result.current.applySnapshot(state.regionByMap.B ?? { edits: {}, added: [], deleted: [] }); });
    expect(onA.result.current.effective.length).toBe(0); // B is clean

    // Switch back to A: coordinator restores A's slice.
    onA.rerender({ m: mapA });
    act(() => { onA.result.current.applySnapshot(state.regionByMap.A); });
    expect(onA.result.current.snapshot()).toEqual(sliceA);
    expect(onA.result.current.effective.length).toBe(1); // A's work intact
  });
});
