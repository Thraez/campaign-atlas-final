# Deleted pins on other maps count as unsaved and save with the rest

Status: in-review
Area: editor (pins, save)

Found in the review of eval-30 (2026-11-07).

A pin deleted on a map is a `null` override keyed `${mapId}:${entityId}`. `foreignMapDraftPlacements`
(`src/atlas/editor/foreignMapDrafts.ts`) collects other maps' overrides for the save batch and the
dirty count, but skips `null` ones. So:

- **Bug, verified by reading:** a pin deleted on map B, followed by a switch to map A, is neither
  counted as unsaved nor written by a save from A. It is kept in localStorage, not lost, and is
  written only once the DM goes back to B and saves there.

After eval-30 every other kind of draft saves from any map, so this one stands out: the status chip
can read "All changes saved" while a deletion is still pending.

## Acceptance criteria

- A failing test first, through `foreignMapDraftPlacements` and the save plan
  (`planUnifiedSave`), for a deleted pin on a non-active map.
- A deleted pin on any map counts in the one unsaved signal and is written by the next save.
- After that save, `overridesAfterSave` clears its key like any other written foreign override.
- The editor is checked by eye in the preview: delete a pin on map B, switch to A, save, reload;
  the pin is gone from B (ready-for-human).

## Comments

2026-11-07 (improvement loop): wider than filed. A deleted pin was not saved on the **active** map
either: a `null` override has no effective placement, so `buildDraftPlacements` dropped it, and
`mergePlacementsIntoFrontmatter` had no way to express a removal. The chip counted it while Save
said "No changes to save", and the tombstone sat in localStorage for good.

Fix: `PlacementRemoval` (`canonicalPlacementSave.ts`) drops that map's placement and keeps the
others. `buildSavePlan` returns the active map's removals; `foreignMapDraftPlacements` returns other
maps' removals, so both count and both save. `removeCoord` on a pin that is only a draft (nothing in
canon) drops the draft instead of leaving a tombstone nothing could ever save. Tests:
`src/test/save/deleted-pins-save.test.ts`, `foreign-map-drafts.test.ts`,
`use-pin-override-mutations.test.ts`.

Review round 1 (Opus): two should-fix items, both fixed. (1) Tombstones that older builds wrote for
draft-only pins would now be saved: on a legacy `atlas.x/y` entity that dropped its primary-map
pin, on a removed entity every Save threw. `dropStaleTombstones` (`placementOverrides.ts`) clears
them on load, and `planUnifiedSave` leaves any removal without a canon placement out of the batch.
(2) `mergePlacementsIntoFrontmatter` now turns legacy `atlas.x/y` into a placement on the primary
map before dropping the keys, as the build reads it.
