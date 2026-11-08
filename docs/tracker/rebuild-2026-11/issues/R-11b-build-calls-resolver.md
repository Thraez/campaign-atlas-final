# R-11b Build calls the resolver

Status: done
Blocked by: R-11a, R-12
Size: S
Branch: `rebuild-r11b-build-resolver`
Folds in: `docs/tracker/arch-2026-11/issues/02-sound-areas-in-fog.md`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

The player build in `scripts/build-atlas.ts` decides what ships with its own filters. Move it onto
the resolver (R-11a) for campaign `main`, so the build and the resolver can't disagree. Today's
content is v1, so it goes through R-12's v1 adapter (`src/atlas/content/v1Model.ts`). Also fixes arch-02: sound-only areas inside fog
ship to players today, and the fog scan doesn't look at sound areas.

## Acceptance criteria

- The build gets the resolver's input from R-12's v1 adapter; it writes no v1 rule of its own.
- A name collision the resolver reports (ADR-0004 rule 8) fails the strict player build, naming
  both items; a fixture test covers it.
- The build fails on any `orphanEntries` the resolver reports (a `notes:` key matching no note of
  its world), naming the world and key; a fixture test covers it.
- The resolver's input (`CampaignResolverModel`, `WorldNote` in `resolveCampaign.ts`) is typed on
  R-12's canonical model (`src/atlas/content/atlasModel.ts`: `WorldModel`, `MapModel`, `ModelNote`),
  so `loadAtlasModel`'s result passes straight in; a type-level test pins it. R-11a and R-12 were
  built side by side and their types differ today (`schemaVersion`, optional `scale`).
- The player build asks the resolver for: entities (instead of `isSecret` alone), regions
  (`build-atlas.ts` ~806-816), placements under fog (~849), routes and their waypoints (~932),
  the soundscape (`filterSoundscapeForPlayer` at ~988, `scripts/atlas/filterSoundscape.ts`). Leak
  warnings (`linkLeaksToPlayers`) stay, fed with the resolver's verdicts.
- arch-02: a sound-only area with any part under fog is dropped from the player build (through
  the resolver). The fog scan (`scripts/check-fog-safety.ts`) checks the shipped soundscape
  against the source fog and fails with a new exit code (documented in its header) when a
  sound-only area has a point under fog. Add a clean/dirty variant for it to
  `scripts/atlas/publish-integrity-smoke.ts`.
- Once the build drops it, update R-11c's Publish Check to match: the `sound-area-fogged` issue in
  `src/atlas/yaml/validateProject.ts` (today a warning saying the area still ships) gets its
  wording and severity changed, and the `it.todo` in `src/test/publish-check-build-parity.test.ts`
  becomes a test that the strict player atlas has no such area.
- Today's site is unchanged: a test builds the player and DM atlases of `content/` before and after
  (or against a committed snapshot) and finds `atlas.json` and `search-index.json` identical apart
  from `version` and `publishedAt`. The same test asserts the resolver reports no rule-8 name
  collision for `content/` (campaign `main`), so the new failure can't block today's publish.
- Fixture tests: a sound-only area inside fog is absent from the strict player `atlas.json`; a
  region and a route in fog are still absent; a ride-on sound area of a DM region is still absent.
- `npm run gate` passes.

## Touches

- `scripts/build-atlas.ts`, `scripts/atlas/filterSoundscape.ts`, `scripts/check-fog-safety.ts`,
  `scripts/atlas/publish-integrity-smoke.ts`, tests under `src/test/` and `scripts/atlas/`.

## Out of scope

- The v2 loader and several worlds (R-12, R-13). Per-campaign outputs (R-17).
- The old Publish Check (R-11c). The editor's player lens (`projectMapForPlayer.ts`): it is replaced
  by the new editor's preview.
- Splitting `build-atlas.ts` into stages (R-13).

## Follow-ups

- Route fog checks test the centre line only (stroke width can reach fog); check 21 walks only maps that ship a fog object.
