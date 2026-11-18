# R-37 The ocean fit gets a margin

Status: done
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

## Built

Polish item P-02, branch `polish-p02-ocean-fit-margin`.

- **Margin rule:** a fraction, not pixels: `OCEAN_FIT_MARGIN = 0.08` of the placed maps' box width and
  height on every side (`canvasGeometry.ts`: `padBox`, `oceanPlacedBox`; `oceanFitBox` is now the
  padded box). `resolveView` already used `oceanFitBox`, so the fit, `FitMapOnOpen` and
  `OceanZoomLimit` all read the same padded box. A map view's box is untouched (edge to edge).
- **The aside:** no prop added. In the viewer the aside is a flex sibling of `<main>`, which holds
  the canvas, so the canvas is already only as wide as the space left (880 px of 1280). The
  "under the aside" look was the right-hand map touching the canvas's right edge; the margin fixes
  it. If a caller ever overlays the canvas, a padding prop is the follow-up.
- **Zoom floor:** unchanged rule, one level below the (padded) fit. `main` at 1280x800: fit
  -1.5 -> -1.7, floor -2.5 -> -2.7. A fit never hands off: `nextView` doesn't read the ocean fit,
  and the fit zoom only dropped.
- **Tests:** `atlas-canvas.test.tsx` gets "ocean fit margin (R-37)" (fit box holds every placement with
  the margin for `main` and `sandbox`; 1280x800 view with the aside excluded shows every frame
  corner at least 24 px inside the canvas; floor = fit - 1 and a map view fits edge to edge; a fit
  never hands off at three viewport sizes). `canvas-camera.test.tsx`'s R-36 floor constant now
  includes the margin.
- **Real browser** (`atlas:serve:next`, `main`): 1280x800 fit cz -1.7, maps clear of all edges; wheel
  zoom out stops at -2.7; wheel zoom in over Quessaly hands off to `quessaly-world`; 375x812 fit
  cz -3.0, both maps whole. Shots in `docs/polish-2026-11/shots/p02-{before,after}-{desktop,phone}.jpg`.
- **Provisional:** 8% is a taste call; the zoom control and reset button sit inside the margin on
  desktop but the phone's top-left control and the legend still float over sea only.
- **Not checked:** `sandbox` in a browser (covered by tests only); the full gate and review (run
  afterwards); the serve ran on ports 4330-4332 because 4321 was held by another worktree's server.

## Review fixes (2026-11-18)

- The Opus review found the canvas kept its first measured width: with the side panel collapsed on
  load and then opened, Leaflet drew, fitted and limited zoom for the old width, so the right-hand
  map sat clipped. `KeepCanvasSized` (`src/atlas/map/keepMapSized.ts`) now re-measures the canvas
  whenever its container changes size; `OceanZoomLimit` already recomputes on Leaflet's `resize`.
- The margin test now also asserts `OCEAN_FIT_MARGIN > 0`.
- Accepted as provisional: the margin is a fraction of the box, so a box whose shape matches the
  canvas leaves about 50 px, less than the Wander block's height in the bottom-left corner.
