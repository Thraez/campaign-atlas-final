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

## Built (branch `eval-40-player-files-allowlist`, local)

- Both, on purpose: the prune removes anything off the allowlist (fail-safe, like the image prune),
  and the `check-player-files` scan (exit 18) fails closed on `dist/atlas`. The scan catches a
  build that skipped the plugin (an editor-mode or misconfigured build).
- Whether an image is referenced stays with the image prune; the allowlist checks file kind and
  place only.
- Calls from the safety review (provisional, `State.md`):
  - The audio manifest is off the allowlist. Only the editor reads it, and it lists the DM's source
    bed names. (This changes the criterion above.)
  - Hashed audio ships only when `atlas.json` references it, whatever its extension (a `.opus` bed
    was pruned).
  - Images may sit anywhere under `atlas/`, not only `assets/` (a map layer `src` outside
    `assets/` vanished). The image prune covers the same area.
  - `.gitkeep` only when empty; no images under `assets/audio/`.
- Second safety review (6d1036d): no new leak, nothing the player needs lost. Fixed after it
  (7dc1368): image refs read only `atlas.json` and `search-index.json`, not
  `.last-published.json` (the previous publish kept an image the DM had hidden since).
- Left, low and older than this ticket: a protocol-relative link (`//host/atlas/assets/x.png`)
  counts as a reference to the local `assets/x.png`; an 8-hex-named file of any type in
  `assets/audio/` passes when a bed names it (only the build's hashing makes such names).
