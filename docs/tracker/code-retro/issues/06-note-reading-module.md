# One Note reading module for id, title, type and visibility

Status: ready-for-agent (built, awaiting review)
Blocked by: 01, 02, 04
Area: build, Sync, safety scans

Five places work out a note's id, title, type and visibility, and whether it is secret: `scripts/build-atlas.ts` (233, 405-432, 487-507), `scripts/atlas/parseFrontmatter.ts`, `src/atlas/import/frontmatter.ts`, `scripts/check-derived-secrets.ts:128-210`, `src/atlas/import/stagingState.ts:145-235`, `mergeImportFrontmatter.ts`. Seven files redefine the visibility sets instead of importing `src/atlas/content/visibility.ts` (`EntityReadingView.tsx:13`, `projectMapForPlayer.ts:3`, `projectEntityForPlayer.ts:16`, `filterEntitiesForLens.ts:4`, `profileBuild.ts:10`, `mergeImportFrontmatter.ts:4-5`, `ImportStagingModal.tsx:229`).

Deepening: one browser-safe `readNote(raw, relPath)` plus one content-folder scan in `src/atlas/content/`, used by the build, Staging, the merge and the safety scans.

## Acceptance criteria

- A fixture note with no `atlas.visibility` gets the same visibility from Staging, the merge, the build and the derived-secrets scan.
- Title, id and type come out identical from all callers for a fixture set covering untitled, flat-`type:` and `_dm/` notes.
- A lint rule or test finds no visibility literal list outside `visibility.ts`.
- Safety scans and `atlas:publish` pass.

## Comments

- 2026-10-28, agent (Opus): Status: done — build complete, review pending. `readNote` and
  `scanContentFolder` live in `src/atlas/content/`; `scripts/atlas/readContentFiles.ts` does the
  file reading; `scripts/atlas/noteIdentity.ts` and gray-matter in the build are gone. Build,
  Staging, merge and the derived scan all read notes through `readNote`. Guard test:
  `src/test/visibility-single-source.test.ts`; parity: `src/test/note-reading-parity.test.ts`.
  `atlas:publish` itself was not run (overnight rule); its parts were.
- Where callers disagreed, the stricter answer won:
  - Staging and merge: an invalid `atlas.visibility` beside `publish: true` was player; now dm
    (the build's answer).
  - Staging: an invalid tag or malformed YAML in a note from `01_Lore`/`02_Regions` took the
    folder's player default; now dm. The folder default still fills in for untagged, readable notes.
  - Derived scan: notes in excluded folders (`_dm/`, `_drafts/` ...) or missed by `include` counted
    only when tagged secret; now always secret, as the build's cross-reference check treats them.
  - Derived scan used `atlas.id ?? slug` (an empty id gave ""); now the build's `||`. Staging's
    `atlas.id: ""` likewise now falls to the sync map or slug.
  - Title: the build title-cased every filename, Staging kept hand-typed names verbatim. One rule
    now: frontmatter title, else the filename as written if it has a space or capital, else
    title-cased. Checked against all 616 vault filenames (same as Staging) and the build's test
    cases. Ids unchanged. The derived scan also guards the title with dashes read as spaces, so it
    is not looser for hand-typed hyphenated names.
  - Type: the build now trims `type`. Untyped notes still differ on purpose (build "note",
    Staging guesses from tags/folder/"lore"): that fallback is caller policy, not safety, and
    aligning it would change DM build output. Left for review.
  - An unreadable file in an excluded folder was skipped by the build; reading now fails loud.
  - Merge's exposure check kept its wider rule (`publish: true` beside dm still asks for review).
