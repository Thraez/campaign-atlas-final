# Editor draws regions and routes in the player style

Status: ready-for-human
Area: map, editor

Provisional call (grill round 2, Q3), 2026-10-27: Isak hasn't answered yet; built on the
recommended answer.

The player site draws regions and routes inline in `src/pages/AtlasViewer.tsx` (~1138-1215,
fill 0.18, its own tooltips). The editor draws them with `src/atlas/regions/RegionLayer.tsx` and
`src/atlas/routes/RouteLayer.tsx` (fill 0.15, different tooltips). What the DM checks in the
editor isn't exactly what players see.

## Acceptance criteria

- One drawing module for a region and a route (style, fill, tooltip) that both the viewer and the
  editor layers use; the editor only adds its edit handles and draft shapes on top.
- Player style wins where they differ today (fill 0.18).
- Player entry points still import no editor modules (`atlas:check-secrets` stays clean).
- Tests: a region renders with the same path options in the viewer and the editor layer.

## Comments

2026-10-27 (agent): Built. `src/atlas/map/featureShapes.tsx` (`RegionShape`, `RouteShape`) and
`src/atlas/map/featureStyle.ts` (path options, region colour, route tooltip text) now draw regions
and routes for both `WrappedWorld` and the editor's `RegionLayer`/`RouteLayer`. Both live under
`src/atlas/map/` and import only player-safe modules; the viewer imports no editor layer. Player
style won: fill 0.18, stroke 0.85, route opacity 0.9, linked regions take their entity's pin colour,
and the editor now shows the player hover tooltips. The editor keeps its selection weight bump,
click-to-select, handles and draft shapes on top. Viewer visibility filtering is untouched (it
happens in the build). Test: `src/test/map/sharedDrawing.test.tsx` (failed on old code: fill 0.15
vs 0.18, route opacity 0.95 vs 0.9). Needs Isak's look in the editor: regions are a little more
opaque and now show tooltips while editing.
