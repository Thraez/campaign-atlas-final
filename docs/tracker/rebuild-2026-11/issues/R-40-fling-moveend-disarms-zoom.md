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

## Built

Built in polish item P-04 (2026-11-18, branch `polish-p04-handoff-always-fires`; details in
`docs/polish-2026-11/items/P-04-handoff-always-fires.md`).

- `ZoomHandoff.tsx`: the zoom in flight is remembered from `zoomstart` to `zoomend`; `onMoveEnd`
  returns early while one is in flight, so a pan's `moveend` there no longer disarms it. Outside a
  zoom a pan's `moveend` still disarms. A view change re-runs the effect, so a `zoomstart` that
  never got its `zoomend` leaves nothing behind.
- Tests (`canvas-camera.test.tsx`, "a pan's moveend during a zoom (R-40)"): the acceptance test
  (input, `zoomstart`, a pan's `moveend`, `zoomend`: hands off); a pan after a finished zoom still
  disarms; a view change mid-zoom leaves no stale state. R-32's disarm tests (click or key that
  moved nothing, re-fit, explicit camera, pan) pass unchanged.
- Not checkable here: a real touch fling or pinch on a device.
