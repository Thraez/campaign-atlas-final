# Editor drafts are kept per map: a save never loses another map's work

Status: ready-for-agent
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
