# A world.yaml conflict recovers without a page reload

Status: ready-for-human (review pending)
Area: editor (save, conflicts)

Found by the fourth sweep (2026-10-28), verified by reading. `worldYamlBaseline.refresh()` runs
only after a successful save (`AtlasPlacementEditor.tsx` ~2197). On a 409 stale-base for
world.yaml (`DiffPreviewModal.tsx` ~160-176), the baseline stays stale, so "Try again" fails the
same way until the page is reloaded. Ticket 17 fixed the same pattern for entity edits; follow
its approach.

## Acceptance criteria

- A failing test first: a world.yaml 409, then Try again, succeeds once canon is re-read.
- On a world.yaml conflict the editor re-reads the baseline and canon, rebuilds the diff, and
  tells the DM what changed underneath.
- The DM's drafts survive the conflict.

## Comments

2026-10-28, branch `eval-32-world-yaml-conflict` (on `eval-31-save-chip-entity-edit`):

- `DiffPreviewModal` takes `onConflict(err)`. On a `ConflictError` it asks the editor to recover;
  a notice back puts the modal in a `rebased` phase: the review list (rebuilt diff) with the notice
  above it and the confirm button reading "Try again". `null` keeps the old conflict error.
- The editor's `onSaveConflict` handles a conflict on the active world's world.yaml (any reason:
  `stale-base`, `missing-base`, `already-exists`): it runs `worldYamlBaseline.refresh()` and
  `loadAtlasContent(true)` together, then an effect (after both have rendered) re-plans the batch
  through the same `planSave()` Save uses, replaces the pending changes and returns the notice:
  world.yaml changed on disk, nothing was written, the diff is now against the file as it is,
  your changes are kept. Drafts are never touched. Conflicts on other paths keep the old message.
- `onSaveClick`'s plan call moved into `planSave()` so Save and the replan build the same batch.
- Test: `src/test/editor/world-yaml-conflict-recovers.test.tsx`, against a fake endpoint that
  409s on a stale `baseHash`: the 409, the notice, a canon re-read, then Try again writes a
  world.yaml that keeps both the outside edit (its header comment) and the DM's map rename. It
  failed on the old code.
- Still open: the rebuilt world.yaml is the DM's drafts on top of the new file, so an outside
  change to a key the DM also edited loses to the draft (like ticket 17's body rule). The notice
  doesn't list which keys changed underneath; the rebuilt diff shows it.
- For Isak's look in the preview: the notice wording and its place in the review dialog.
- Superseded in part by the review fixes below (the notice, the chip, the replan effect).

2026-10-28, review fixes on the same branch (31's review fixes merged in first):

- What changed underneath: `src/atlas/save/worldYamlConflict.ts` compares the old baseline, the
  file now on disk and the rebuilt file, leaf by leaf (maps, layers, regions keyed by id, so
  `maps.caves.name`). The notice names what changed outside; when the rebuilt file would replace
  an outside edit (the DM's draft touches it, or canon didn't pick it up) it says "Try again will
  overwrite these outside edits: …". A deleted file reads "(the whole file was deleted)".
  Comment-only changes read "only comments or formatting changed".
- The chip: the modal now asks `onConflict` before `onWriteFailed`. A recovered conflict calls
  `session.markIdle()` (back to the unsaved count); a failed recovery still marks Save failed.
- No parked resolver or effect: `refresh()` now resolves to the fresh baseline, canon is set with
  `flushSync`, and `planSave(baseline)` (through a ref to the latest render) builds on that
  baseline. The `eslint-disable` is gone. A close bumps `saveAttemptRef` and retires the modal's
  per-open token, so a late recovery result is dropped. The close test checks the next Save is an
  ordinary review that writes; it can't tell the guards apart from the reopen reset (Save refuses
  while the re-read is in flight), so the guards are defensive.
- `onSaveClick`'s JSDoc is back above it; `planSave` has its own.
- Tests: `src/test/save/world-yaml-conflict.test.ts` (6, the pure diff and notice) and
  `src/test/editor/world-yaml-conflict-recovers.test.tsx` (5: disjoint keys listed and both kept,
  same key warns overwrite, missing-base recreates, failed recovery keeps Save failed, close
  mid-recovery). The first three and the chip check failed on the previous code.
