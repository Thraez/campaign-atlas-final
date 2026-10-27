# One Note reading module for id, title, type and visibility

Status: ready-for-agent
Blocked by: 01, 02, 04
Area: build, Sync, safety scans

Five places work out a note's id, title, type and visibility, and whether it is secret: `scripts/build-atlas.ts` (233, 405-432, 487-507), `scripts/atlas/parseFrontmatter.ts`, `src/atlas/import/frontmatter.ts`, `scripts/check-derived-secrets.ts:128-210`, `src/atlas/import/stagingState.ts:145-235`, `mergeImportFrontmatter.ts`. Seven files redefine the visibility sets instead of importing `src/atlas/content/visibility.ts` (`EntityReadingView.tsx:13`, `projectMapForPlayer.ts:3`, `projectEntityForPlayer.ts:16`, `filterEntitiesForLens.ts:4`, `profileBuild.ts:10`, `mergeImportFrontmatter.ts:4-5`, `ImportStagingModal.tsx:229`).

Deepening: one browser-safe `readNote(raw, relPath)` plus one content-folder scan in `src/atlas/content/`, used by the build, Staging, the merge and the safety scans.

## Acceptance criteria

- A fixture note with no `atlas.visibility` gets the same visibility from Staging, the merge, the build and the derived-secrets scan.
- Title, id and type come out identical from all callers for a fixture set covering untitled, flat-`type:` and `_dm/` notes.
- A lint rule or test finds no visibility literal list outside `visibility.ts`.
- Safety scans and `atlas:publish` pass.
