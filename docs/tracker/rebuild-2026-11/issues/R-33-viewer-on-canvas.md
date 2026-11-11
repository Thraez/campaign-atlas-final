# R-33 The player viewer on the shared canvas, with a breadcrumb

Status: in-review
Blocked by: R-32, R-34
Size: M
Branch: `rebuild-r33-viewer-on-canvas`
Model: Sonnet (settled plan)
Needs: the adversarial player-safety review: it changes what the player page reads and links to

Move `src/pages/AtlasViewer.tsx` onto `AtlasCanvas` (R-31, R-32). The flat map `<Select>`
(~636-652) and the `worlds[0]` uses (~279, ~351-353) go for v2 output; v1 output looks as today.

## Acceptance criteria

- **v2 output** (`project.ocean` present): the page opens on the ocean (P1) fitted to every
  top-level map; zooming or clicking enters maps (R-32); a breadcrumb top-left reads
  "Ocean > <map> > <child>", each crumb clickable (back to that level, at the spot the user left
  it, else fitted). The flat `<Select>` is gone. Credits and asset credits come from the world of
  the map in view (`map.worldId`), on the ocean from every world in the output. The site name stays
  `campaign.name`.
- **v1 output** (no `ocean`): one top-level map per v1 map, opened on the default map fitted, the
  `<Select>` kept when there is more than one map, no "Ocean" crumb. Merging publishes, so the live
  site must look the same: before any change, take baseline screenshots on `main` of the player
  build of `content/` (`atlas-pages-preview` in `.claude/launch.json`, desktop and 375 px), record
  their paths in the ticket, and compare after; the smoke test's v1 render is unchanged too.
- The P1 corner: a legend line ("▭ map: zoom in or click") and zoom controls (+, −, fit) on v2
  views (player wireframe).
- **URL:** the existing params keep working (`map`, `entity`, `cx`, `cy`, `cz`, `src/atlas/deepLink.ts`);
  a v2 ocean view is a URL with no `map` (camera in ocean coordinates). Back/forward
  (`viewerHistory.ts`) steps through handoffs: a handoff pushes a history entry, panning and
  zooming inside a view replace it. A `map` id not in the output opens the ocean (v2) or the
  default map (v1), ignoring `cx`/`cy`/`cz`, without saying whether it exists elsewhere.
- Check on R-34's server, both campaigns, desktop and 375 px.
- `resolveDeepLink` picks the map for an `entity` link from its placements as today; on v2 it may
  land on a child map (no cross-map fly yet, phase 5).
- Pins, regions, routes, fog, sound and the ruler still work on a map view (they are `WrappedWorld`
  and controllers passed as canvas children). The minimap shows only on map views.
- Phone width (P7): the breadcrumb and search share one top bar; pinch enters child maps. Check at
  375 px in the preview pane.
- Tests: `AtlasViewer.smoke.test.tsx` and `AtlasViewer.deepLinks.test.tsx` gain v2 cases on the
  test-world output (both campaigns: the breadcrumb, no `sandbox` crumb or frame for
  `tallowford`, `brindlecross` or `skerrow-isles`); every existing v1 case still passes unchanged.
- No new data reaches the page: the viewer reads only `atlas.json` fields that already ship; no
  build change.
- `npm run gate` passes.

## Touches

`src/pages/AtlasViewer.tsx`, `src/atlas/deepLink.ts`, `src/atlas/resolveDeepLink.ts`,
`src/atlas/viewerHistory.ts`, a breadcrumb component, viewer tests.

## Out of scope

Campaign param in links and the local campaign picker (R-34, R-35), region cards and the story
panel (phase 5), the new deep-link names (`note`, `x`, `y`, `z`) from ux-flows p5 (phase 5).

## Build notes (2026-11-11)

**Screenshots** (gitignored, in the worktree `.claude/worktrees/r33/previews/`): v1 player build of
`content/` at `ATLAS_BASE=/campaign-atlas-final/` on `npm run preview`, desktop 1280x800 and 375 wide:
- `r33-baseline/` (before any change) and `r33-after/`: `atlas`, `atlas-cam` (`?map=...&cx&cy&cz`),
  `atlas-unknownmap` (`?map=nope...`), `atlas-entity` (`?entity=...`), each `-desktop.png` and `-mobile.png`.
- Verdict: they look the same by eye (map, pins, aside, toolbar, scale bar, minimap; only the animated
  sea differs in bytes). `content/` has one map, so no Select shows in either set.
- `r33-v2/` on R-34's server (`atlas:publish:next`, `atlas:serve:next`): `main-ocean`, `main-oskmark`
  (Ocean > Quessaly > Oskmark), `sandbox-ocean`, `sandbox-quessaly`, desktop and mobile.

**Approach.** v2 output (`tree.ocean`) renders through `AtlasCanvas`; the viewer keeps the pins, regions,
routes, fog, sound, ruler, scale bar and minimap as canvas children (map views only; `WrappedWorld` with
`showImageLayers={false}`). v1 output keeps its own `MapContainer` path unchanged (provisional call:
the canvas sets `zoomSnap` 0 and has no max-bounds, which would change v1's feel and its existing
smoke-test assertions on `fitBounds`/`setMaxBounds`/`flyTo`; v1 "one top-level map per v1 map" holds via
`buildMapTree`). The map layers are one shared fragment for both paths.
- `src/pages/AtlasViewer.tsx`: state holds `{project, tree}`; `activeMapId` null = the ocean (v2); a
  `camera` ("fit" or explicit) feeds the canvas; `goView` is the one way to change view; the last camera
  of each view is remembered for the crumbs. Handoffs, click-enters and crumb clicks push a history
  entry; the canvas's camera reports only replace. Credits and asset credits come from the map's world
  (`map.worldId`), on the ocean from all worlds; header and panel show `campaign.name`. Select only on v1.
- `src/atlas/resolveDeepLink.ts`: optional `ocean` option. No `map` is the ocean (camera kept); a `map`
  id not in the tree opens the ocean and drops `cx/cy/cz`; an entity link lands on its placement's map
  (a child too). v1 behaviour unchanged.
- `src/atlas/map/MapBreadcrumb.tsx` (new), `src/atlas/map/viewCredits.ts` (new).
- `deepLink.ts` and `viewerHistory.ts` needed no change.
- Tests: `src/test/pages/AtlasViewer.v2.test.tsx` (built test world, both campaigns: crumbs, no Select,
  ocean frames, no sandbox crumb or frame for tallowford/brindlecross/skerrow-isles, click enter and
  Back, crumb push, unknown map, ocean camera, popstate) and `src/test/resolve-deep-link-v2.test.ts`.
  Existing viewer, deep-link, canvas and region/ruler tests pass unchanged.

**Provisional calls.**
- v1 keeps its own map container (above).
- Phone (P7): the breadcrumb wraps onto its own line of the toolbar (the toolbar has no room for it at
  375 px, and the search button wraps too); not one shared line with search.
- The P1 corner is the legend line (top-left, beside Leaflet's +/-) plus the existing "Reset map view"
  button as the fit control (bottom-right). It shows on the ocean and on maps with child frames.
- The ocean fit has no margin (the placed maps touch the edges, Skerrow Isles runs under the aside edge
  on main at 1280 wide); a margin belongs in the canvas fit, not done here.
- Search on the ocean offers every placement; picking one enters that map.
- Accepted as provisional (review): v1 keeps its own `MapContainer`; fit is the Reset button plus
  Leaflet's +/-; the breadcrumb wraps onto its own line on a phone; search on the ocean as above.
- The ocean-fit margin is a follow-up for R-31's fit, not R-33.
- Fixed after review: the ruler's crosshair now shows on the v2 canvas (`className="atlas-ruler"` on
  the canvas, `.atlas-ruler .leaflet-container{cursor:crosshair}` in `index.css`; a wrapper cursor alone
  loses to Leaflet's grab cursor). `showPlacement` on v2 pushes history only when the map changes (a spot
  on the map in view is a pan and replaces). The `ocean` resolver option and the keep-zoom rule are built
  once (`oceanOption`, `keepZoom`).

**Review round.** The sandbox test now opens `?map=oskmark` (crumbs Ocean > Quessaly > Oskmark, no frame
label or text for Brindlecross, Tallowford or Skerrow, case-insensitive), the sandbox ocean frames exactly
Quessaly, `?map=tallowford` on sandbox opens the ocean, and a main control case shows the same assertions
do see Brindlecross and Tallowford. New viewer tests fire the canvas's `onViewChange`/`onCameraChange`
props: a handoff pushes, pan and zoom replace, a crumb returns to the remembered camera (fitted when the
view was never visited). Real browser on `atlas:serve:next` (main): a wheel from the ocean over Quessaly
crosses the thresholds in one gesture and lands on Oskmark (one history entry, crumbs Ocean > Quessaly >
Oskmark); wheel out steps Oskmark > Quessaly > Ocean (one entry each); Back goes Quessaly then Oskmark,
Forward goes Quessaly then Ocean, each with its own camera in the URL; the Quessaly crumb lands fitted
(never visited), and the Ocean crumb returns to the ocean camera the user left (cz -0.3 at 1150,700).

**Checked:** typecheck:all, lint, the page, canvas and deep-link tests, publish:next (44 scans clean),
real-browser click-enter / crumb / Back on `main`. **Not checked:** wheel handoff in the viewer by hand,
`npm run gate`, touch pinch.
