# Save refuses when an image's bytes are missing

Status: ready-for-human
Area: editor, local save

`AtlasPlacementEditor.tsx` ~862-878 warns about uploads with no bytes and then writes world.yaml
pointing at files that never land. The Save orchestration (~806-900) lives inside the 2,777-line
page and can only be tested by mounting it.

## Acceptance criteria

- A pure `planUnifiedSave(state)` returns either the changes or a reason to refuse; the page calls
  it and shows the reason.
- A missing upload is a refusal: nothing is written.
- Unit tests for the plan without mounting the page; the existing save tests pass.

## Comments

- 2026-10-27 (agent): `planUnifiedSave(state)` in `src/atlas/editor/saveGate.ts` returns
  `nothing-to-save`, `refused` (reason + detail) or `save` (changes); tests in
  `src/test/editor/plan-unified-save.test.ts`. An upload with no bytes now refuses Save: an error
  toast "Save refused: N uploaded image(s) have no bytes" names the layers, and no modal opens.
  Needs Isak's look at the toast in the editor.
