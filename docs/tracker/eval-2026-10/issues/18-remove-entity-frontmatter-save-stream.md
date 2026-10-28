# Remove the unused entity-frontmatter save stream

Status: done
Area: editor, local save
Blocked by: 16

Found in the eval-16 review, 2026-10-27. With the Entities tab gone, the editor always passes
`entityDrafts: {}` to `buildSavePlan` (`src/atlas/editor/saveGate.ts`), so the frontmatter-draft
stream (`entityFrontmatterPatches`, `mergeFrontmatterFields` in `canonicalEntitySave.ts`) runs
only in tests (`placement-save-integration.test.tsx`). Entity edits go through
`EntityEditPanel`.

## Acceptance criteria

- `buildSavePlan` no longer takes `entityDrafts`; the frontmatter merge stream and its test-only
  callers are gone.
- Placement saves (pins, map, world.yaml) behave as before: the existing save tests that don't
  depend on the removed stream pass unchanged.

## Comments

- 2026-10-27 (agent, branch `eval-18-drop-frontmatter-stream`, stacked on eval-16): traced
  callers first; the only live `buildSavePlan` call (`AtlasPlacementEditor.onSaveClick`) passed
  `entityDrafts: {}`, and nothing else built frontmatter patches. Removed
  `src/atlas/save/canonicalEntitySave.ts` (`FrontmatterDraft`, `entityFrontmatterPatches`,
  `mergeFrontmatterFields`, `buildCanonicalEntityChanges`) and `EntityFrontmatterPatch` from
  `buildPatches.ts`. Without the frontmatter stream, `buildCanonicalEntityChanges` did exactly
  what `buildCanonicalPlacementChanges` does (same grouping, errors and one change per path), so
  the editor now calls that directly. `buildSavePlan` drops `entityDrafts`, `projectEntities`
  and `frontmatterPatches`. Tests: deleted `src/test/save/canonicalEntitySave.test.ts`; the
  frontmatter seam tests in `atlas-entity-save-seam.test.ts` went with it, and the file is now
  `world-yaml-path.test.ts` (its placement-only and error-path cases are already covered in
  `canonical-placement-save.test.ts`). `placement-save-integration.test.tsx` only lost the
  removed params and the `frontmatterPatches` assertion. Gate: typecheck:all, lint (0 errors,
  13 warnings), format:check, test:ci (4 shards green), atlas:publish (all 12 scans clean),
  integrity smoke safe.
- Two-axis review (2026-10-27): no findings to fix. It confirmed `buildCanonicalEntityChanges` with
  no frontmatter behaved exactly like `buildCanonicalPlacementChanges` (grouping, order, errors,
  `baseHash`, world.yaml last), and that the deleted tests covered nothing still live. Follow-up
  note, no work: `src/atlas/yaml/buildPatches.ts` now holds only `PlacementOverride`; rename it or
  move the type next to `canonicalPlacementSave.ts`.
