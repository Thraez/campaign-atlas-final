/**
 * eval-44: a soundscape edit belongs to the map it was made on.
 *
 * Wires the real hooks the editor page uses (useUndoStack, useEditorSession,
 * useSoundscapeDraft and the Sound tab) with two maps, and the page's own map
 * metadata override + patchMap. The two bugs from the ticket:
 *  1. sound areas drawn on map A were patched into map B after a switch;
 *  2. undoing a soundscape change was patched straight back by the tab.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { useCallback, useMemo, useRef, useState } from "react";
import { render, act, waitFor, cleanup } from "@testing-library/react";
import { useUndoStack } from "@/atlas/useUndoStack";
import { useEditorSession, SESSION_IDB_KEY } from "@/atlas/session/useEditorSession";
import { idbDelete } from "@/atlas/session/idbStore";
import { useSoundscapeDraft } from "@/atlas/sound-editor/useSoundscapeDraft";
import { SoundscapeTab } from "@/atlas/tabs/SoundscapeTab";
import type { MapDocument } from "@/atlas/content/schema";
import { withMapPatch, withoutMapKey, type MapOverrides } from "@/atlas/editor/mapOverride";

function map(id: string): MapDocument {
  return {
    id,
    worldId: "w1",
    name: id,
    width: 1000,
    height: 1000,
    layers: [],
    regions: [
      {
        id: `r-${id}`,
        mapId: id,
        name: `Region ${id}`,
        points: [
          [0, 0],
          [100, 0],
          [100, 100],
        ],
        visibility: "dm",
      } as never,
    ],
    routes: [],
  };
}

const MAPS = [map("A"), map("B")];

function useHarness() {
  const [activeMapId, setActiveMapId] = useState("A");
  const switchTo = (id: string) => {
    if (session.onMapWillChange(id)) setActiveMapId(id);
  };
  const undoStack = useUndoStack(undefined, { switchToMap: (id) => switchTo(id) });

  // The page's map metadata override and patchMap, as in AtlasPlacementEditor.
  const [mapOverride, setMapOverride] = useState<MapOverrides>({});
  const mapOverrideRef = useRef(mapOverride);
  const setOverride = useCallback((m: MapOverrides) => {
    mapOverrideRef.current = m;
    setMapOverride(m);
  }, []);
  const baseMap = MAPS.find((m) => m.id === activeMapId)!;
  const activeMap = useMemo(
    () => ({ ...baseMap, ...(mapOverride[baseMap.id] ?? {}) }),
    [baseMap, mapOverride],
  );
  const record = (compute: (s: MapOverrides) => MapOverrides) => {
    const before = mapOverrideRef.current;
    const after = compute(before);
    if (after === before) return;
    setOverride(after);
    undoStack.push({
      undo: () => setOverride(before),
      redo: () => setOverride(after),
      label: `map metadata ${baseMap.id}`,
      mapId: baseMap.id,
    });
  };
  const patchMap = (patch: Partial<MapDocument>) =>
    record((s) => withMapPatch(s, baseMap.id, patch));
  const unpatchMap = (key: keyof MapDocument) => record((s) => withoutMapKey(s, baseMap.id, key));

  const sound = useSoundscapeDraft(activeMap, baseMap.soundscape, {
    patch: patchMap,
    unpatch: unpatchMap,
  });
  const session = useEditorSession({
    activeMapId,
    undoStack,
    holders: {
      overrides: { get: () => ({}), set: () => {} },
      mapOverride: {
        get: () => mapOverrideRef.current as Record<string, unknown>,
        set: (m) => setOverride(m as MapOverrides),
      },
      region: { snapshot: () => ({ edits: {}, added: [], deleted: [] }), applySnapshot: () => {} },
      route: { snapshot: () => ({ edits: {}, added: [], deleted: [] }), applySnapshot: () => {} },
      fog: { snapshot: () => null, applySnapshot: () => {} },
      layer: { snapshot: () => ({}), applySnapshot: () => {} },
      editorEntity: { get: () => null, set: () => {} },
      world: { get: () => ({}), set: () => {} },
      calendar: { get: () => null, set: () => {} },
    },
    perMapDirtyCount: () =>
      Object.values(mapOverride).filter((o) => Object.keys(o).length > 0).length,
  });
  /** What a save would write for map `id`. */
  const soundOf = (id: string) => ({ ...map(id), ...(mapOverride[id] ?? {}) }).soundscape;
  return { activeMapId, activeMap, switchTo, undoStack, sound, session, soundOf, mapOverride };
}

let h: ReturnType<typeof useHarness>;
function Harness() {
  h = useHarness();
  return <SoundscapeTab map={h.activeMap} availableAudioFiles={[]} api={h.sound} />;
}

async function mount() {
  const r = render(<Harness />);
  await waitFor(() => expect(h.session.hydrated).toBe(true));
  return r;
}

function drawZone() {
  act(() => h.sound.startDraw());
  act(() => {
    h.sound.addDraftPoint([0, 0]);
    h.sound.addDraftPoint([50, 0]);
    h.sound.addDraftPoint([50, 50]);
  });
  act(() => {
    h.sound.finishDraw();
  });
}

describe("the soundscape draft belongs to one map (eval-44)", () => {
  beforeEach(async () => {
    cleanup();
    localStorage.clear();
    await idbDelete(SESSION_IDB_KEY);
  });

  it("a sound area drawn on map A never lands on map B", async () => {
    await mount();
    drawZone();
    expect(h.soundOf("A")?.areas).toHaveLength(1);

    act(() => h.switchTo("B"));
    expect(h.activeMapId).toBe("B");
    expect(h.sound.effective.areas ?? []).toEqual([]);
    expect(h.soundOf("B")).toBeUndefined();

    act(() => h.switchTo("A"));
    expect(h.sound.effective.areas).toHaveLength(1);
    expect(h.soundOf("A")?.areas).toHaveLength(1);
    expect(h.soundOf("B")).toBeUndefined();
  });

  it("undo of a sound change stays undone; redo restores it on its own map", async () => {
    await mount();
    drawZone();
    expect(h.soundOf("A")?.areas).toHaveLength(1);

    act(() => h.undoStack.undo());
    expect(h.soundOf("A")?.areas ?? []).toEqual([]);
    expect(h.sound.effective.areas ?? []).toEqual([]);

    // Redo from map B switches back to A and restores the area there only.
    act(() => h.switchTo("B"));
    act(() => h.undoStack.redo());
    expect(h.activeMapId).toBe("A");
    expect(h.soundOf("A")?.areas).toHaveLength(1);
    expect(h.soundOf("B")).toBeUndefined();
  });

  it("a drawing started on map A is dropped on a switch, never finished on B", async () => {
    await mount();
    act(() => h.sound.startDraw());
    act(() => {
      h.sound.addDraftPoint([0, 0]);
      h.sound.addDraftPoint([50, 0]);
      h.sound.addDraftPoint([50, 50]);
    });
    act(() => h.switchTo("B"));
    expect(h.sound.drawing).toBe(false);
    expect(h.sound.draftPoints).toEqual([]);
    let id: string | null = "x";
    act(() => {
      id = h.sound.finishDraw();
    });
    expect(id).toBeNull();
    expect(h.soundOf("B")).toBeUndefined();
  });

  it("Discard local leaves the map clean; undo brings the edit back", async () => {
    await mount();
    drawZone();
    expect(h.session.unsavedCount).toBe(1);

    act(() => h.sound.reset());
    expect(h.mapOverride).toEqual({});
    expect(h.session.unsavedCount).toBe(0);

    act(() => h.undoStack.undo());
    expect(h.soundOf("A")?.areas).toHaveLength(1);
    expect(h.session.unsavedCount).toBe(1);
  });

  it("Discard all clears the sound draft, and a reload restores it", async () => {
    const first = await mount();
    drawZone();
    // Let the session's debounced persist land, then reload.
    await new Promise((r) => setTimeout(r, 400));
    first.unmount();

    await mount();
    await waitFor(() => expect(h.soundOf("A")?.areas).toHaveLength(1));
    expect(h.sound.effective.areas).toHaveLength(1);

    await act(async () => {
      await h.session.discardAll();
    });
    expect(h.soundOf("A")).toBeUndefined();
    expect(h.sound.effective.areas ?? []).toEqual([]);
  });
});
