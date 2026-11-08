# Player build report leaks DM region and route ids

Status: in-review

The player `atlas.json` carried every world.yaml warning in `buildReport.warnings`.
`scripts/build-atlas.ts` copied `worldCfg.warnings` into the build's warning list, and the player
build shipped that list with only secret entity names scrubbed (`scrubSecretNames`). The warnings
from `scripts/atlas/loadWorldConfig.ts` name the region or route they are about: invalid
visibility, fewer than 3 points, duplicate id, a nested item whose `mapId` disagrees with its map,
invalid route mode or waypoint. Region and route ids are slugs of their names, so a DM-only region
such as `drow-crypt-entrance` reached the public site by name even though the region itself was
filtered out. Region and route ids are not entity names, so the scrub never touched them.

## What changed

- In player builds, world.yaml warnings are dropped from `buildReport.warnings` and replaced by one
  line: `N world.yaml warning(s) hidden in the player build; see the DM build`. DM and editor
  builds keep the full text.
- Other warning sources checked: the route waypoint, route-leak and region-leak warnings in
  `build-atlas.ts` run only for routes and regions the player build keeps; fog-redaction and
  placement warnings name map ids, which ship anyway; relationship warnings go through the secret
  scrub. Soundscape warnings come from `loadWorldConfig` and are covered by this change.

## Acceptance criteria

- [x] A DM-only region and route that each trigger a world.yaml warning (too few points, invalid
      visibility, mismatched `mapId`, duplicate id) never appear anywhere in the serialized player
      `atlas.json`; the count line is there. Test: `src/test/player-build-report-leak.test.ts`
      (fails without the fix).
- [x] The DM build still carries every one of those warnings in full (same test file).

## Follow-up

- No scan catches this class of leak today: `check-derived-secrets` and `check-player-secrets`
  derive secret names from notes, not from world.yaml. A scan could load world.yaml, collect the
  ids and names of regions, routes and sound areas that are not player-visible, and fail if any
  appears in the player `atlas.json`. Not built here.
