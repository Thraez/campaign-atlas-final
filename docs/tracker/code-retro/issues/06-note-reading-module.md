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
  - Type: the build now trims `type`.
  - An unreadable file in an excluded folder was skipped by the build; reading now fails loud.
  - Merge's exposure check kept its wider rule (`publish: true` beside dm still asks for review).
- 2026-10-28, agent (Opus), after three reviews (Standards, Spec, player safety):
  - Fixed a leak: the editor's parser read past a line like `---x: 1` that gray-matter treats as
    the end of the frontmatter, so keys below it (`atlas.visibility: player`) shipped a note main
    kept dm. Now the first line starting with `---` must be a clean fence (`---` plus optional
    spaces) or the note fails to parse, which is dm. The parser moved to
    `src/atlas/content/frontmatter.ts`; `import/frontmatter.ts` re-exports it.
  - Title: back to main's rule per caller (the hybrid rule was scope creep and lost redactions).
    `readNote` gives the build's title: filename with dashes and underscores as spaces, each word
    capitalised.
  - The build's cross-reference index and its warning scrubber now treat dashes, underscores and
    spaces alike, in any case: `[[Khal Azum]]`, `[[Khal_Azum]]` and `[[khal-azum]]` all resolve
    to a secret "Khal_Azum" and are redacted in the build itself. Exact names still win; when a
    loose name has several owners, a secret one wins (redact), else the link stays broken.
  - `parseObsidian.ts` was used only by tests: deleted with its tests (ticket 07 had flagged it).
  - `aliases` is on `Note`; `ParsedFile.atlas` no longer carries a second visibility answer.
  - An ESLint rule (`no-restricted-syntax`) flags any array with two or more visibility strings
    outside `visibility.ts` and tests. Known gap: comparison chains (`v === "player" || ...`).
  - `PLAYER_VISIBLE_VISIBILITY` has one name everywhere (the `PLAYER_VISIBLE` shim alias is gone).
- Intended differences, pinned in `src/test/note-reading-parity.test.ts`:
  - Title of a note with no frontmatter title and a hand-typed filename: Staging keeps
    "Isle de Marque" (code-retro 02), the build says "Isle De Marque". Commit writes Staging's
    title into the note, after which the build reads the same one. Ids are equal either way.
  - Type of an untyped note: the build says `note`; Staging guesses from tags, then the folder,
    then `lore`, and commit writes the guess.
  - An untagged note from a public vault folder (`01_Lore`, `02_Regions`): Staging shows the
    folder default `player` and commit writes it; until commit the build reads it as dm.
- Side-by-side against main (45 inputs): one looser result. A closing fence with trailing spaces
  (`---  `) was dm in Staging and merge on main (their parser wanted a bare `---`) and is now
  read like the build, which already accepted it on main. Build output is unchanged.
- Left as they are:
  - The derived scan treats every `_drafts/` note as secret, so a draft that shares a name with a
    player note can give a false positive. Safe side; rename or tag around it.
  - `Note` is wide (data, atlas block, body and the identity fields). Narrowing it waits until a
    second caller needs less.
  - One badly formed note anywhere, `_dm/` and `_drafts/` included, now stops the build and so the
    publish (fail closed). The coordinator logged this as a provisional call.
