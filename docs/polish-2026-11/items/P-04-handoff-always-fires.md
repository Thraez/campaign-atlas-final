# P-04 The zoom handoff always fires

Branch `polish-p04-handoff-always-fires` (stacked on R-37). 2026-11-18.

## What

Two defects in the v2 canvas's zoom handoff (R-32), both in `src/atlas/canvas/ZoomHandoff.tsx`:

- **A (R-40).** A fling's `moveend` cleared the "user input armed" flag, so the zoom that stopped
  the fling never handed off. (The first fix assumed that `moveend` lands between `zoomstart` and
  `zoomend`; the review showed Leaflet fires it before `zoomstart`. See "Review fixes".)
- **B (dead end).** On Oskmark, wheel-zooming at the Brindlecross frame with the cursor near the
  frame's edge slid the frame toward the corner, the zoom stopped at the canvas's max zoom and
  never entered Brindlecross. Only a click on the frame got in.

## Cause of B

Reproduced on the untouched baseline (`127.0.0.1:4301`, canvas about 490x540): on Oskmark with the
cursor on Brindlecross's bottom-right corner, the wheel zoom reached 4.0 (the canvas's Leaflet
`maxZoom`) with the view centre at (182, 131), just outside the frame (80..180 x 60..135), and
stopped there. Shot: `shots/p04-before-dead-end.jpg`.

- Not the threshold: `nextView` already lowers every enter zoom to the canvas's max zoom, and
  Brindlecross's is 2 (clamped from its authored 2; max 4). So shape (1) holds by construction.
- The cause is the point tested. `nextView` enters a child when the zoom is past its enter zoom
  **and the view centre** is inside its frame. Leaflet's wheel and double-click zoom about the
  cursor (a pinch about its centre), so the ground under the cursor stays put and everything else
  moves away from it. With the cursor near the frame's bottom-right edge and the centre below-right
  of it, the frame grows up-left and never covers the centre at any zoom. At max zoom the wheel
  fires no further `zoomend`, so nothing is left to try. (The playtest's "about 2.3" was not seen
  here; the stop was at 4.0 on this screen.)

## The rule chosen: shape (3), the zoom's anchor, with the centre as fallback

On `zoomend`, `ZoomHandoff` works out the zoom's anchor: the view point that sat at the same screen
point before and after the zoom (`zoomAnchor`, from the centre and zoom at `zoomstart` and
`zoomend`: screen px = view px x 2^zoom). It asks `nextView` about the anchor first; if that stays,
it asks about the centre exactly as before. A handoff found by the anchor keeps the anchor's ground
at the same screen point (the new centre is the handed-over anchor minus its screen offset at the
new zoom), so the zoom carries on under the cursor.

Why this shape:

- It fixes the cause: the point the player is zooming at decides, which is what Leaflet's zoom
  itself promises.
- No new thresholds and no change to `nextView` (`src/atlas/ocean/`), the schema or the output.
  Enter and leave zooms, the half-level hysteresis, direction (in only enters, out only leaves) and
  the zoom-limit clamps are untouched; only which ground point is tested changes.
- Today's handoffs all still happen (the centre fallback). A zoom about the centre (keyboard, the
  zoom buttons) has the centre as its anchor, so it behaves exactly as before.
- Shape (2) ("at max zoom with a frame under the gesture point") would add a second trigger with
  its own edge cases (a wheel at max fires no `zoomend`) and still leave the cursor/centre mismatch
  below max zoom. Shape (1) already holds.
- No anchor is derived when there is no zoom change, or when a pan during the zoom puts the derived
  point off the screen; then the centre is used.

Guards kept: no handoff on a fit, on a click that moves nothing, or on a programmatic camera (the
armed flag is unchanged, apart from A); zooming out still hands back; one gesture chains through
levels only past the same thresholds as before.

## Provisional calls

- R-32's written rule says "the viewport centre is inside its frame". The canvas now tests the
  zoom's anchor first, then the centre. That changes R-32's ticket wording, not ADR-0003's zoom
  addendum or the meaning of `zoom: {min,max}`. For Isak to accept.
- An anchor handoff can land with the new view's centre outside the child map (the cursor was on
  the frame's edge, the centre beyond it), so part of the screen shows the child's surroundings.
  Chosen over moving the camera to put the centre inside, which would jump under the cursor.

## Tests (`src/test/canvas/canvas-camera.test.tsx`)

- R-40: the real order (input, `moveend`, `zoomstart`, `zoomend`) for wheel, touchstart and
  dblclick; a fling that stops on its own disarms; no handoff for a caller's camera right after a
  click that stopped a fling; a `moveend` during a zoom animation is ignored; a calm-mode pinch
  hands off at its `moveend` and leaves no zoom in flight; a pan after a finished zoom still
  disarms; a view change mid-zoom. Each fails with its fix taken out.
- Ocean floor: a hand-back far off-centre below the ocean's floor keeps the anchor at the floor's
  zoom and the ocean box on screen (fails without the clamp).
- B: enters the child under the cursor at max zoom with the centre outside the frame (failed before
  the fix); still enters by the centre with a centre-anchored zoom; stays below the enter zoom;
  never enters on a zoom out or on the canvas's own zoom; zooming out hands back keeping the ground
  under the cursor; one wheel step from the ocean over the child's frame enters only the isle; an
  anchor pushed off the screen by a pan falls back to the centre.

## Review fixes (P-04 review, checked against `node_modules/leaflet` 1.9.4)

- **R-40, the real order.** The wheel (`ScrollWheelZoom.js:67`, after its 40 ms debounce) and a
  pinch's touchstart (`TouchZoom.js:59`) call `map._stop()`, which fires the fling's `moveend`
  synchronously; `zoomstart` follows later. Fix: input records its time, and a pan's `moveend`
  within 150 ms of input keeps the flag. It only skips a disarm and never re-arms, so a caller's
  camera or a fit right after a click still can't hand off (`onApply` and the fit clear the flag).
- **A stuck zoom in calm mode.** A pinch fires `zoomstart` on its first `touchmove`
  (`TouchZoom.js:94`), but with `zoomAnimation` off its touchend `_resetView`s at the zoom already
  shown and fires only `moveend` (`TouchZoom.js:124`, `Map.js` `_resetView`). The zoom stayed "in
  flight" and every later pan's `moveend` was ignored. Now a `moveend` with a zoom in flight and no
  zoom animation running ends the zoom (and hands off), so calm-mode pinches hand off too.
- **Empty sea after a hand-back.** `setView` clamps the zoom to the view's floor and keeps the
  centre (`Map.js` `setView`, `_limitZoom`). The anchor offset was scaled at the unclamped zoom, so
  a pinch out far off-centre, below the ocean's floor, put the ocean box off screen. The handed
  zoom is now clamped to the new view's limits (the ocean's `oceanMinZoom`, else the canvas floor;
  max zoom) before the offset is applied.
- The test "an anchor that a pan pushed off the screen" now zooms past the cove's enter zoom with
  the would-be anchor inside the frame, so it can fail.

## Real browser check

`atlas:publish:next` (exit 0, all 44 scans clean), served on 4340/4341, page 1024x768, canvas
624x707. The Browser pane was hidden (another agent held its front tab), so `requestAnimationFrame`
did not run and Leaflet's animated zoom never finished; the check ran with calm mode on (no zoom
animation; the same anchored `setZoomAround` path) and real `WheelEvent`s dispatched at screen
points on the Leaflet container, one per 1.1 s. Calm mode was switched off again afterwards.

- **The dead end, fixed:** Oskmark, cursor 3 px inside Brindlecross's bottom-right corner: entered
  Brindlecross at Oskmark zoom about 2.1 (centre at Oskmark (217, 154), outside the frame), then
  zoomed on to 3.9 inside it. The baseline (4301, animated, same spot) sat at 4.0 on Oskmark.
  Shot: `shots/p04-after-entered.jpg`.
- **Screen corner:** Oskmark at zoom 1 with Brindlecross's bottom-right corner at the canvas's
  top-left; cursor (25, 85): entered Brindlecross at Oskmark zoom about 2.1.
- **Ocean to Oskmark, cursor at Oskmark's frame edge on Quessaly:** ocean > Quessaly (ocean -0.3)
  > Oskmark (Quessaly about 1.4), one level per wheel step, no skip; then on to Oskmark's max 4.0
  with no child under the cursor (correct: no child there).
- **All the way out**, same cursor: Oskmark > Quessaly at Oskmark about -1.6, Quessaly > ocean at
  Quessaly about -2.0. No flip-back on the next step either way.
- Seen: an anchor entry at a frame's edge lands with the child in a corner of the screen and its
  surroundings (sea) over the rest. A centre entry at the same zoom shows the same amount of sea
  around the child (enter zooms sit below the fill zoom); only its position differs. Flagged for
  "zoom feel".

## Not checked

- The review fixes were not re-run in the browser (tests only); the fling timing window (150 ms)
  is from Leaflet's source, not measured on a device.

- Real pinch and touch fling on a device (the anchor for a pinch that also pans is approximate:
  the point that stayed put, not the fingers' centre).
- Rotated frames in the browser (the tests and the transform are rotation-safe; the child view turns
  square at the handoff, as before).
