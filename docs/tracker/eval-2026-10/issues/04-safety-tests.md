# Missing safety tests

Status: ready-for-agent
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
