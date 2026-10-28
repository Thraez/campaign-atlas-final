# Editor draws regions and routes in the player style

Status: ready-for-agent
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
