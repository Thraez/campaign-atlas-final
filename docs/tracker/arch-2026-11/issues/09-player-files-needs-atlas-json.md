# check-player-files fails a built site with no atlas.json

Status: ready-for-agent
Blocked by: 01
Area: player safety, publish scans
Payoff: low-med · Size: S

Found reviewing 01. `check-player-files` fails only when `dist/atlas/` is missing; a `dist/atlas/`
with no `atlas.json` passes. After 01 the fog and player-secrets scans fail that case (they get the
built-site layout from `scanRegistry`), so this is the last scan that would pass it.

## Acceptance criteria

- `check-player-files` on a built site fails when `atlas/atlas.json` is missing, using 01's
  `locatePlayerAtlas(dir, "built-site")`.
- A test for the missing-file case.
