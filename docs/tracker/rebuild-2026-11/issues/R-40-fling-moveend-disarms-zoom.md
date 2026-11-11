# R-40 A fling's moveend must not disarm a zoom in flight

Status: ready-for-agent
Blocked by: -
Size: S
Branch: `rebuild-r40-fling-moveend`
Model: Sonnet (settled plan)

Found by the R-36 Phase 3 playtest (2026-11-11, `previews/r36/notes.md`, gitignored).

Follow-up from R-32's review, no ticket until now. `ZoomHandoff.tsx` `onMoveEnd` clears the "user input
armed" flag on any `moveend`. A pan that ends (a fling's inertia) while a zoom is in flight can
fire its `moveend` before that zoom's `zoomend`, so the zoom no longer hands off.

## Acceptance criteria

- A test on the fake map (`canvas-camera.test.tsx`): input arms, a `moveend` from a pan fires
  between `zoomstart` and `zoomend`, and the zoom still hands off.
- The disarm rules R-32 added still hold: a click that moves nothing, a new view, a new fit
  request and an explicit camera still clear the flag.
- Likely fix: ignore `moveend` while a zoom is in flight (set at `zoomstart`, cleared at `zoomend`).
- Real-device pinch or touch fling is not checkable here; say so.

## Touches

`src/atlas/canvas/ZoomHandoff.tsx`, `src/test/canvas/canvas-camera.test.tsx`.
