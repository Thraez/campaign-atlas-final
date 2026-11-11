# R-37 The ocean fit gets a margin

Status: ready-for-agent
Blocked by: -
Size: S
Branch: `rebuild-r37-ocean-fit-margin`
Model: Sonnet (settled plan)

Found by the R-36 Phase 3 playtest (2026-11-11, `previews/r36/notes.md`, gitignored).

A fix to R-31's fit (`AtlasCanvas` `resolveView`, `oceanFitBox`). On desktop the ocean fit crops Quessaly at
the left edge and runs Skerrow Isles under the aside (1280x800, `main`): the placed maps touch the
edges of the canvas. R-33's notes name it as a follow-up for R-31's fit.

## Acceptance criteria

- The ocean's fit box is the placed maps padded by a margin (a fraction of the box, say 8%, or a
  fixed pixel inset; pick one and note it), so every top-level map shows whole with sea around it.
- The fit accounts for the aside: on desktop the maps must not sit under the open aside.
- The margin applies only to the ocean; a map view still fits edge to edge.
- `OceanZoomLimit` (R-36) keeps its floor one level below the fit zoom: check it still holds
  with the padded box.
- Test: the fit box of `main` and `sandbox` contains every placement with the margin; a view
  test at 1280x800 shows no frame cropped. Real browser check on `atlas:serve:next`.

## Touches

`src/atlas/canvas/AtlasCanvas.tsx`, `src/atlas/canvas/canvasGeometry.ts`, canvas tests.

## Out of scope

Zoom handoff thresholds (R-32): the fit zoom changes, so check no handoff fires on a fit
("a fit never hands off" still holds).
