# Delete the unreachable entity-editing tabs

Status: ready-for-agent
Area: editor

Provisional call (grill round 2, Q4), 2026-10-27: Isak hasn't answered yet; built on the
recommended answer. The code stays in git history if he reverses it.

`src/atlas/tabs/EntitiesTab.tsx`, its sections in `src/atlas/tabs/entities/` (Profile,
Relationship, Handout) and `src/atlas/yaml/validatePatch.ts` are imported only by tests. Entity
editing goes through `EntityEditPanel`, and the vault owns profiles and relationships.

## Acceptance criteria

- The unreachable files and the tests that only cover them are gone; anything still used elsewhere
  (check `profileFields.ts`, `buildPatches.ts`, the import tests) stays, moved if needed.
- Comments that point at `EntitiesTab` are updated.
- Typecheck, lint and the full test suite pass.
