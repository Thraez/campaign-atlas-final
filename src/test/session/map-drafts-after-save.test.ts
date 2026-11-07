/**
 * eval-30: the editor's onSaved cleanup of map drafts, as the pure functions
 * the page calls (mounting the page to drive layer and metadata drafts on two
 * maps through the UI is too heavy; the page passes these results straight to
 * its stores, session.markSaved and the save-boundary redo).
 */
import { describe, it, expect } from "vitest";
import {
  draftMapIds,
  mapDraftsAfterSave,
  orphanDraftMapIds,
} from "@/atlas/session/mapDraftsAfterSave";
import type { MapSlices } from "@/atlas/session/useEditorSession";

const EMPTY = { edits: {}, added: [], deleted: [] };
const dirtySlice = (name: string): MapSlices => ({
  region: { edits: { r1: { name } }, added: [], deleted: [] },
  route: EMPTY,
  fog: null,
});

const pre = {
  layerByMap: { A: [{ id: "l1" }], B: [{ id: "l2" }], Gone: [{ id: "l3" }] },
  mapOverride: { A: { name: "A2" }, B: { name: "B2" }, Gone: { name: "Old" } },
  slices: { A: dirtySlice("a"), B: dirtySlice("b"), Gone: dirtySlice("g") } as Record<
    string,
    MapSlices
  >,
};

describe("mapDraftsAfterSave", () => {
  it("a world.yaml save clears every project map's layer and metadata drafts", () => {
    const r = mapDraftsAfterSave(true, ["A", "B"], pre);
    expect(r.writtenMapIds).toEqual(["A", "B"]);
    expect(r.nextLayerByMap).toEqual({ Gone: [{ id: "l3" }] });
    expect(r.nextMapOverride).toEqual({ Gone: { name: "Old" } });
    // The save-boundary redo cleans the written maps' slices, not the orphan's.
    expect(Object.keys(r.cleanSlices).sort()).toEqual(["A", "B"]);
    expect(r.cleanSlices.A).toEqual({ region: EMPTY, route: EMPTY, fog: null });
    // The inputs (what the save-boundary undo restores) are not mutated.
    expect(Object.keys(pre.layerByMap)).toEqual(["A", "B", "Gone"]);
    expect(Object.keys(pre.mapOverride)).toEqual(["A", "B", "Gone"]);
  });

  it("a save without world.yaml clears no map's drafts", () => {
    const r = mapDraftsAfterSave(false, ["A", "B"], pre);
    expect(r.writtenMapIds).toEqual([]);
    expect(r.nextLayerByMap).toBe(pre.layerByMap);
    expect(r.nextMapOverride).toBe(pre.mapOverride);
    expect(r.cleanSlices).toEqual({});
  });
});

describe("orphanDraftMapIds", () => {
  it("lists ids holding a draft that the project no longer has", () => {
    expect(orphanDraftMapIds(pre, ["A", "B"])).toEqual(["Gone"]);
  });

  it("ignores empty drafts", () => {
    const d = {
      layerByMap: { X: [] },
      mapOverride: { Y: {} },
      slices: { Z: { region: EMPTY, route: EMPTY, fog: null } },
    };
    expect(draftMapIds(d)).toEqual([]);
    expect(orphanDraftMapIds(d, [])).toEqual([]);
  });
});
