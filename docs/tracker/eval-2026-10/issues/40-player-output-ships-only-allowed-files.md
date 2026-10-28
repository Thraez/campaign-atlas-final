# The player build ships only allowed files

Status: ready-for-agent
Area: publish (player safety)

Found by the safety review of ticket 34 (2026-10-28), verified by reading. The player build copies
all of `public/atlas/` into `dist/` and prunes only images. Anything else under it ships as it is.
`public/atlas/assets/maps/world.yaml` is tracked (a93f60f), referenced by nothing, and ships to
the player site with its `fog: reveals:` polygons, which the player build otherwise strips. Today
it's a stale copy of the Astrath sample with no DM-visibility rows, so the exposure is low. The gap
is the class: a DM file dropped into `public/atlas/` reaches players, and no scan checks file
types. (Unknown image types are fixed in ticket 34.)

## Acceptance criteria

- A failing test first: a `.yaml` (or `.md`) file placed under `public/atlas/assets/` doesn't
  reach the player `dist/`, or the publish scans refuse it.
- One allowlist of what a player build may contain under `atlas/`: the atlas JSON files,
  referenced images, fog masks, hashed audio and the audio manifest. Anything else is pruned from
  the player build or fails a scan; choose one and say why in the ticket.
- Delete the stale `public/atlas/assets/maps/world.yaml` (git keeps it).
- `atlas:scan` gains the check, so `atlas:publish` covers it.
- Player safety review (third lens) on the branch.
