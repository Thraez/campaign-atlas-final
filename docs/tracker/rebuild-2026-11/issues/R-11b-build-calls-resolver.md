# R-11b Build calls the resolver

Status: ready-for-agent
Blocked by: R-11a
Size: S
Branch: `rebuild-r11b-build-resolver`
Folds in: `docs/tracker/arch-2026-11/issues/02-sound-areas-in-fog.md`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

The player build in `scripts/build-atlas.ts` decides what ships with its own filters. Move it onto
the resolver (R-11a) for campaign `main`, so the build and the resolver can't disagree. Today's
content is v1, so this needs a thin v1 adapter. Also fixes arch-02: sound-only areas inside fog
ship to players today, and the fog scan doesn't look at sound areas.

## Acceptance criteria

- A thin adapter turns the v1 `WorldConfig` (`scripts/atlas/loadWorldConfig.ts`) into the
  resolver's input: one world, one campaign `main`, every map `open`, or `fogged` when its v1 fog is
  enabled; v1 scalar visibilities apply to `main`; no note overrides; notes use the `vault` note
  default. Keep it small and in one file: R-12's v1 path must reuse or replace it, not copy it.
- The player build asks the resolver for: entities (instead of `isSecret` alone), regions
  (`build-atlas.ts` ~806-816), placements under fog (~849), routes and their waypoints (~932),
  the soundscape (`filterSoundscapeForPlayer` at ~988, `scripts/atlas/filterSoundscape.ts`). Leak
  warnings (`linkLeaksToPlayers`) stay, fed with the resolver's verdicts.
- arch-02: a sound-only area with any point under fog is dropped from the player build (through
  the resolver). The fog scan (`scripts/check-fog-safety.ts`) checks the shipped soundscape
  against the source fog and fails with a new exit code (documented in its header) when a
  sound-only area has a point under fog. Add a clean/dirty variant for it to
  `scripts/atlas/publish-integrity-smoke.ts`.
- Today's site is unchanged: a test builds the player and DM atlases of `content/` before and after
  (or against a committed snapshot) and finds `atlas.json` and `search-index.json` identical apart
  from `version` and `publishedAt`.
- Fixture tests: a sound-only area inside fog is absent from the strict player `atlas.json`; a
  region and a route in fog are still absent; a ride-on sound area of a DM region is still absent.
- `npm run gate` passes.

## Touches

- `scripts/build-atlas.ts`, `scripts/atlas/filterSoundscape.ts`, `scripts/check-fog-safety.ts`,
  `scripts/atlas/publish-integrity-smoke.ts`, a new adapter module (suggested
  `scripts/atlas/v1Model.ts`), tests under `src/test/` and `scripts/atlas/`.

## Out of scope

- The v2 loader and several worlds (R-12, R-13). Per-campaign outputs (R-17).
- The old Publish Check (R-11c). The editor's player lens (`projectMapForPlayer.ts`): it is replaced
  by the new editor's preview.
- Splitting `build-atlas.ts` into stages (R-13).
