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

- Correction (P-04 review, checked against `node_modules/leaflet` 1.9.4): the first fix assumed the
  fling's `moveend` lands between `zoomstart` and `zoomend`. It doesn't. The zoom's own input stops
  the fling first: `ScrollWheelZoom.js:67` and `TouchZoom.js:59` call `map._stop()`, which ends the
  pan animation and fires its `moveend` synchronously (`Map.js` `_stop`, `PosAnimation` `stop`);
  the zoom's `zoomstart` comes later (in a rAF from `_tryAnimatedZoom`, or on the first
  `touchmove`). So that fix never covered a real fling.
- `ZoomHandoff.tsx` now: user input records its time; a pan's `moveend` within 150 ms
  (`INPUT_STOP_WINDOW_MS`) of input keeps the flag (the wheel waits up to 40 ms before it stops the
  pan; a pinch or double-click stops it at once; a drag or a 250 ms keyboard pan ends later and
  still disarms). The window only skips a disarm, it never re-arms, so an explicit camera
  (`onApply`) or a fit still clears the flag right after a click. A `moveend` while a zoom is in
  flight ends that zoom when no zoom animation runs (calm-mode pinches fire no `zoomend`,
  `TouchZoom.js:124`, `Map.js` `_resetView`), and is ignored while one runs.
- Tests (`canvas-camera.test.tsx`, "a pan's moveend during a zoom (R-40)"): the real order (input,
  `moveend`, `zoomstart`, `zoomend`) hands off for wheel, touchstart and dblclick; a fling that
  stops on its own disarms; a caller's camera right after a click that stopped a fling doesn't
  hand off; a `moveend` during a zoom animation is ignored; a calm-mode pinch hands off at its
  `moveend` and leaves no zoom in flight; a pan after a finished zoom still disarms; a view change
  mid-zoom leaves no stale state. R-32's disarm tests pass (the pan tests now let the drag take
  time).
- Not checkable here: a real touch fling or pinch on a device.
