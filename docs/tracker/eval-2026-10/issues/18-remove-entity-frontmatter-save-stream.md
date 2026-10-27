# Remove the unused entity-frontmatter save stream

Status: ready-for-agent
Area: editor, local save
Blocked by: 16

Found in the eval-16 review, 2026-10-27. With the Entities tab gone, the editor always passes
`entityDrafts: {}` to `buildSavePlan` (`src/atlas/save/saveGate.ts`), so the frontmatter-draft
stream (`entityFrontmatterPatches`, `mergeFrontmatterFields` in `canonicalEntitySave.ts`) runs
only in tests (`placement-save-integration.test.tsx`). Entity edits go through
`EntityEditPanel`.

## Acceptance criteria

- `buildSavePlan` no longer takes `entityDrafts`; the frontmatter merge stream and its test-only
  callers are gone.
- Placement saves (pins, map, world.yaml) behave as before: the existing save tests that don't
  depend on the removed stream pass unchanged.
