# P-06 Zoom and crumb feel

Branch `polish-p06-zoom-and-crumb-feel` (from `polish-p05-soft-handoff`). 2026-11-18. v2 shared
canvas only; the v1 `<MapContainer>` path is unchanged (its Reset still calls `fitMapRef`, and
`FitMapOnOpen` without the new `fit` prop does the same `fitBounds` as before).

## Wheel: 4-5 notches a level

Leaflet divides a wheel event's pixels by a platform factor (`wheelPxFactor`: 3x the device pixel
ratio on a Mac, 2x elsewhere, 1x on Linux Chrome), then zooms `4 log2(2 / (1 + e^-|d/4w|))` per
40 ms batch, w = `wheelPxPerZoomLevel` (default 60). On a retina Mac a notch (deltaY 100) was
about 0.2 levels, so a level of the tree (about 2 zoom levels) took 10-12 notches.

The canvas now sets `wheelPxPerZoomLevel = 144 / factor` (`src/atlas/canvas/canvasMotion.ts`). That
undoes the platform factor: a 100 px notch zooms **0.479** levels everywhere (retina Mac w = 24,
Mac at dpr 1 w = 48, Windows w = 72, close to Leaflet's 60). A level of 1.6-2.4 zoom takes 4-5
notches.

Line- and page-mode wheels (Firefox, some Windows mice: `deltaMode` 1 or 2) skip Leaflet's
factor: `getWheelDelta` gives a plain 20 wheel px a line and 60 a page. With w = 144 / factor
alone, a 3-line notch would count as 0.6 x factor notches (about 1.1 levels at 200 % on Windows,
1.5 on a retina Mac; review finding). So the canvas runs its own wheel handler
(`src/atlas/canvas/canvasWheel.ts`: Leaflet's `ScrollWheelZoom` extended, Leaflet's own turned
off with `scrollWheelZoom={false}`), which scales each line- or page-mode event's delta by
`(100 / 60) / factor` (`canvasWheelDeltaScale`). A 3-line notch and a page now zoom what a 100 px
notch does, 0.479. The factor is computed once at module load, as Leaflet fixes its own. Rechecked
in Chromium after the review fixes: a 100 px notch and a synthetic 3-line notch each zoomed about
0.45-0.5 (URL `cz` 0.6 to 1.0, then 1.0 to 1.5), and the notch counts stayed 4, 1 and 5.

Trackpad: two-finger scroll and pinch arrive as small pixel deltas in the same 40 ms batches, so
they speed up by the same ratio as the mouse (about 2.4x on a retina Mac, about 1.2x on Windows).
Leaflet's curve still flattens big batches (a 300 px flick is about 1.3 levels, never more than 4).
Not tried on a real trackpad; see below.

**One notch never crosses two handoffs.** `nextView` takes a new `maxSteps`; `ZoomHandoff` passes
1 when the zoom's last input was a `wheel` event (a mouse notch, or a trackpad scroll or pinch
batch, which Chrome also sends as wheel). A notch past two thresholds enters one level; the next
notch goes on. Keyboard, buttons, double-click and touch pinch chain as before (R-32). Zoom-out
gaps between a child's leave and the parent's leave can be about zero in content, so a step limit
is the only real guarantee.

## Glide: crumbs and Reset

A breadcrumb click and the Reset button glide with `flyTo` / `flyToBounds` for **0.4 s**
(`GLIDE_SECONDS`). Calm mode and the OS reduced-motion setting (`useReduceMotion`, `data-calm`)
keep the jump.

How: the viewer bumps `AtlasCanvas`'s new `glide` counter in the same update as the camera or view
change. `GlideRequest` (`src/atlas/canvas/CanvasGlide.tsx`, the canvas's first child) turns the
bump into a one-commit request; `CanvasCamera` (an explicit camera, e.g. a remembered one) or the
fit (`FitMapOnOpen`'s new `fit` prop) takes it. A request nobody takes is dropped after the commit.

**Crumb sequence (the view changes).** A crumb always goes up the tree. Simplest correct sequence:
cut to the ancestor at the camera that shows the same ground as now (`ancestorCamera`, what a zoom
hand-back would land on), then glide in the ancestor's pixels to its remembered or fitted camera.
The cut is invisible in position (same ground, same scale); only the deeper map's own detail
swaps for the ancestor's drawing of it at that moment. A view change that is not up the tree
jumps, as before.

**No handoff during a glide.** The explicit camera already clears the user-input flag; on top of
that `runGlide` sets `flying` around the fly call, and `ZoomHandoff` marks that zoomstart as the
glide's. The glide ends without a handoff when it lands (zoomend) or a drag stops it (Leaflet's
`_stop`, then only the drag's moveend). A wheel or pinch that stops it is a zoom of its own: Leaflet
fires a fresh zoomstart for it, which replaces the glide marker, so that zoom hands off as usual.
A wheel in the glide's last moments (its batch still in Leaflet's 40 ms debounce when the glide
lands) keeps the user-input flag (input within `INPUT_STOP_WINDOW_MS`, 150 ms, of the landing), so
its zoom hands off too; older input is cleared at the landing, so a stray click long before can't
turn a later canvas move into a handoff. A crumb changes the view, which drops any P-05 crossfade ghost, so the two
never overlap; a glide never captures a ghost (only a handoff does).

**URL camera.** Leaflet fires `moveend` when the flight lands; `CanvasCamera` reports that camera
and the viewer writes it to the URL (replace). Checked in the browser: the URL ends on the landed
camera.

## Tests

- `src/test/canvas/canvas-motion.test.ts` (9): Leaflet's factor, the curve against the measured
  Chromium value, the same notch on every platform, 4-5 notches for spans 1.6-2.39 (8+ with the old
  numbers on a retina Mac), a line-mode notch and a page equal to a pixel notch, flick flattening, `ancestorCamera` one and two levels up and null cases.
- `src/test/canvas/canvas-glide.test.tsx` (12, fake-map harness with `flyTo`/`flyToBounds`): Reset
  glides with flyToBounds and reports the landed camera; a crumb cuts to the same ground then
  flies; a crumb to a fit flies to bounds; calm mode jumps; no bump still jumps; a glide past the
  threshold never hands off; Leaflet's interrupts modelled as Leaflet fires them (a wheel: the
  flight stops with no zoomend, then the wheel's own zoomstart and zoomend, which hands off; a
  drag: moveend only, no handoff, nothing left armed, the next user zoom hands off); a wheel in the
  last 10 ms of a glide hands off after the landing; a click 400 ms before the landing doesn't;
  a wheel step past two thresholds enters one level; a keyboard zoom still chains.
- `src/test/helpers/reactLeafletMock.tsx`: the shared fake map gained `flyToBounds` (the viewer v2
  tests now reach it on crumbs).
- `src/test/canvas/canvas-wheel.test.ts` (2, a real Leaflet map in jsdom): the canvas's handler adds
  the same delta for a 3-line notch and a page as for a 100 px notch.

Run: typecheck:all clean, lint 0 errors (warnings as before), format:check clean; vitest on
`src/test/canvas`, `src/test/ocean`, `fit-map-on-open`, every test that uses the react-leaflet mock,
`src/test/pages`, `MapBreadcrumb`, `player-import-graph`: all pass. Full suite and gate not run
(per brief).

## Browser (atlas:serve:next, Lantern Road, 1280x800, headless Chromium on the Mac)

Notches (deltaY 100, dpr 1, cursor on the next frame):

|                         | before | after |
| ----------------------- | ------ | ----- |
| ocean -> Quessaly       | 5      | 4     |
| Quessaly -> Oskmark     | 1      | 1     |
| Oskmark -> Brindlecross | 6      | 5     |

Quessaly -> Oskmark is one notch in both: Oskmark's own level span is only about 0.5 zoom (content).
"Before" at dpr 1 is Leaflet's Mac factor 3 (0.387 a notch); the audit's "about 10" is a retina
Mac, factor 6 (0.2 a notch). Headless Chromium at dpr 2 sends a 100 px wheel as deltaY 50, so it
can't stand in for a real retina mouse; the after build there took 7, 2 and 10 (it is 0.24 a notch,
what the formula predicts for a halved delta).

Glide: Reset, crumb Brindlecross -> Quessaly, crumb Quessaly -> Ocean each showed about 11 distinct
frames in 0.5 s; in calm mode (`atlas-calm-mode-v1`) one (a jump). Views and URLs landed right
(`cz` 1.1 fit, 0.6, -1.7), and Back returned to the previous view and camera.

Shots: `shots/p06-before-{desktop,phone}.jpg`, `shots/p06-after-{desktop,phone}.jpg` (at rest:
identical, as expected), `shots/p06-after-{desktop,phone}-midglide.jpg` (180 ms into the Ocean
crumb from Oskmark).

## Not verified

- A real retina Mac mouse and trackpad (pinch, two-finger scroll), and Windows at 125-150 %
  scaling. The numbers assume Chrome reports a notch as deltaY 100 CSS px, as Leaflet does.
- Safari and Firefox in a real browser (line mode is covered by unit tests only).

## Provisional calls for Isak

- 0.48 levels a notch and 0.4 s glide. Faster is one constant each in `canvasMotion.ts`.
- Trackpad scroll speeds up by the same ratio as the mouse (about 2.4x on a retina Mac). If it feels
  twitchy, the fix is a separate factor for small deltas; not done, because both arrive as plain
  pixel wheel events and telling them apart is a guess.
- A crumb from two levels down cuts to the ancestor at the start, so the deeper map's detail goes
  at once rather than fading; mixing that with the P-05 crossfade would be a later item.
