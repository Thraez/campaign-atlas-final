# Editor drafts are kept per map: a save never loses another map's work

Status: done
Area: editor (session, save, undo)

Found by the fourth sweep (2026-10-28), the editor page's second pass. Region, route, fog, layer and
map-metadata drafts are single slots that `useEditorSession` swaps in and out on a map switch
(`collectActiveInto`/`applyActiveFrom`). Everything downstream assumes one map:

- **Bug, verified with a test:** a save throws away other maps' region, route and fog drafts.
  `markSaved` (`src/atlas/session/useEditorSession.ts` ~201-214) empties `regionByMap`,
  `routeByMap` and `fogByMap` for every map. But `buildSaveBatch.ts` (~100) writes only the active
  map's drafts into world.yaml. The status count (`AtlasPlacementEditor.tsx` ~1009-1023) counts
  only the active map too, so it reads clean while another map holds a draft.
- **Bug, verified with a test:** undo or redo after a map switch applies map A's region or route
  edit to map B (`src/atlas/editor/useDraftCore.ts` ~52-63). Undo entries close over one shared
  draft slot, and the stack is never cleared or scoped on a map switch. The next save writes the
  result into B.
- **Bug, verified by reading:** after a save, pins duplicated onto other maps still count as
  unsaved and are rewritten on every save. The `onSaved` cleanup (`AtlasPlacementEditor.tsx`
  ~2152-2158) deletes only the active map's override keys, though `foreignMapDrafts` (~827) were
  in the same batch.
- There are three "unsaved" signals that disagree: `hasUnsavedChanges` (beforeunload, ~958),
  `perMapDirtyCount` (the chip) and `worldYamlDirty` (what gets saved).

Deepening: one draft store keyed by map answers what is dirty, what to save, what to clear and
what to undo, per map. The three signals derive from it.

Provisional calls (State.md): one save writes every map's drafts, since all maps share one
world.yaml; undoing an edit made on another map switches to that map first.

## Acceptance criteria

- A failing test first for each of the three bugs above, through the real hooks.
- A save writes every map's dirty drafts and clears only what it wrote.
- The status chip, beforeunload and the save batch read one dirty signal that covers all maps.
- An undo entry carries its map; undoing it switches to that map and never changes another
  map's draft.
- Pins duplicated to another map are clean after the save that wrote them.
- The editor is checked by eye in the preview: draw on two maps, save once, reload, and both
  maps keep their edits (ready-for-human).

## Comments

2026-11-07 (agent, branch `eval-30-drafts-per-map`): done for the code; the last criterion (draw on
two maps, save once, reload) is **ready-for-human**.

- Save: `buildWorldYamlContent` takes `drafts: Record<mapId, MapDraft>` and applies each map's
  metadata, layer, region, route and fog draft (`applyMapDraft`). The page builds that from the
  map-override store, `useMapLayers` (already keyed by map) and the new `session.mapDrafts()`.
  `markSaved(writtenMapIds)` clears only the maps the save wrote; a save without world.yaml clears
  none.
- One dirty signal: `session.unsavedCount` = active map + `otherMapsDirtyCount`. The chip,
  beforeunload and `worldYamlDirty` all read it; `lastLocalEditAt` and `pinSideUnsaved` are gone.
- Undo: entries carry `mapId` (`useDraftCore`, fog, layers, map metadata). `useUndoStack` takes a
  `switchToMap` option and calls it before undo/redo; the page switches map through the session.
- Pins: `overridesAfterSave` also clears written foreign-map override keys.
- Tests: `src/test/session/drafts-per-map.test.tsx` (three bugs, real hooks, each red first);
  `build-save-batch.test.ts` moved to the per-map interface.

Provisional calls: every map is written in one world.yaml save, so a world.yaml save clears all
maps' drafts; undo of another map's edit switches to that map first; beforeunload now also warns
for restored (localStorage) pins, since it reads the one signal. A map without a fog draft no
longer gets a default fog block written.

Not covered: the soundscape draft is still one slot (same cross-map undo issue); null (deleted-pin)
overrides on other maps are not in `foreignMapDrafts`. The page-level switch wiring and `onSaved`
cleanup are covered only through the hook tests and existing page-mount tests.
