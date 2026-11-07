/**
 * eval-30: editor drafts are kept per map.
 *
 * Wires the REAL hooks the editor page uses (useUndoStack, useRegionDraft,
 * useFogDraft, useMapLayers, useEditorSession) the way AtlasPlacementEditor
 * does, with two maps, and checks the three bugs from the ticket:
 *  1. a save writes (and clears) every map's drafts, not just the active one's;
 *  2. undo of an edit made on another map switches to that map first and never
 *     changes the active map's draft;
 *  3. pins duplicated onto another map are clean after the save that wrote them.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { useState } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useUndoStack } from "@/atlas/useUndoStack";
import { useRegionDraft } from "@/atlas/regions/useRegionDraft";
import { useFogDraft } from "@/atlas/fog/useFogDraft";
import { useMapLayers } from "@/atlas/useMapLayers";
import { useEditorSession, SESSION_IDB_KEY } from "@/atlas/session/useEditorSession";
import { idbDelete } from "@/atlas/session/idbStore";
import { buildWorldYamlContent } from "@/atlas/save/buildSaveBatch";
import { foreignMapDraftPlacements, overridesAfterSave } from "@/atlas/editor/foreignMapDrafts";
import { mapDraftsAfterSave } from "@/atlas/session/mapDraftsAfterSave";
import type { MapDocument, Region } from "@/atlas/content/schema";

function region(id: string, mapId: string, name: string): Region {
  return {
    id,
    mapId,
    name,
    points: [
      [0, 0],
      [100, 0],
      [100, 100],
    ],
    visibility: "dm",
  } as Region;
}

function map(id: string): MapDocument {
  return {
    id,
    worldId: "w1",
    name: id,
    width: 1000,
    height: 1000,
    layers: [],
    regions: [region(`r-${id}`, id, `Canon ${id}`)],
    routes: [],
  };
}

const MAPS = [map("A"), map("B")];

function useHarness(projectMapIds?: readonly string[]) {
  const [activeMapId, setActiveMapId] = useState("A");
  const activeMap = MAPS.find((m) => m.id === activeMapId);
  // The page's own switch (map select): session first, then React state.
  const switchTo = (id: string) => {
    if (session.onMapWillChange(id)) setActiveMapId(id);
  };
  const undoStack = useUndoStack(undefined, { switchToMap: (id) => switchTo(id) });
  const layers = useMapLayers(activeMap, undoStack);
  const regionDraft = useRegionDraft(activeMap, {}, undoStack);
  const fogDraft = useFogDraft(activeMap, undoStack);
  const session = useEditorSession({
    activeMapId,
    projectMapIds,
    undoStack,
    holders: {
      overrides: { get: () => ({}), set: () => {} },
      mapOverride: { get: () => ({}), set: () => {} },
      region: {
        snapshot: regionDraft.snapshot,
        applySnapshot: (s) => regionDraft.applySnapshot(s as never),
      },
      route: { snapshot: () => ({ edits: {}, added: [], deleted: [] }), applySnapshot: () => {} },
      fog: {
        snapshot: fogDraft.snapshot,
        applySnapshot: (s) => fogDraft.applySnapshot(s as never),
      },
      layer: { snapshot: layers.snapshot, applySnapshot: (s) => layers.applySnapshot(s as never) },
      editorEntity: { get: () => null, set: () => {} },
    },
    perMapDirtyCount: () => regionDraft.dirtyCount + fogDraft.dirtyCount,
  });
  return { activeMapId, switchTo, undoStack, regionDraft, fogDraft, session };
}

async function mount(projectMapIds?: readonly string[]) {
  const h = renderHook((ids: readonly string[] | undefined) => useHarness(ids), {
    initialProps: projectMapIds,
  });
  await waitFor(() => expect(h.result.current.session.hydrated).toBe(true));
  return h;
}

describe("editor drafts are kept per map (eval-30)", () => {
  beforeEach(async () => {
    localStorage.clear();
    await idbDelete(SESSION_IDB_KEY);
  });

  it("counts and saves every map's drafts, and a save clears only the maps it wrote", async () => {
    const { result } = await mount();
    act(() => result.current.regionDraft.patch("r-A", { name: "Edited A" }));
    act(() => result.current.switchTo("B"));
    expect(result.current.activeMapId).toBe("B");
    act(() => result.current.regionDraft.patch("r-B", { name: "Edited B" }));

    // One dirty signal across both maps.
    expect(result.current.session.unsavedCount).toBe(2);

    // The save batch carries both maps' drafts.
    const yaml = buildWorldYamlContent({
      maps: MAPS,
      drafts: result.current.session.mapDrafts(),
      existingRaw: null,
    });
    expect(yaml).toContain("Edited A");
    expect(yaml).toContain("Edited B");

    // A save that wrote no world.yaml (pins only) clears no map's drafts.
    await act(async () => {
      await result.current.session.markSaved([]);
    });
    expect(result.current.session.mapDrafts().A.region.edits["r-A"]).toBeDefined();

    // A save that wrote map B only keeps A's draft.
    await act(async () => {
      await result.current.session.markSaved(["B"]);
    });
    act(() => result.current.regionDraft.applySnapshot({ edits: {}, added: [], deleted: [] }));
    expect(result.current.session.unsavedCount).toBe(1);
    act(() => result.current.switchTo("A"));
    expect(result.current.regionDraft.draft.edits["r-A"]).toEqual({ name: "Edited A" });
  });

  it("undo of another map's edit switches to that map and leaves the active map alone", async () => {
    const { result } = await mount();
    act(() => result.current.switchTo("B"));
    act(() => result.current.regionDraft.patch("r-B", { name: "Edited B" }));
    act(() => result.current.switchTo("A"));
    act(() => result.current.regionDraft.patch("r-A", { name: "Edited A" }));
    act(() => result.current.fogDraft.setEnabled(true));
    act(() => result.current.switchTo("B"));

    // Undo the fog edit, then the region edit, both made on A.
    act(() => {
      result.current.undoStack.undo();
    });
    expect(result.current.activeMapId).toBe("A");
    expect(result.current.fogDraft.dirty).toBe(false);
    act(() => {
      result.current.undoStack.undo();
    });
    expect(result.current.regionDraft.draft.edits["r-A"]).toBeUndefined();
    // B's own edit is untouched.
    expect(result.current.session.mapDrafts().B.region.edits["r-B"]).toEqual({
      name: "Edited B",
    });

    // Redo from B replays on A, not on B.
    act(() => result.current.switchTo("B"));
    act(() => {
      result.current.undoStack.redo();
    });
    expect(result.current.activeMapId).toBe("A");
    expect(result.current.regionDraft.draft.edits["r-A"]).toEqual({ name: "Edited A" });
    expect(result.current.session.mapDrafts().B.region.edits["r-B"]).toEqual({
      name: "Edited B",
    });
  });

  it("pins duplicated onto another map are clean after the save that wrote them", () => {
    const overrides = {
      "A:e1": { x: 1, y: 1 },
      "B:e1": { x: 2, y: 2 },
      "B:e2": { x: 3, y: 3 },
    };
    const foreign = foreignMapDraftPlacements(
      overrides,
      "A",
      ["A", "B"],
      [
        { id: "e1", title: "E1" },
        { id: "e2", title: "E2" },
      ],
    );
    const next = overridesAfterSave(overrides, {
      activeMapId: "A",
      writtenEntityIds: new Set(["e1"]),
      foreignMapDrafts: foreign,
    });
    // e1 was written on both maps; e2's file was not in this batch.
    expect(next).toEqual({ "B:e2": { x: 3, y: 3 } });
  });

  it("save-boundary undo puts other maps' drafts back; redo cleans them again", async () => {
    const { result } = await mount(["A", "B"]);
    act(() => result.current.switchTo("B"));
    act(() => result.current.regionDraft.patch("r-B", { name: "Edited B" }));
    act(() => result.current.switchTo("A"));
    expect(result.current.session.unsavedCount).toBe(1);

    // What the page's onSaved does when world.yaml was written.
    const pre = result.current.session.mapDrafts();
    const after = mapDraftsAfterSave(true, ["A", "B"], {
      layerByMap: {},
      mapOverride: {},
      slices: pre,
    });
    await act(async () => {
      await result.current.session.markSaved(after.writtenMapIds);
    });
    expect(result.current.session.unsavedCount).toBe(0);

    act(() => result.current.session.restoreOtherMapDrafts(pre));
    expect(result.current.session.unsavedCount).toBe(1);
    expect(result.current.session.status).toBe("unsaved");
    expect(result.current.session.mapDrafts().B.region.edits["r-B"]).toEqual({
      name: "Edited B",
    });

    act(() => result.current.session.restoreOtherMapDrafts(after.cleanSlices));
    expect(result.current.session.unsavedCount).toBe(0);
  });

  it("drafts kept for a map the project no longer has are not counted, and are kept", async () => {
    const { result, rerender } = await mount(["A", "B"]);
    act(() => result.current.switchTo("B"));
    act(() => result.current.regionDraft.patch("r-B", { name: "Edited B" }));
    act(() => result.current.switchTo("A"));
    expect(result.current.session.unsavedCount).toBe(1);

    // Map B is renamed away: its parked draft is an orphan.
    rerender(["A"]);
    expect(result.current.session.unsavedCount).toBe(0);
    expect(result.current.session.mapDrafts().B.region.edits["r-B"]).toEqual({
      name: "Edited B",
    });

    // A save of the project's maps leaves the orphan alone.
    const after = mapDraftsAfterSave(true, ["A"], {
      layerByMap: {},
      mapOverride: {},
      slices: result.current.session.mapDrafts(),
    });
    await act(async () => {
      await result.current.session.markSaved(after.writtenMapIds);
    });
    expect(result.current.session.mapDrafts().B.region.edits["r-B"]).toEqual({
      name: "Edited B",
    });
    expect(after.cleanSlices).not.toHaveProperty("B");
  });
});
