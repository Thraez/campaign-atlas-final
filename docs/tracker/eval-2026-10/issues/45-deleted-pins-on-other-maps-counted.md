# Deleted pins on other maps count as unsaved and save with the rest

Status: ready-for-agent
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
