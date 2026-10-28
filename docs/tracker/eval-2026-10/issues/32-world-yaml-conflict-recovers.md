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
