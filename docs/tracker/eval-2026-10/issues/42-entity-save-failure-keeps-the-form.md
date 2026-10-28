# A failed entity save keeps the form and says what failed

Status: ready-for-agent
Area: editor (entity panel, save)

Found by the reviews of ticket 33 (2026-10-28), verified by reading
`src/atlas/categories/EntityEditPanel.tsx`:
- A save error other than a conflict (~240-252) sets `phase = "error"`. That swaps the form for
  the load-error page (~455-467), which says "Its source file may be missing. Rebuild the
  atlas…". After a failed write (ticket 33's `WriteFailedError`, or a refused save) the file is
  fine. The draft is kept, but the form is gone and the advice is wrong.
- The panel ignores the save result (~234-239). When the files are written but the rebuild
  fails (207 without `WriteFailed`), it says "Saved." and never mentions the rebuild. The review
  dialog does say "Files saved, but the atlas rebuild failed".

## Acceptance criteria

- A failing test first for each.
- A failed save keeps the edit form and the draft, shows an inline alert naming what failed
  (the file, and that nothing was saved), and Save stays enabled to retry. The load-error page
  is only for a failed load.
- A save whose rebuild failed says the file is saved but the rebuild failed, with the build's
  message, in the review dialog's wording.
- Stack on #84 (ticket 33's `WriteFailedError`). #86 edits the same file at ~125-140 only.
