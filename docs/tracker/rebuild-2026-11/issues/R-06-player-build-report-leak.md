# Player build report leaks DM region and route ids

Status: done

The player `atlas.json` carried every world.yaml warning in `buildReport.warnings`.
`scripts/build-atlas.ts` copied `worldCfg.warnings` into the build's warning list, and the player
build shipped that list with only secret entity names scrubbed (`scrubSecretNames`). The warnings
from `scripts/atlas/loadWorldConfig.ts` name the region or route they are about: invalid
visibility, fewer than 3 points, duplicate id, a nested item whose `mapId` disagrees with its map,
invalid route mode or waypoint. Region and route ids are slugs of their names, so a DM-only region
such as `drow-crypt-entrance` reached the public site by name even though the region itself was
filtered out. Region and route ids are not entity names, so the scrub never touched them.

## What changed

- `build-atlas.ts` keeps a set of warnings hidden from the player build (`hiddenFromPlayer`). The
  shipped `buildReport.warnings` of a player build leaves them out; the console log and the DM
  build keep every warning, so a strict player build that fails still names the route or region.
- World.yaml warnings all go in that set, and the player report gets one line instead:
  `N world.yaml warning(s) hidden in the player build; run npm run atlas:build (DM build) to see
  them`.
- Routes: the spoiler-leak and waypoint-miss warnings were pushed before the player build dropped
  the route (a waypoint miss drops it, and so does a waypoint under fog), so a player-visible route
  that never shipped still put its id and its waypoint entity ids in the report. Those warnings
  now go in the hidden set when the route is dropped. `routeLeaks` and `routeWaypointMisses` still
  count every problem, so strict player builds fail as before.
- Other warning sources checked: region-leak warnings run after the player build's visibility and
  fog filters, so they only name regions that ship; fog-redaction and placement warnings name map
  ids, which ship anyway; relationship warnings go through the secret scrub. Soundscape warnings
  come from `loadWorldConfig` and are covered by the world.yaml rule.

## Acceptance criteria

- [x] A DM-only region and route that each trigger a world.yaml warning (too few points, invalid
      visibility, mismatched `mapId`, duplicate id) never appear anywhere in the serialized player
      `atlas.json`; the count line is there. Test: `src/test/player-build-report-leak.test.ts`
      (fails without the fix).
- [x] The DM build still carries every one of those warnings in full (same test file).
- [x] A player-visible route dropped from the player build after it warned (a waypoint placement
      under fog, a waypoint on a DM entity) has neither its id nor the DM entity's id anywhere in
      the player `atlas.json`; the DM build keeps the warning (same test file, fails without the
      fix).
- [x] Strict player builds still fail with exit 7 and name the leaking route on the console
      (`src/test/atlas-region-route-strict.test.ts`).

## Follow-up

- No scan catches this class of leak today: `check-derived-secrets` and `check-player-secrets`
  derive secret names from notes, not from world.yaml. A scan could load world.yaml, collect the
  ids and names of regions, routes and sound areas that are not player-visible, and fail if any
  appears in the player `atlas.json`. Not built here.
