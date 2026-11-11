# R-32 Zoom handoff: ocean > map > child map > back

Status: in-review
Blocked by: R-30, R-31
Size: M
Branch: `rebuild-r32-zoom-handoff`
Model: Opus (design call: thresholds and hysteresis; a build output field)
Needs: the adversarial player-safety review (light): it adds a field to the player output

ux-flows.md p2: zooming in over a continent past its "enter at zoom" hands over to that map with no
page load; zooming out past a map's minimum returns to the parent at the same spot; a click on a
map or frame also enters it. Build the rule as a pure function, then wire it into `AtlasCanvas`.

## Acceptance criteria

- **The build emits each v2 map's authored zoom range.** `zoom: { min, max }` is required in v2
  `world.yaml` (`src/atlas/content/schemaV2.ts`) and ADR-0003 says each map keeps its own zoom
  range, but `scripts/atlas/build/worldSources.ts` (~205-221) drops it. Emit it as
  `MapDocument.zoom` in v2 output (additive; v1 output unchanged; `atlasGuard` checks it, R-30's
  pattern). Provisional call: ADR-0003's "Output shape" lists the added fields, so the ADR needs a
  one-line addendum for Isak to accept (State.md, "For Isak").
- A pure `nextView(tree, view, camera, viewport)` in `src/atlas/ocean/` returns either "stay" or
  the new view and its camera, showing the same ground (R-30's transforms and zoom offsets):
  - **Enter a child map** when the zoom reaches the child's `enterZoom` and the viewport centre is
    inside its frame (frame outline, rotated). With no `enterZoom`, enter when the child's frame
    would fill the viewport's shorter side.
  - **Enter a top-level map from the ocean** under the same "fills the shorter side" rule (the ocean
    has no `enterZoom`).
  - **Leave a map** (to its parent, or to the ocean for a top-level map) when the user zooms out
    below the map's `zoom.min`, or below its fitted zoom when it has none.
  - **Hysteresis:** entering and leaving can't flip back and forth on one wheel step or a pinch at
    the threshold: after a handoff the camera lands strictly inside the new view's range (a test
    drives zoom up and down across each threshold and counts handoffs). If an authored
    `enterZoom` and the child's `zoom.min` make that impossible, the build warns and the viewer
    clamps; say which in the PR.
  - v1 trees (no ocean) never leave the top-level map, so today's site behaves as today.
- `AtlasCanvas` calls it on zoom end (and on pinch end), swaps the view without remounting the page
  or refetching `atlas.json`, and reports the new view through a callback so R-33 can update the
  breadcrumb and URL. A click enter (R-31's `onEnterMap`) lands fitted on the child.
- Tests on the test-world tree for `main` and `sandbox`: ocean > `quessaly-world` > `oskmark` >
  `brindlecross` (main only) by zoom, and back out to the ocean at the same spot (the ocean point
  under the centre moves less than one screen pixel at the landing zoom). Rotated fixtures too.
- Real-Leaflet check in R-31's dev harness (`/__canvas?c=<id>`) that mounts the canvas
  on a campaign's store: the ocean and a map render, including one rotated
  fixture case, and the handoff feels like one continuous zoom (screenshots before and after one
  handoff in the PR). List "zoom feel" for Isak's look in State.md.
- `npm run gate` passes, and `atlas:publish:next` scans pass on both campaigns.

## Provisional calls (noted in State.md)

- Emitting `zoom` per map (above).
- The "fills the shorter side" rule for maps with no `enterZoom` and for the ocean.

## Touches

`scripts/atlas/build/worldSources.ts`, `src/atlas/content/schema.ts`, `atlasGuard.ts`,
`src/atlas/ocean/` (the rule), `src/atlas/canvas/`.

## Out of scope

The breadcrumb, URL and deep links (R-33), Show on map across maps (phase 5).

## Build notes (2026-11-11)

**Output.** `scripts/atlas/build/worldSources.ts` emits `zoom: { min, max }` per v2 map
(`MapDocument.zoom`). `atlasGuard` drops a malformed one (not a record, a non-finite bound, or
`min > max`) and keeps the map. `compareOutputs` allows it as a v2-only addition. The v1 player
build of `content/` is unchanged: `atlas.json` and `search-index.json` match a build from before
the change, ignoring `version` and `publishedAt`, and so do the assets. ADR-0003 has a one-line
addendum, marked provisional.

**The rule** (`src/atlas/ocean/zoomHandoff.ts`, pure). M = `HANDOFF_MARGIN` = 0.5 zoom levels.
- Enter a child when zoom >= its enter zoom and the centre is inside its frame (rotated outline).
  The enter zoom is `enterZoom`, or with none, the fill rule: log2(min(viewport w, h) / min(frame
  w, h)). Enter a top-level map from the ocean by the fill rule on its placed size.
- **Clamp on entering (viewer):** a child's enter zoom is at least M above where a zoom entry lands
  on its parent. The fill landing depends on the screen: on a 1280x800 canvas a fill entry lands on
  `quessaly-world` at exactly 1, oskmark's authored `enterZoom`, and without the clamp one wheel
  step went from the ocean straight to oskmark, skipping the continent.
- Leave (to the parent, or to the ocean from a top-level map) when zoom < leave zoom =
  min(`zoom.min` ?? fitted zoom, fitted zoom - M, enter landing - M).
- **Clamp on leaving (viewer):** the last two terms. A click enter lands fitted and a zoom enter
  lands at the enter landing; both then sit at least M above the way back out. A zoom leave lands
  more than M below the child's enter zoom. So nothing flips back until the user zooms M the other
  way.
- **Build warning:** when an authored `enterZoom` lands below the child's own `zoom.min`, the loader
  warns (`src/atlas/content/v2Model.ts`), and the viewer lowers the leave zoom as above.
  - The test world had three of these, so their `zoom.min` went from 0 to -1: `mirefold`,
    `mirefold-cellars` and `hookhaven`.
  - In the fixture, `millbrook-cellar` went from 0 to -2.
- A v1 tree (no ocean) never leaves its top-level map.
- One big gesture can cross several thresholds: the steps chain (at most 32), and every result is
  one `nextView` leaves alone.
- An unknown view, a non-finite camera or an empty viewport stays.

**Canvas.**
- `ZoomHandoff` (in `AtlasCanvas`) runs `nextView` on `zoomend`, which covers wheel, pinch end,
  double-click, keyboard and the zoom buttons, but only after a user input event on the map
  (wheel, touchstart, dblclick, keydown, mousedown, pointerdown; `moveend` clears it). A fit or an
  explicit camera never hands off: sandbox's ocean fits to its one map at almost the fill zoom.
- On a handoff it calls `onViewChange(view, camera)`. The caller renders the new view and camera,
  and `CanvasCamera` applies it with no animation: no remount, no refetch.
- `AtlasCanvas` drops the camera report from the old view's `moveend`, which Leaflet fires right
  after `zoomend` in the same dispatch. Without that, the harness kept the ocean camera on the new
  map, and the screen showed open sea. Found in the real-Leaflet check; there is a test for it.
- `zoomSnap={0}`, so the zoom lands exactly where the handoff puts it.
- `zoomAnimation={!reduceMotion}`.
- Without `onViewChange`, the canvas never hands off.

**Tests.**
- `src/test/ocean/zoomHandoff.test.ts` (synthetic tree) covers:
  - entering, the fill rule for a child and from the ocean, the enter clamp, and chaining
  - leaving to the parent and to the ocean, fit - M with no range, and both leave clamps
  - v1, and hysteresis (wiggle +-0.25 at every threshold, handoffs counted)
  - a rotated frame and a rotated placement
  - an unknown or dropped map, and bad input
- `src/test/ocean/mapTree-build.test.ts` builds content-next and zooms in quarter steps:
  - main: ocean > quessaly-world > oskmark > brindlecross and back
  - sandbox: up to oskmark and back
  - the rotated fixture on main
  - each at 1280x800 and 390x844, with a wiggle at every handoff
  - back on the ocean, the centre is off by less than 1 screen px
- `src/test/canvas/canvas-camera.test.tsx`: the wiring.

**Real-Leaflet check** (`/__canvas`, canvas 1024x728), screenshots in `previews/r32/`
(gitignored):
- main: ocean > Quessaly at ocean zoom -0.15 > +0.05, then Quessaly > Oskmark. The centre point
  (414, 132) on Quessaly became (380, 173) on Oskmark, which is what the frame math gives.
- sandbox: ocean > Quessaly, then back out to the ocean at the same spot. Quessaly (298, 205) at
  -1.97 became ocean (797, 708) at -3.17; the math gives (796, 710).
- rotated main: ocean > Quessaly.

**Known limits** (for "zoom feel", State.md):
- At a handoff, a rotated placement or frame turns square, because the child view is unrotated.
- The map's art switches from the parent's picture to the child's.
- The global `maxZoom` of 4 could put a deep child's enter zoom out of reach.
- Overlapping sibling frames: the first in the list wins.
- A wheel at max zoom that fires no `zoomend` leaves the input flag set until the next `moveend`.
