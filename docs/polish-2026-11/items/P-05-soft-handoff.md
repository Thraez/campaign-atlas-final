# P-05 Soft handoff

Branch `polish-p05-soft-handoff` (from `origin/main` 04c523d0). 2026-11-18.

## What

When a zoom hands off from a parent map to a child map (or back out), the old view's pictures were
swapped for the new view's in one frame: the parent's land around the child vanished into sea. The
item asks for two things: the child's picture lands exactly where its frame was on screen, and the
old and new pictures crossfade (about 250 ms) instead of a hard cut. Calm mode and the OS's
reduced-motion setting keep the plain cut.

## Placement: already right, now pinned

Measured on the untouched baseline (`127.0.0.1:4301`, Quessaly to Oskmark, wheel at the frame's
centre): the Oskmark picture landed on the screen rect the Oskmark frame had at the handoff, to the
pixel. R-32's `nextView` keeps the same ground under the centre and P-04's anchor rule keeps the
anchor's ground under the cursor, so the landing was never off; what read as a "jump" was the hard
cut (the parent's land disappearing at once). Shots: `shots/p05-before-in-1-before.jpg`,
`shots/p05-before-in-3-after.jpg`, `shots/p05-before-out-3-after.jpg`.

So P-05 changes no placement maths. It pins it with tests and pulls P-04's anchor handoff out of
`ZoomHandoff` into a pure `anchoredHandoff` (`src/atlas/canvas/zoomAnchor.ts`, same behaviour) so
the tests can reach it.

## The crossfade

`src/atlas/canvas/HandoffCrossfade.tsx`, with the pure maths in `handoffGhost.ts`:

- Just before `AtlasCanvas` reports a handoff, it asks `HandoffCrossfade` to **capture** the screen:
  a DOM copy of the picture pane (`tilePane`) as it shows now, with the target view and the
  handed-over camera. Only the pictures are copied, not the outlines, labels or pins.
- When the canvas shows that view, the copy goes on as a **ghost**: a layer placed on the new
  view's ground at exactly the screen the handed-over camera shows (`ghostBox`), so it lines up with
  the new pictures and then pans and zooms with them like an image overlay (Leaflet's own
  `ImageOverlay` placement, including the zoom animation). Whatever the camera does after the
  handoff (a clamp, the rest of a wheel zoom), old and new stay registered.
- The ghost waits for the new pictures to load (at most 400 ms), then fades from 1 to 0 over
  250 ms and is removed.
- Its pane sits straight after the picture pane. The app's stylesheet pins every Leaflet pane to
  `z-index: 1 !important` (`src/index.css`), so panes stack in DOM order and the ghost's pane is
  moved there; the new view's outlines, labels and pins are on top from the first frame.

Guards, so there are never two pictures or a stuck fade:

- A new capture takes any ghost off at once; only one copy waits at a time.
- A copy is used only for the view it was taken for; a different view change (a crumb click) takes
  the ghost off and drops the waiting copy; an unused copy is forgotten after 1 s.
- Calm mode or reduced motion: no capture at all (a plain cut, today's behaviour), and turning calm
  mode on mid-fade takes the ghost off. Unmounting takes it off.
- Nothing to copy (empty picture pane, zero-sized map): a plain cut.
- One gesture still gives at most one handoff per `zoomend` (P-04's rule is unchanged).

## Provisional calls

- **Only the pictures crossfade.** The sea colour behind the maps, the outlines, labels and pins
  change in one frame, as before. Copying them too would mean either cloning SVG and marker panes
  that move independently, or fading the whole canvas; the pictures are what jumped.
- **Wait for load, capped at 400 ms**, so a slow child picture doesn't leave a hole under a
  half-faded parent; past 400 ms it fades anyway.
- **Ease-out, 250 ms**, as the plan says. No sound of any kind.
- A rotated frame still turns square at the handoff (the child map is drawn upright); the turn is
  now under the fade, not hidden.

## Tests

- `src/test/canvas/handoff-crossfade.test.ts` (pure): zooming in by the centre and by the anchor
  (centre outside the frame) lands the child's picture on its frame's screen rect; zooming out lands
  the frame on the child's rect; ocean to map lands the map on its placement; the ghost covers
  exactly the screen at the handed-over camera and stays registered under a clamped zoom.
- `src/test/canvas/handoff-crossfade-component.test.tsx` (fake map with real panes, fake timers):
  one copy, fades, removed; placed at the handed-over camera; pane right after the pictures; holds
  while the new picture loads, fades on load; fades after 400 ms if it never loads; reduced motion
  is a plain cut with no copy; calm mode on mid-fade removes it; a quick zoom back out leaves only
  the newest copy; a view change that isn't the handoff removes it and the stale copy isn't used; a
  copy never shown is forgotten; an empty picture pane is a cut; unmount removes it.
- `src/test/canvas/canvas-camera.test.tsx`: its fake map gained a `getPane` with no panes (the
  crossfade stays a cut there); everything else unchanged and green.

Targeted runs green: `src/test/canvas/` (all files), `src/test/ocean/`, `AtlasViewer.v2` and
`AtlasViewer.smoke`. `typecheck:all`, `lint` (0 errors; no warnings in the changed files) and
`format:check` pass. The full gate was not run.

## Real browser check

`atlas:publish:next`, served on 4350/4351, headless Chromium at 1024x768 via playwright-cli,
Quessaly to Oskmark and back with the wheel at the Oskmark frame.

- In and out each hand off once, show one ghost, and leave none behind about 380 ms later.
- Shots: `p05-after-in-1-before.jpg`, `p05-after-in-2-mid.jpg` (live, ghost at 0.43),
  `p05-after-in-3-after.jpg`; `p05-after-out-2-mid.jpg` (live, ghost at 0.16),
  `p05-after-out-3-after.jpg`. The live fade is too quick for a screenshot to catch reliably, so
  `p05-after-in-2-mid-frozen.jpg` and `p05-after-out-2-mid-frozen.jpg` are the real ghost node,
  put back at 0.5 opacity by the test script after the component removed it: on the way out the
  Oskmark copy sits inside Oskmark's frame outline on Quessaly.
- The first browser run caught the pane order: with every pane at `z-index: 1 !important`, the
  ghost's pane (created last) covered the outlines and labels. Fixed as above and re-checked; the
  pane list now reads tile, ghost, overlay, ...
- Calm mode (`atlas-calm-mode-v1`) and emulated `prefers-reduced-motion: reduce`: the handoff
  happens, no ghost is ever added.
- Rapid wheel in and out across the threshold (six handoffs in about 3 s): never more than one
  ghost, none left at the end, no copy stuck at part opacity.

## Not checked

- A real touch pinch on a phone, and Safari or Firefox (headless Chromium only).
- Slow networks: the 400 ms load cap was exercised only in tests.
- Large maps with many layers: the copy clones every picture element in the pane once per handoff.
- The ghost's placement during Leaflet's zoom animation relies on Leaflet's private
  `_latLngBoundsToNewLayerBounds`, as `ImageOverlay` does; a Leaflet upgrade should re-check it.

## Review fixes

From an adversarial Opus review of 2bec327e (2026-11-18):

- **The handoff always goes through.** `AtlasCanvas` takes the copy inside a `try`: if copying
  throws, the handoff is a plain cut and still reaches `onViewChange` (R-32).
- **The ocean's pictures are waited for too.** Besides `<img>`, the wait covers the SVG `<image>`
  elements `OceanMaps` draws. They have no `complete`, so each gets a probe `<img>` with the same
  address: a cached picture counts as loaded at once, otherwise the first `load` or `error` on the
  `<image>` or the probe counts. Still capped at 400 ms.
- **Pane comments fixed, dead z-index gone.** The ghost's pane has no z-index of its own; it stacks
  by DOM order (every pane is `z-index: 1 !important` in `index.css`).
- **The copy carries no `id` or `data-*`** (`data-canvas-map` among them), so nothing that looks
  those up finds the ghost.
- **The unused copy's 1 s expiry timer** is cleared on a new capture and on unmount.
- **The reduce-motion flag** that `capture` reads is set in a layout effect, in the commit itself,
  not in a passive effect. (Setting it during render, as the review suggested, is refused by the
  `react-hooks/refs` lint rule; the layout effect closes the same gap.)
- Tests: `src/test/canvas/handoff-crossfade-canvas.test.tsx` (new, through `AtlasCanvas` with the
  real `useReduceMotion`): the copy is taken before the caller hears the handoff; a copy that
  throws still hands off; calm mode and the OS setting are plain cuts; calm mode on mid-fade takes
  the ghost off. The component tests gained: SVG `<image>` held until load, cached, and never
  loading; no pointer events on the ghost or its pane; ids and `data-*` stripped; a `zoomanim`
  mid-fade moves and scales the ghost and its listeners go with it; unmount clears the expiry
  timer.
