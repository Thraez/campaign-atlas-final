# R-31 The shared canvas: the ocean and one map

Status: in-review
Blocked by: R-30
Size: M
Branch: `rebuild-r31-shared-canvas`
Model: Opus (design call: how the ocean renders rotated, scaled maps on Leaflet)
Needs: the adversarial player-safety review (light): the dev harness must never reach a player build

ADR-0002 and plan.md section 2 call for one canvas component used by the viewer (R-33) and later
the editor's E1 (phase 4). Today the viewer's `<MapContainer>` (`src/pages/AtlasViewer.tsx`
~737-812) and the editor's (`src/pages/AtlasPlacementEditor.tsx` ~2039) are separate, and both
show one flat map. Build `AtlasCanvas` in `src/atlas/canvas/`, on R-30's tree.

## Acceptance criteria

- `AtlasCanvas` takes the tree (R-30), a `view` (`{ kind: "ocean" }` or `{ kind: "map", mapId }`),
  a camera (centre and zoom in that view's coordinates, or "fit"), and callbacks (`onCameraChange`,
  `onEnterMap(mapId)`, `onFrameHover`). It renders `children` inside the map pane, so callers add
  their own layers (the viewer's `WrappedWorld` features, the editor's tools later).
- **Ocean view (P1):** the sea (`OceanBackground`, the `ocean.sea` style; `default` = today's
  water), every top-level map's image layers at its placement (position, scale, rotation about the
  centre, R-30), and each map's name as a label over it. No pins, regions or routes on the ocean.
  Opens fitted to every top-level map, not to the whole ocean rectangle. Clicking a map calls
  `onEnterMap`. Rotation must render: Leaflet's `ImageOverlay` can't rotate, so pick the approach
  (an `SVGOverlay` with transformed `<image>` elements is the expected one) and say why in the PR.
- **Map view (P2):** the map's layers as `WrappedWorld` draws them today, plus each child's frame
  (R-30 `frameOutline`) as a soft outline with the child's name; hover highlights it, a click calls
  `onEnterMap`. Only children in the tree are drawn, so a child that didn't ship has no frame (the
  build already drops it; a test pins that the canvas draws nothing for an id that isn't a tree
  node).
- `FlatCRS`, `FitMapOnOpen` and `OceanBackground` are reused, not copied. The canvas owns its
  `MapContainer`; it has no viewer-only imports (search, entity panel, sound), so the editor can
  use it in phase 4 (a test or lint check that `src/atlas/canvas/` imports nothing from
  `src/pages/` or editor modules).
- Respects reduced motion (`useReduceMotion`) for the sea and any fly animation.
- Tests: rendering with the `react-leaflet` mock (`src/test/helpers/reactLeafletMock`) for both
  views on the test-world tree (which maps, frames and labels appear per campaign), plus a rotated
  fixture (a frame at 30°, an ocean placement at 15°): the test world has only rotation 0.
- **A dev harness for v2 stores.** Nothing serves a v2 store in dev today (`npm run dev` is v1, and
  the editor build refuses a campaign public dir). Add a dev-only route (`/__canvas?c=<id>`)
  behind `__INCLUDE_EDITOR__`, fed by a dev-server-only middleware that serves
  `.atlas-campaigns/<id>/atlas/` read-only (no directory listing, no path outside that dir). It
  mounts `AtlasCanvas` on that campaign's store, with a switch for a rotated fixture. It must be
  absent from every player build (`player-import-graph.test.ts` or a new check pins it). Phase 4's
  editor reuses it. Real-Leaflet check in the preview pane on both campaigns, including the
  rotated case; screenshots in the PR.
- `npm run gate` passes.

## Touches

`src/atlas/canvas/` (new), the dev harness route and middleware (`vite.config.ts` or a dev plugin under `scripts/`), maybe small props on `src/atlas/map/WrappedWorld.tsx` and
`src/atlas/ocean/OceanBackground.tsx`. Not `AtlasViewer.tsx` (R-33) or the editor.

## Out of scope

The zoom handoff between views (R-32), the breadcrumb and URL (R-33), region cards on the ocean
(phase 5), tiles (phase T).

## Build notes

Built on `rebuild-r31-shared-canvas`, stacked on R-30 (`rebuild-r30-map-tree-model`, not merged yet).

**What's where.** `src/atlas/canvas/`: `AtlasCanvas.tsx` (the component), `CanvasLayers.tsx` (ocean
maps, child frames, outlines and labels), `CanvasCamera.tsx` (explicit camera and `moveend`
reports), `canvasGeometry.ts` (pure), `seaStyle.ts`. The viewer's image drawing moved out of
`WrappedWorld` into `src/atlas/map/MapImageLayers.tsx`, so the canvas reuses it rather than copying.
Dev harness: `src/atlas/canvas-harness/` (routed at `/__canvas` behind `__INCLUDE_EDITOR__`, and in
`EDITOR_ONLY_PATHS`), fed by `scripts/vite-plugin-campaign-stores.ts`.

**Rotation approach: one `SVGOverlay` per top-level map.** Leaflet positions and scales the `<svg>`
the same way it does an image overlay, through pan, zoom and the zoom animation. The svg's viewBox
is in ocean pixels, and the map's images sit in a `<g transform="rotate(r cx cy)">`. So rotation is
plain SVG: it needs no code per frame and no new dependency, and it uses the same about-the-centre,
clockwise convention as R-30's `mapToOcean`. The rejected options:
- `ImageOverlay` can't rotate.
- A CSS transform on the image fights Leaflet's own transform during zoom.
- A rotated-image plugin is a new dependency.
- A canvas layer redraws on every move.

The click target is a separate, invisible `Polygon` over `mapToOcean`'s corners, so hit-testing
follows the rotation exactly. The real-Leaflet check confirmed it: hovering just outside the
rotated corner doesn't register, and just inside it does.

**Real-Leaflet check** (dev server, preview pane). Screenshots are in `previews/r31/`
(gitignored, in the worktree):
- `1-main-ocean.jpg`: main ocean, Quessaly and Skerrow Isles, sea `default`.
- `2-main-quessaly-hover-oskmark.jpg`: map view, Oskmark frame highlighted on hover.
- `3-main-oskmark.jpg`: Brindlecross and Tallowford frames.
- `4-main-rotated-ocean-15.jpg`: `rotated=1`, Quessaly turned 15°.
- `5-main-rotated-ocean-zoomed.jpg`: the same, zoomed in. The rotation holds and the outline
  matches the image.
- `6-main-rotated-frame-30.jpg`: the Oskmark frame at 30°.
- `7-sandbox-ocean.jpg`, `8-sandbox-quessaly.jpg`, `9-sandbox-oskmark.jpg`: sandbox. One map, one
  frame, and oskmark frames nothing.

No console errors.

**Tests**:
- `src/test/canvas/atlas-canvas.test.tsx`: both views, per campaign, on the built test world; the
  rotated fixture; an unknown id draws nothing and no children; click and hover; reduced motion;
  an unknown sea style.
- `canvas-imports.test.ts`: the import fence. The graph walker was moved to
  `src/test/helpers/importGraph.ts` and is shared with the player import-graph test, which now also
  asserts the harness is out of the player graph.
- `campaign-store-server.test.ts`: traversal (raw and encoded), listing, unknown or `__proto__`
  id, file types, symlink escape, loopback, read-only methods. It also checks the plugin is absent
  from a production build's plugin list and that its paths are editor fingerprints.
- `canvas-geometry.test.ts`.
- One `FitMapOnOpen` case for the new `bounds`.

**Small calls (provisional):**
- New optional props on shared parts:
  - `FitMapOnOpen` `bounds` (fit an area instead of the whole map);
  - `OceanBackground` `reduceMotion`;
  - `WrappedWorld` `showImageLayers` (default true), so a caller drawing pins etc. over the canvas
    doesn't draw the images twice.
- Map view draws the `wrapX` copies, as the viewer does.
- `zoomSnap` is left at Leaflet's default (1), so a fit lands on a whole zoom. R-32 owns
  fractional zoom.
- A view the tree can't show (unknown id, or the ocean of a v1 atlas) renders the sea and nothing
  else. Children aren't mounted either, since they'd have no coordinate space.
- `onFrameHover` fires for ocean maps as well as child frames.
- Labels are permanent, centred Leaflet tooltips styled as plain text.
- Canvas images go in `tilePane`. The repo's `.leaflet-pane{z-index:1 !important}` makes DOM order
  decide stacking, and this keeps caller layers above the images.
- `camera: "fit"` re-fits each time the caller switches back to it.
- An explicit camera uses `setView`. It animates unless motion is reduced or the view just changed.
  A camera equal to the last reported one is ignored, so echoing `onCameraChange` back doesn't loop.
- `ocean.sea`: only `default` exists. The lookup is own-key only, and anything else falls back to
  `default`. The value never reaches the DOM.
- Store server:
  - reads `atlas.next.config.json`'s campaign list, from `campaignArtifacts` (`layout: "store"`);
  - adds a list endpoint, `/__atlas/campaign-stores`;
  - serves only a fixed set of file types;
  - uses the raw request path, so `..` and `%2e%2e` get a 404 instead of being folded away and
    handed to Vite;
  - its paths are kept in a separate `DEV_CANVAS_PATHS` (not `DEV_API_PATHS`, whose entries must
    all be save-plugin routes) and are added to the player-bundle editor fingerprints.
