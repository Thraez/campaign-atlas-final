# P-07 Frames and pictures that respond

Branch `polish-p07-frames-and-pictures` (from `polish-p06-zoom-and-crumb-feel`). 2026-11-18. v2
shared canvas only; the v1 viewer passes no new props to `MapImageLayers`, so it renders as before.

## What changed

- **Frames ease and press.** Child-map frames and ocean outlines get `atlas-canvas-frame` classes
  (a Leaflet creation option: `className` on `<Polygon>`, since `pathOptions`/`setStyle` never sets
  a class). Hover adds `is-hover` to the path and its label; a `pointerdown` on the path adds
  `is-pressed` until `pointerup`/`pointercancel` anywhere, or the map starts a drag. The look lives
  in `src/index.css` ("Shared canvas (P-07)"): the dashed frame eases to solid over 150 ms (colour,
  width, dash, fill, a drop-shadow glow); pressed is the gold `--atlas-frame-press`. The old
  idle/hover `pathOptions` stay as the fallback if the stylesheet doesn't load.
- **Labels** use `--font-display` (Cinzel), 700, 13px (14px from 640px), `letter-spacing: 0.08em`,
  with a dark multi-layer halo so they read over sea and over pale map art on a phone. The
  label CSS that sat in `AtlasCanvas.tsx` moved to `index.css`. After `document.fonts.ready` the
  tooltip re-centres (Cinzel is wider than the fallback).
- **Pictures fade in over chart paper.** Each map gets a sheet drawn in SVG under its pictures
  (parchment fill, a 12-step grid, an inset neat line; `ChartPaper`/`PaperSheet` in
  `CanvasLayers.tsx`). Pictures start `is-pending` (hidden), and once loaded and decoded fade in over
  250 ms (`src/atlas/canvas/pictureReveal.ts`). When every picture of the map has loaded the paper
  fades out behind them and is hidden. No blurred or lossy stand-in: maps stay lossless.
- `AtlasCanvas.tsx`: one import and one line (`<MapPictures>` replaces the inline
  `MapImageLayers`), plus the label CSS removed.

## Rules

- **One fade at a time with P-05.** A picture that loads while a handoff ghost
  (`data-handoff-ghost`) is on the map shows at once (no decode wait, no fade): the ghost's fade is
  the transition. A picture that loads after the ghost has gone fades as usual. `is-revealing` is
  removed after the fade, so a P-05 clone of the image pane never replays it.
- **Calm / reduced motion** (`useReduceMotion`): states still apply (hover, pressed, loaded), with
  no `atlas-canvas-eased` or `is-revealing` class anywhere; the global calm CSS zeroes the rest.
- The paper goes once every picture has settled (loaded or failed) and at least one loaded. A
  failed layer among loaded ones doesn't leave a tan box round transparent art; a map whose
  pictures all failed keeps its paper (better than bare sea). Failed pictures stay hidden.
- A new set of picture elements starts the count again: the ocean overlay remounts on a new box,
  and the map view keys on map, copies and layer ids. Settles from the old set are ignored, so
  the paper never goes while the new pictures are still hidden.
- **Leaflet's zoom transition is kept.** Leaflet animates zoom with `transition: transform` on
  `.leaflet-zoom-animated` (every tooltip and image overlay) while the map pane has
  `.leaflet-zoom-anim`. Our label colour ease and picture fade would replace it, so each has a twin
  rule under `.leaflet-zoom-anim` listing `transform 0.25s cubic-bezier(0, 0, 0.25, 1)` first.
  If Leaflet's timing changes on an upgrade, change both twins.
- A map with no picture layers shows no paper. `wrapX` maps draw paper under every copy and wait
  for all copies to settle.
- The paper sits in the same pane as the pictures, before them, so pins, regions and routes stay
  above both.

## Verified

- `typecheck:all`, `lint` (0 errors; existing warnings only), `format:check`, vitest
  `src/test/canvas` (P-05 ghost tests included) all pass. New `src/test/canvas/frames-and-pictures.test.tsx`
  (13 tests): label class and Cinzel rule, frame classes, hover/out, pressed until pointerup or
  dragstart, click still enters, reduced motion, pending start, load then fade then done paper,
  calm mode, under-ghost instant reveal, `wrapX` with an error, ocean `<image>` and outline.
  Review fixes added: the zoom-transition twins (a stylesheet check; jsdom can't zoom), an error
  among loaded copies lets the paper go, all failing keeps it, a new ocean box brings the paper
  back until the new picture loads. The shared `reactLeafletMock` now draws `SVGOverlay` as an
  `<svg>` (no more "unrecognized tag" warnings); every test that uses it passes.
- Browser (Chrome, `atlas:serve:next` on 4380-4382, built atlas): hovered frame mid-ease (150 ms
  transition, glow filter computed); pressed frame gold with glow; Cinzel labels on desktop and at
  375 px over sea and map art; picture requests delayed 3 s show the chart paper, then the fade.
  Click into Oskmark: one `is-revealing` on the new picture, no ghost. Wheel into Oskmark: a P-05
  ghost appears, the new picture shows with no `is-revealing` (one fade only). Calm mode
  (`atlas-calm-mode-v1`): no eased or revealing classes, transition ~0.
- Double-click zoom on empty map next to Oskmark, label centre against frame centre sampled every
  40 ms: with the fix within 2 px through the whole zoom, computed transition `transform, color`
  (picture `transform, opacity`); with the twin rule overridden the label ran up to 161 px ahead.
- Shots: `docs/polish-2026-11/shots/p07-before-*.jpg`, `p07-after-*.jpg` (desktop 1280, phone 375,
  including the loading paper and a hovered and a pressed frame).

## Not verified

- A real phone (touch press: `pointerdown` covers it in code, not tried on a device), Safari and
  Firefox (CSS `filter` on SVG paths and `stroke-dasharray` easing).
- Keyboard: Leaflet paths are not focusable, so there is no focus state to style. Making frames
  focusable is a separate item (it touches the a11y model of the canvas).

## Provisional taste calls for Isak

- Paper tone `#bfae86` with a dark-brown grid: reads as parchment; could be dimmer so it feels less
  like content.
- Pressed colour: the existing gold accent (`#f2c46d`).
- Glow strength on hover/pressed, label size 13/14 px at weight 700.
- The paper fades out 250 ms after the last picture arrives (so the fade-in covers it first).
