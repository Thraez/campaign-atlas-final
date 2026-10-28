# The Save chip names an unsaved entity edit instead of "No changes to save"

Status: ready-for-human (review pending)
Area: editor (save)

Found by the fourth sweep (2026-10-28), verified by reading. The status count
(`AtlasPlacementEditor.tsx` ~1022) includes `entityEditDraft.isDirty()`, but `onSaveClick`
(~808-822) never saves it: only `EntityEditPanel` does. So the chip shows unsaved work, and Save
(or Cmd+S) answers "No changes to save".

Provisional call (State.md): the entity panel keeps owning that save; the chip and the toast name
it.

## Acceptance criteria

- With only an entity edit pending, the chip says so ("1 entity edit – open it to save"), and
  Save or Cmd+S opens or points to the entity panel instead of "No changes to save".
- With map drafts and an entity edit both pending, Save saves the map drafts and says the entity
  edit is still open.
- A test covers both cases.

## Comments

2026-10-28, branch `eval-31-save-chip-entity-edit` (on `eval-19-upload-target-path`):

- The entity panel still owns the entity save. `SaveStatus` takes `entityEditPending`: with only
  the entity edit unsaved the chip says "1 entity edit – open it to save"; with other changes too,
  "N unsaved changes · 1 entity edit open".
- `onSaveClick` (Save button, Cmd+S, palette): when the plan is "nothing to save" but the entity
  draft is dirty, it opens that entity's category and surface in Edit (`openPendingEntityEdit`,
  matched by the draft's `sourcePath`) with a toast naming the entity, instead of "No changes to
  save". If the entity is no longer in canon, the toast says to open it to save.
- With map drafts and an entity edit, Save writes the map batch as before; after the save a toast
  says "Map changes saved. Your entity edit is still open: save it from its panel." with an
  "Open it" action.
- `EntitySurface` opens in Edit when a dirty parked draft belongs to that entity, and remounts
  (a nonce key) when Save points to it, so a surface already open in Reading switches to Edit.
  (Superseded by the review fixes below: no remount.)
- Tests: `src/test/editor/save-entity-edit-pending.test.tsx` mounts the page with a restored
  session (entity draft, plus a map rename for the mixed case). All three failed on the old code.
- For Isak's look in the preview: the chip wording, and that Save with a restored entity edit lands
  in the edit form.

2026-10-28, review fixes on the same branch:

- No remount: `EntitySurface` takes an `editRequest` counter. A bump switches Reading to Edit and
  focuses the form; a surface already in Edit stays mounted, so the panel's banners (ticket 17's
  conflict and deleted banners, once that lands here) and any rebase in flight survive. Test: Save
  twice with the panel open in Edit reads the entity file once.
- Save with no active map now still points to a pending entity edit (the check runs before the
  `!project || !activeMap` guard). Not tested: the page can't easily be mounted with no map.
- The chip takes `entityEditCount` (from the draft, 0 or 1 today) and pluralizes; with 0 it
  claims nothing. `SaveStatus.test.tsx` covers it.
- One helper, `useEntityEditDraft().pendingFor(sourcePath?)`, replaces the four dirty and
  sourcePath checks; hook test added.
- Deliberate behaviour change: an entity with an unsaved edit now opens straight in Edit (from
  any way in, not only from Save), so the DM lands on their unsaved work.
- Ticket tags dropped from code comments.
