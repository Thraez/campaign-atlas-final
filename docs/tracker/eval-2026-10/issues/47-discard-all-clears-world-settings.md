# "Discard all" leaves world settings and the calendar unsaved

Status: in-review
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

Provisional call: the calendar draft is handed to the session only while it differs from canon.
After a save the draft lingers (equal to the new canon once it reloads), as it did before; clearing
it on save instead would make a later save write the old calendar back whenever the rebuild failed
and canon was not reloaded. So the save path is unchanged and the save-boundary undo does not
cover the calendar, as before.

Not done: pin overrides and map metadata still use their own hand-written undoable setters; they
could move to `useUndoableState` too, but that is outside this ticket. Not checked in the preview
pane.
