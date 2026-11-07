# Missing world.yaml visibility loads as dm

Status: ready-for-human
Branch: `rebuild-r02-missing-visibility-dm`

Isak decided on 2026-11-07 (rebuild round-1 questions): a `world.yaml` region, route or sound-only
area with no `visibility` key is `dm`, like a note. PR #110 already made an invalid or empty value
load as `dm`; an absent key still loaded as `player`. Today the content has no regions or routes and
its three sound areas say `visibility: player`, so the live site doesn't change.

## Acceptance criteria

- A region, route or sound-only area with no `visibility` is left out of player builds.
- Every place that assumed absent = player agrees, through one shared helper.
- The editor always writes an explicit `visibility:` when it saves these items, so a region the DM
  marked `player` doesn't drop off the site.
- ADR-0001's addendum and the docs state the new rule.

## What was done

- `worldItemVisibility(v)` in `src/atlas/content/visibility.ts` (re-exported from
  `scripts/atlas/visibility.ts`): a valid value, else `dm`. Used by:
  - `scripts/atlas/loadWorldConfig.ts` `normalizeVis` (regions, routes). A missing key loads as `dm`
    with no warning: it is the default, the editor always writes the key, and world.yaml warnings
    reach the player build report. An invalid value keeps #110's warning.
  - `scripts/atlas/filterSoundscape.ts`: a sound-only area with no visibility drops (it shipped).
  - `src/atlas/content/projectMapForPlayer.ts` (the editor's player lens; it already said `?? "dm"`).
  - `src/atlas/tabs/SoundscapeTab.tsx` visibility menu (it already showed `dm`, while the build
    shipped the area: the two now agree).
  - The writers `regionToYamlObject`, `routeToYamlObject` and `soundscapeToYamlObject`
    (`buildFullWorldYaml.ts`): always write `visibility:`; sound-only areas used to omit it when
    unset. Ride-on areas still write none.
- `scripts/check-artifact-shape.ts`: a sound-only area in the player artifact must carry `player` or
  `rumor` (a missing one passed).
- Editor finding: regions and routes were already always written with their visibility, and new
  regions, routes and sound zones start as `dm`. Only a hand-written sound-only area with no key
  would have been saved back without one; it now gets `visibility: dm`, which is what the tab showed.
- Publish Check, `linkLeaksToPlayers` and `validateProject` read the loaded config, so they follow
  the loader; nothing to change there.
- Docs: ADR-0001 addendum, `docs/VISIBILITY_AND_PLAYER_SAFETY.md`, `GLOSSARY.md`.
- Tests: `src/test/world-yaml-missing-visibility.test.ts` (fixture in, strict player build out,
  the unmarked items and their names absent); loader, soundscape filter, artifact-shape and
  `build-full-world-yaml` tests updated or added.

## Left

- Not gated here: the coordinator runs `npm run gate`.
- Pre-existing, not changed: world.yaml warnings (with region and route ids) are copied into the
  player build's `buildReport.warnings`; secret entity names are scrubbed there, but region and
  route ids are not.
