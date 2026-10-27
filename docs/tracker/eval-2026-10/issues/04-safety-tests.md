# Missing safety tests

Status: done
Area: publish safety

Gaps found against `docs/GOALS.md` and `docs/VISIBILITY_AND_PLAYER_SAFETY.md`.

## Acceptance criteria

- A note from a vault `10_DmNotesAndSecrets` folder, run through the real Sync path, never
  reaches `content/`, `atlas.json`, the search index or the shipped assets.
- A strict build with an invalid visibility exits 3; a non-strict build coerces it to `dm`.
- Folders `archive` and `deprecated` are excluded from the build (test each).
- Sync leaves out `00_SessionNotes`, `11_DmToolBox`, templates and inbox.
- A new note from `04_Factions` arrives as `dm`.
- A test reads `.github/workflows/publish-atlas.yml` and checks the deploy waits on the scans.
- `docs/VISIBILITY_AND_PLAYER_SAFETY.md` names test files that exist (today it names
  `cross-reference-leak.test.ts` and `unbalanced-dm-block.test.ts`, which don't).

## Comments

2026-10-27, branch `eval-04-safety-tests`:
- `10_DmNotesAndSecrets` through the real Sync seams (scan → Staging → `buildImportChanges` →
  strict player build): `src/test/sync-safety.test.ts`, "never scans, stages or writes a
  10_DmNotesAndSecrets note" (folders picked) and "a 10_DmNotesAndSecrets note that does get
  written arrives as dm and never reaches the player build" (checks `atlas.json`,
  `search-index.json` and every emitted file).
- Invalid visibility: `src/test/atlas-build.test.ts`, "strict player build FAILS on invalid
  visibility" now asserts exit 3; new "non-strict build coerces an invalid visibility to dm".
- `archive` / `deprecated`: `src/test/atlas-build.test.ts`, "the real atlas.config.json keeps a
  %s/ folder out of the build" (one case each, reading the real `atlas.config.json`).
- Sync leaves out `00_SessionNotes`, `11_DmToolBox`, `99_Templates`, `90_Inbox`, `Z_Archive`:
  `src/test/sync-safety.test.ts`, "leaves out %s" (folders picked) and "leaves out %s through
  the built-in ignore list" (templates, inbox, archive with nothing picked).
- `04_Factions` arrives as `dm`: already covered by `src/test/build-import-changes.test.ts`,
  "an untagged new note from 04_Factions/Red Hand.md arrives as dm". Not duplicated.
- Workflow: `src/test/safety-ci-and-docs.test.ts`, "the deploy waits on the safety scans, and a
  failed scan stops it" (scan before upload in the same job, no soft-fail, deploy `needs` it).
- Doc: lines naming the two missing files now point at `safety-fortress.test.ts` ("strict player
  build fails with exit 8 on cross-reference leak", "unbalanced %% delimiter fails the build with
  exit 1"); `src/test/safety-ci-and-docs.test.ts`, "names only test files that exist under src/
  or scripts/".

Bug found, not fixed (product code untouched): with no folders ticked in the Sync panel (the
default), the scan reads the whole vault. `10_DmNotesAndSecrets`, `00_SessionNotes` and
`11_DmToolBox` are not in `IGNORED_FOLDERS` (`src/atlas/import/inferType.ts`), so their notes
are staged and written under `content/` (as `dm`, so the player build still drops them). Pinned
as `it.fails` in `src/test/sync-safety.test.ts` ("leaves out %s" under "no folders picked");
flip to `it` once fixed. The same default lets an embed copy an image from a DM folder
(`resolveVaultImage` accepts any folder when none are picked).
