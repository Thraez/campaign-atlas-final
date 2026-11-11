# R-30 Map tree and ocean geometry in the app

Status: ready-for-agent
Blocked by: -
Size: S
Branch: `rebuild-r30-map-tree-model`
Model: Sonnet (settled plan)

Phase 3's canvas (R-31), the zoom handoff (R-32) and the viewer (R-33) all need to know, from a
player `atlas.json`, which maps sit on the ocean, which sit inside which, and how a point or a
camera moves between a child, its parent and the ocean. Today none of that exists in `src/`: the
build writes `ocean`, `parent`, `frame` and `enterZoom` (`scripts/build-atlas.ts` ~1679-1693,
`scripts/atlas/build/worldSources.ts:219`), and the viewer reads none of them.

Build one pure module, `src/atlas/ocean/mapTree.ts`, with no React or Leaflet imports, that every
later Phase 3 ticket uses.

## Acceptance criteria

- `buildMapTree(project: AtlasProject)` returns, for v2 output (`project.ocean` present): the
  ocean (size, sea), the top-level maps in `onOcean` order with their placement, each map's
  children (maps whose `parent` is it, in `project.maps` order), and lookup by id. For v1 output
  (no `ocean`): no ocean, and every map is top-level, in `project.maps` order.
- It fails closed on a tree the build should never write, without throwing in the viewer: a map
  whose `parent` isn't in `project.maps`, a child with no `frame` or a frame that `frameQuads`
  rejects, a cycle, or a v2 top-level map missing from `onOcean` is left out of the tree with its
  subtree, and the function returns the dropped ids so the viewer can log them (never show them).
  An `onOcean` entry naming a map that isn't in `project.maps` is ignored.
- `breadcrumb(tree, mapId)`: the chain ocean (v2 only) > top-level map > ... > the map.
- Geometry, each with a round-trip test:
  - `childToParent(frame, child, point)` and `parentToChild(...)`: a child pixel to its parent's
    pixels and back. The child image fills its frame. `rotation` is in degrees, clockwise on
    screen, about the frame's centre (provisional call, below).
  - `mapToOcean(placement, map, point)` and `oceanToMap(...)`: the same for a top-level map on the
    ocean (`x`, `y` = the top-left of the scaled, unrotated map; `scale` multiplies its pixels;
    `rotation` as above, about the scaled map's centre).
  - `zoomOffset(child, frame)` and `oceanZoomOffset(map, placement)`: the zoom to add to a parent
    (or ocean) zoom to get the child's zoom showing the same ground (`log2` of the pixel ratio).
    A frame whose aspect differs from its child's by more than 1% uses the width ratio, and the
    tree lists it under a `warnings` field.
  - `frameOutline(frame)`: the four corners in the parent's pixels, for drawing. Use
    `frameQuads`' centre-pivot quad from `src/atlas/content/resolveCampaign.ts`; import it, don't
    copy it.
- `atlasGuard` (`src/atlas/content/atlasGuard.ts`) accepts and type-checks the optional v2 output
  fields (`ocean`, `campaign`, `parent`, `frame`, `enterZoom`) instead of passing them through
  unchecked; a malformed one is dropped, not fatal, with a test per field.
- Tests use the real test-world output: build `content-next/` (`atlas:build:player -- --config
  atlas.next.config.json --campaign <id>`, as `src/test/build/campaign-stores.test.ts` does) and
  check the tree for both campaigns: `main` has ocean > `quessaly-world` > `oskmark` >
  `brindlecross` and `tallowford`; `sandbox` has no `skerrow-isles`, `tallowford` or
  `brindlecross`; neither has `mirefold`. Plus fixture tests (`src/test/helpers/makeProject`) for
  every drop case above.
- `npm run gate` passes.

## Provisional calls (noted in State.md)

- **Rotation pivot: the centre**, for frames and ocean placements. ADR-0003 leaves it open
  (`frameQuads` tests both pivots, fail closed). The viewer must draw one; the centre is what an
  editor's rotate handle does. The resolver keeps testing both until ADR-0003 is amended.
- **Aspect mismatch**: the width ratio wins, with a warning; the editor (E5) will keep aspects
  equal.

## Touches

`src/atlas/ocean/mapTree.ts` (new), `src/atlas/content/atlasGuard.ts`, tests under `src/test/ocean/`.

## Out of scope

Rendering (R-31), the zoom handoff (R-32), the viewer (R-33). Build output changes: none.
