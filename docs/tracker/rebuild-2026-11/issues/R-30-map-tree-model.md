# R-30 Map tree and ocean geometry in the app

Status: done
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
- `parseAtlasProject` accepts `schemaVersion` up to `MAX_ATLAS_SCHEMA_VERSION` (2), not
  `CURRENT_ATLAS_SCHEMA_VERSION` (1): today it refuses every v2 `atlas.json`, so the viewer can't
  open one. Test: each campaign's real `content-next` `atlas.json` passes it.
- Rotated fixtures (a frame at 30°, an ocean placement at 15°) in the geometry tests: the test
  world has only rotation 0.
- The viewer logs only a count of dropped maps, never their ids (the API returns ids for tests).
- Tests use the real test-world output: build `content-next/` (`atlas:build:player -- --config
  atlas.next.config.json --campaign <id>`, as `src/test/build/campaign-stores.test.ts` does) and
  check the tree for both campaigns: `main` has ocean > `quessaly-world` > `oskmark` >
  `brindlecross` and `tallowford`; `sandbox` has no `skerrow-isles`, `hookhaven`, `tallowford`
  or `brindlecross`; neither has `mirefold`. Plus fixture tests (`src/test/helpers/makeProject`) for
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

## Build notes

- Built `src/atlas/ocean/mapTree.ts`; `atlasGuard` now checks the v2 fields (in place on the parsed
  payload; a well-formed payload is returned as the same object). Tests: `src/test/ocean/mapTree.test.ts`
  (fixtures, geometry), `mapTree-build.test.ts` (real `content-next` output), `atlas-guard.test.ts`.
- Real output, trusted over the ticket: `main` also has `skerrow-isles > hookhaven` on the ocean
  (the ticket only listed the quessaly branch). `sandbox` is `quessaly-world > oskmark`. No `mirefold` in either.
  No drops and no warnings on either.
- Review additions (coordinator): `parseAtlasProject` now accepts `schemaVersion` up to
  `MAX_ATLAS_SCHEMA_VERSION` (2), so v2 output loads; the build test parses each campaign's real
  `atlas.json` through it unchanged. Rotated fixtures (frame 30 deg, ocean placement 15 deg, and
  the two composed) are in `mapTree.test.ts`. `dropped` stays an id list for tests; the viewer
  should log only its count. `hookhaven` is also absent from `sandbox`'s tree (asserted).
- Fail-closed calls beyond the ticket: a repeated `onOcean` entry (first wins) and an `onOcean` entry
  naming a child are ignored; a top-level map with an unusable placement (non-finite, `scale <= 0`) or
  non-positive size is dropped; a map reusing an id is dropped (first wins); in v2 a map with `parent`
  is never top-level. A malformed `ocean` in the guard is dropped whole (the output then reads as v1);
  malformed `onOcean` entries are filtered one by one.
- `frameOutline` returns `null` for a frame `frameQuads` rejects. `warnings` entries are
  `{ mapId, kind: "aspect-mismatch", message }`. `breadcrumb` of an unknown id is `[]`.
