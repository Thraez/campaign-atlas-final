# Pin layer stops rebuilding on every viewer change

Status: ready-for-human
Area: map

`WrappedWorld` and `PlacementMarkers` (`src/pages/AtlasViewer.tsx` ~1101-1356) aren't memoised
and build a fresh `L.divIcon` per pin on every render (`pinIconForStyle` ~99-122, called ~1322),
so react-leaflet swaps every marker's DOM on pan/zoom (`setViewCenter` ~293), each search
keystroke (~263) and hover peek (~436). The O(n²) label-collision pass reruns each time, three
times on wrapping maps (~841).

## Acceptance criteria

- Map rendering moves out of the page into `src/atlas/map/` (tests already import it from the
  page: `placement-markers.test.tsx:35`, `atlas-viewer-region-ruler.test.tsx:35`).
- Icons are cached by style and state; the world is memoised; label decisions are memoised per
  zoom.
- A test proves a search keystroke or hover does not call `setIcon` on unchanged pins.
- Measured before and after on a world with 300+ pins (record the numbers in Comments).

## Comments

2026-10-27, branch `eval-11-pin-layer-perf` (stacked on `eval-15-shared-drawing`):

- Moved: `WrappedWorld` → `src/atlas/map/WrappedWorld.tsx`; `PlacementMarkers` and the label
  pass → `src/atlas/map/PlacementMarkers.tsx`; the pin icon → `src/atlas/map/pinIcon.ts`. All player-safe
  (no editor imports). Tests that imported them from the page now import the modules.
- Icons: `pinIcon(style, state)` returns the same `L.DivIcon` for the same colour, shape, dim,
  classes (discovery, active) and aria label, so react-leaflet's `updateMarker` skips `setIcon`.
- World: `WrappedWorld` is `memo`; its layers/regions/routes/grid JSX is `useMemo`'d. Each pin
  is a memoised `PinMarker` with memoised position and handlers. The page's `onPinPeek` now
  reads the peek controller through a ref, so it stays the same function when a peek opens
  (before, it changed identity and re-rendered every pin on hover).
- Labels: the enriched, sorted pin list and the label decisions are cached in a `WeakMap` keyed
  by the page's `placements` array, per `zoom|height`, shared by the three wrap copies. The
  collision pass uses `map.project(latlng, zoom)` rounded, which gives the same pixel distances
  as the old `latLngToContainerPoint` (translation only), so decisions are unchanged; the new
  `src/test/map/pinLabels.test.tsx` passes against both the old and new code.
- Test: `src/test/map/pinLayer.test.tsx` renders the real page with a Marker mock that applies
  react-leaflet's `setIcon` rule: a search keystroke and a hover peek call `setIcon` on no pin;
  opening a pin touches only that pin.

Measured with `PIN_BENCH=1 vitest run src/test/map/pinLayer.bench` (opt-in, skipped in CI):
real Leaflet + react-leaflet in jsdom, a seeded 4000x3000 wrapping map with 320 pins over 8
types (960 markers), median of 15 runs per action, before = the page code on
`eval-15-shared-drawing`. Two runs each; the machine was busy, so times vary run to run.

| Action (per event)                       | Before: ms / setIcon / divIcon | After: ms / setIcon / divIcon |
| ---------------------------------------- | ------------------------------ | ----------------------------- |
| Re-render, map unchanged (keystroke/pan) | 94-205 / 960 / 960             | 0.1-0.2 / 0 / 0               |
| Zoom (`zoomend`, includes Leaflet's own) | 116-239 / 960 / 960            | 28-50 / 0 / 0                 |
| Open a pin                               | 93-183 / 960 / 960             | 3.2-3.5 / ~6 / 1              |

Mount is about the same (240-600 ms before, 260-430 after, noisy). "Open a pin" re-icons the
new and the previous active pin in each of the three copies.

What the numbers don't show:

- The ms come from jsdom, which has no layout or paint: treat them as a rough guide. The
  `setIcon` and `divIcon` counts are the reliable figures.
- The keystroke/pan rows re-render a stand-in parent with stable props. That the real page
  keeps them stable is proved by `src/test/map/pinLayer.test.tsx`, not by the bench.
- The zoom median alternates between two zooms whose label decisions are already cached, so it
  leaves out the first collision pass at each new zoom.
- The "before" run needed an uncommitted change: the bench pointed at a temporary copy of the
  eval-15 page, since the bench imports the new module.

The bench asserts when run: 0 `setIcon` per keystroke, pan (a 200 px `panBy` plus a page
re-render; after: ~11 ms, 0 `setIcon`) and zoom, and at most 6 per pin opened.

Not covered, pre-existing (same on the old code): react-leaflet sets a Tooltip's `permanent`
option only when it creates the tooltip, so a label mounted as hover-only stays hover-only
after a zoom that would make it permanent (and the reverse). Noted in `docs/CODEBASE_MAP.md`;
not fixed here because it would change what the map shows.

One visible change: a hovered pin now stays raised (`riseOnHover`) while its peek card is
open. Before, opening the peek re-rendered every pin, `setIcon` rebuilt the hovered pin's DOM,
and it sank back among its neighbours. An improvement, but it is a change.

For Isak: check pan, zoom, search and hover on the player map by eye; pins and labels should
look as before, apart from the hovered pin staying on top while its peek is open.
