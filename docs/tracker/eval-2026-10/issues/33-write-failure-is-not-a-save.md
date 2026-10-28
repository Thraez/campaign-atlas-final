# A failed, rolled-back write never reads as a save

Status: ready-for-agent
Area: editor (save), sync

Found by the fifth sweep (2026-10-28), verified by reading. When a write fails partway, the save
endpoint rolls back and answers **207** `{error: "WriteFailed", partialWrite: true, saved: 0,
rolledBack, failedPath}` (`scripts/vite-plugin-atlas-save.ts` ~743-753). 207 passes `res.ok`, so
`saveAtlasPatchToLocalFs` returns it as a `LocalSaveResult` (`src/atlas/save/localFsSave.ts`
~212, 248), and nothing under `src/` checks `partialWrite`. The test fakes the failure as a 500
(`src/test/local-fs-save.test.ts` ~163), so it never sees the real shape.

What follows, with nothing written:
- `DiffPreviewModal.tsx` (~140-145) shows success and calls `onSaved`, which clears the drafts.
- `EntityEditPanel.tsx` (~234-238) clears the edit.
- The import flow (`useMdImportFlow.ts` ~301-322, and `sync.ts` ~318-339 on code-retro-07)
  records sync-map entries for notes it never wrote, so the next sync skips them.

Provisional call (State.md): ship this as a small fix now, ahead of ticket 39.

## Acceptance criteria

- A failing test first, through the real save handler with a write forced to fail: the client
  sees a failure, not a save.
- The client turns the 207 `WriteFailed` reply into a `WriteFailedError` (or 39's
  `write-failed` outcome) that names `failedPath` and how many files were rolled back.
- The drafts, the entity edit and the sync map are untouched after a failed write, and the DM is
  told which file failed.
- Stack on code-retro-07 (#79) for the sync-map half, or fix the editor half on main and the sync
  half there.
