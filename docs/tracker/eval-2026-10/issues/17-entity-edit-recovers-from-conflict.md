# Entity edit recovers from a save conflict

Status: done
Area: editor, local save

Provisional call (grill round 2, Q5), 2026-10-27: Isak hasn't answered yet; ticketed on the
recommended answer, ranked ahead of `code-retro/06`-`08`. First step of the parked "one client for
canon" note (README).

Bug. `EntityEditPanel.onSave` (`src/atlas/categories/EntityEditPanel.tsx` ~173-212) saves with the
draft's `baseHash`. On a 409 it goes to the error phase, which shows "Its source file may be
missing", and keeps the draft with its stale `baseHash`, so every later save of that entity fails
too. The reload path keeps an existing draft for the same `sourcePath` without refreshing its hash.

## Acceptance criteria

- A conflict says the file changed on disk, not that it may be missing.
- The DM can rebase: reload the file from disk, keep their draft's edits on top of it with the new
  `baseHash`, and save again. Nothing they typed is lost.
- Tests: a 409 followed by rebase and save succeeds; the message names the conflict.

## Comments

2026-10-27, branch `eval-17-entity-conflict`:

- `EntityEditPanel.onSave` catches `ConflictError` (`stale-base`, `missing-base`) and stays on the
  form with a banner: "This file changed on disk after you opened it, so Save was refused. Your
  edits are still here." plus "Reload from disk and keep my edits". Other errors still go to the
  error page.
- The rebase re-reads the file, refreshes `rawRef` (so frontmatter the panel doesn't edit comes
  from the new file) and calls the new `useEntityEditDraft.rebase(baseHash, disk)`: fields, body
  and secrets stay as typed, `baseHash` becomes the new file's, `pristine` the new file's state.
  The disk-to-draft parse is one helper, `draftContentFromDisk`, shared with the load effect.
- Tests: `src/test/categories/EntityEditPanel-conflict.test.tsx`, against a fake save endpoint
  that 409s on a stale `baseHash`. Both component tests failed on the old code.
- Out of scope, left as is: the rebase is draft-wins, not a merge; edits made in Obsidian to the
  body or the four edited fields are overwritten by the draft on the next Save (untouched
  frontmatter keys survive). The load effect still keeps an existing draft with its old
  `baseHash` on re-open; the first Save after an outside change now lands in the conflict banner
  rather than failing for good. A `missing-base` (file deleted) rebase fails the read and shows a
  toast. A real three-way merge and the shared canon client are the "one client for canon" work.
- Needs Isak's look at the banner in the editor (not run in the browser here).
