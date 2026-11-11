# R-31 The shared canvas: the ocean and one map

Status: ready-for-agent
Blocked by: R-30
Size: M
Branch: `rebuild-r31-shared-canvas`
Model: Opus (design call: how the ocean renders rotated, scaled maps on Leaflet)

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
  views on the test-world tree (which maps, frames and labels appear per campaign), and a
  preview-pane check of the real Leaflet render on a page or story that mounts the canvas on the
  `content-next/` `main` store (screenshot in the PR; the viewer isn't switched yet).
- `npm run gate` passes.

## Touches

`src/atlas/canvas/` (new), maybe small props on `src/atlas/map/WrappedWorld.tsx` and
`src/atlas/ocean/OceanBackground.tsx`. Not `AtlasViewer.tsx` (R-33) or the editor.

## Out of scope

The zoom handoff between views (R-32), the breadcrumb and URL (R-33), region cards on the ocean
(phase 5), tiles (phase T).
