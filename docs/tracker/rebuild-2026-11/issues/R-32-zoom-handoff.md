# R-32 Zoom handoff: ocean > map > child map > back

Status: ready-for-agent
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
