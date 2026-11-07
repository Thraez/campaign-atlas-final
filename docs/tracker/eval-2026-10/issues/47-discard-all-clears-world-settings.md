# "Discard all" leaves world settings and the calendar unsaved

Status: done
Area: editor (session, undo)

Found in an architecture review (2026-11-07).

`useEditorSession` (`src/atlas/session/useEditorSession.ts`) owns every draft holder the editor
registers with it: it persists them to IndexedDB, restores them after a reload, and "Discard all"
(`discardAll`) resets them. Two drafts in `src/pages/AtlasPlacementEditor.tsx` were never
registered:

- **World settings** (`worldOverride`: name, credits, assetCredits). Undo-tracked, but not a
  session holder.
- **The world calendar** (`calendarDraft`). Plain `useState`: not a session holder and not on the
  undo stack.

Both count in the unsaved total (`perMapDirtyCount`), so:

- **Bug, verified by reading and by a session-level test:** after "Discard all" the chip still reads "1 unsaved
  change" (or 2) and offers Save, while the confirm said everything was reverted.
- A reload drops both drafts silently: they were never in the session blob.
- A calendar edit could not be undone.

## Acceptance criteria

- A failing test first: "Discard all" leaves the world settings and calendar drafts clean.
- Both are registered as session holders like the other drafts, not special-cased in `discardAll`:
  persisted, restored after a reload, cleared by "Discard all".
- A calendar edit is undoable; undo restores the previous calendar.
- Sessions saved before this change still load (the new slices default to empty).

## Comments

**Built (2026-11-07).**

- `SessionState` (`src/atlas/session/sessionSnapshot.ts`) gains `worldOverride` and `calendar`
  (new type `CalendarDraft`). A v1 blob without them deserializes with `{}` and `null`, so old
  sessions still load; `sessionHasWork` counts both.
- `useEditorSession` takes `world` and `calendar` holders and collects, restores and clears them
  with the rest. Its four hand-written empty-session literals became one `emptySession()`.
- New `useUndoableState` (`src/atlas/useUndoableState.ts`): a value, a synchronous `ref`, a
  non-recording `set` and an undo-recording `update`. It replaces the editor's hand-written
  `worldOverride` ref, sync effect and `setWorldOverrideUndoable`, and gives the calendar undo.
- Tests: `src/test/session/useEditorSession.test.tsx` (discard clears both; both persist and
  restore), `src/test/session/sessionSnapshot.test.ts` (old blobs, `sessionHasWork`, round-trip),
  `src/test/editor/useUndoableState.test.tsx` (undo/redo, `set` doesn't record), and
  `src/test/editor/discard-all-world-settings.test.tsx` (the whole editor: a restored world
  rename and calendar show "2 unsaved changes"; Discard all lands on "All changes saved" and
  empties the stored session). The session tests failed before the fix.

**Review fix (2026-11-07).** After a save the calendar draft lingered, equal to the reloaded
canon; if canon then changed underneath (a Sync from Obsidian), the stale draft turned dirty and the
next save wrote the old calendar back. The calendar draft now lives in `useCalendarDraft`
(`src/atlas/calendar/useCalendarDraft.ts`), which drops a draft once it equals canon, without an
undo entry, and keeps a restored draft while canon is still loading. Tested in
`src/test/editor/useCalendarDraft.test.tsx` (draft equal to canon is dropped; a later canon change
stays clean and the save writes canon; failed without the fix).

Provisional call: the save path still does not clear the calendar draft itself, and the
save-boundary undo does not cover the calendar, as before. Clearing it at save time would make a
later save write the old calendar back whenever the rebuild failed and canon was not reloaded.

Known gaps:

- `sessionHasWork` counts a world settings override for any world id, while the unsaved count uses
  only the active world (`baseWorld.id`). An override kept for another world raises a restore
  notice but no unsaved count.
- Undo granularity: `CalendarPanel` calls `onPatch` per keystroke, so each keystroke is its own
  undo entry. World settings already work the same way.
Not done: pin overrides and map metadata still use their own hand-written undoable setters; they
could move to `useUndoableState` too, but that is outside this ticket. Not checked in the preview
pane.
