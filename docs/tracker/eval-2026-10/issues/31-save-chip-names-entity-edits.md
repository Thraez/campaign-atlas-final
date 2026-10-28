# The Save chip names an unsaved entity edit instead of "No changes to save"

Status: ready-for-agent
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
