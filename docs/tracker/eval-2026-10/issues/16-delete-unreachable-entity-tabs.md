# Delete the unreachable entity-editing tabs

Status: done
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

## Comments

### 2026-10-27 (agent, Opus)

Traced imports from `src/main.tsx`, `src/App.tsx`, `src/pages/` and `scripts/`: no non-test
module reached `EntitiesTab`, its `entities/` sections or `validatePatch.ts`.

Deleted (1,749 lines removed, 28 added across 19 files):

- `src/atlas/tabs/EntitiesTab.tsx` and all of `src/atlas/tabs/entities/` (EntityForm,
  ProfileSection, RelationshipSection, HandoutBundleSection, ListField).
- `src/atlas/yaml/validatePatch.ts`.
- `src/atlas/DmMaskingTextarea.tsx`: only the deleted sections imported it, and no test did.
- Tests: `src/test/tabs/EntitiesTab.test.tsx`, `src/test/atlas-yaml-canon.test.ts`, the
  `validatePatchYaml` blocks in `atlas-patch-engine.test.ts` (its `validateProject` tests stay)
  and the EntitiesTab trash-button cases in `accessibility-labels.test.tsx`.
- `atlas-import.test.ts` checked `buildEntityFrontmatterPatch` output with `validatePatchYaml`;
  it now parses it with `js-yaml` and keeps its no-fence assertion.

Kept, and why:

- The fence rule: `validatePatchYaml` only ever ran in tests, so no live safety check is lost.
  The live one is `scripts/atlas/loadWorldConfig.ts`, which rejects fenced `world.yaml` at build
  time; `dump.ts`'s comment now points there.
- `buildPatches.ts`: `EntityFrontmatterPatch` and `PlacementOverride` are live (canonical save,
  save gate, placement editor). `buildEntityFrontmatterPatch` is now test-only; left in with its
  tests since it is outside this ticket.
- `profileFields.ts`: now imported only by `atlas-profiles.test.ts`. Kept as the record of the
  `atlas.profile` YAML keys; comment updated.
- `canonicalEntitySave` / `saveGate` frontmatter-draft path: live code, but the placement editor
  passes `entityDrafts: {}`, so the stream is vestigial. Comments no longer name the Entities tab.

Follow-up candidates: `buildEntityFrontmatterPatch`, `profileFields.ts` and the empty
frontmatter-draft stream in `buildSavePlan`.

### 2026-10-27 (agent, Opus): review fixes

Two-axis review confirmed reachability; status stays `done` now that review has run (non-UI
change). Fixes on the same branch:

- Deleted `src/atlas/profiles/profileFields.ts` and `buildEntityFrontmatterPatch` (with
  `PatchArtifact`/`PatchKindId`), plus the tests that covered only them (`dmFieldsForType` cases in
  `atlas-profiles.test.ts`, the builder cases in `atlas-import.test.ts` and
  `yaml/buildPatches.test.ts`; the remaining `patchHeader`/`dumpYaml` cases moved to
  `yaml/dump.test.ts`). `buildPatches.ts` keeps `PlacementOverride` and `EntityFrontmatterPatch`.
- Frontmatter-draft save stream left in place; comments now say `entityDrafts` is always `{}` in
  production and pending removal (eval-2026-10/18).
- `docs/IMPORT_EXPORT.md`: profile/relationships point at the vault; the "Export patch" section
  (no such button exists) replaced with the real Save flow and the Regions/Routes/Fog YAML
  previews; the multi-entity handout note no longer points at the Entities tab.
- Comments that narrated history now say what the code is for; `dump.ts` says the build-time fence
  check covers `world.yaml` only.

