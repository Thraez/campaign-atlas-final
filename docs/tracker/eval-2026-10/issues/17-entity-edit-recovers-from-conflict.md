# Entity edit recovers from a save conflict

Status: ready-for-human
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
- Superseded by the review fixes below (the draft-wins rebase, the unrefreshed reopen and the
  missing-base path are fixed there).

2026-10-27, review fixes on the same branch:

- Rebase is per field now (`rebaseDraft` in `useEntityEditDraft.ts`): for id, type, visibility,
  summary, the body and the secrets list, what the DM changed since the draft's base (`pristine`)
  is kept and anything untouched takes the disk's value. When the DM and the disk both changed the
  body, the DM's body wins and the panel says Save will overwrite the outside edits.
- Reopen: when the load effect keeps a parked draft and the disk hash differs from its
  `baseHash`, it rebases at once by the same rule, so the first Save doesn't 409.
- `missing-base` (file deleted or moved): its own banner, "This file was deleted or moved on
  disk", with "Save as a new file", a create-only save (`baseHash: null`). That is safe here:
  `/__atlas/save` refuses a create-only write if a file exists at the path (`already-exists`),
  and the panel then shows the changed-on-disk banner so the DM can rebase onto it. A rebase
  whose read 404s also lands on the deleted banner.
- Races: Save is disabled while rebasing; Save and rebase drop their result if the panel moved
  to another entity; `rebase()` ignores a draft for another sourcePath; banner state resets on a
  sourcePath change. `conflict`/`rebasing` folded into the `phase` union (`conflict`,
  `rebasing`, `deleted`). `EntityEditContent` and `draftContentFromDisk` moved to
  `useEntityEditDraft.ts`.
- New tests in the same file: untouched fields take disk values; deleted file says so and Save as
  a new file succeeds; reopen after an outside change saves first time; the hook test covers the
  per-field rule and the sourcePath guard. Each new behaviour test failed before the fix.
- Checked in the dev editor (worktree vite on its own port, save endpoint stubbed in the page so
  nothing was written): both banners render in the panel, and Reload clears the conflict banner.
  The overwrite notice was only checked in tests.
- Still open: no real three-way merge of the body; both-sides body edits are DM-wins with a
  notice. The shared canon client is the "one client for canon" work.
- Status `ready-for-human`: the banner is editor UI and needs Isak's look.
