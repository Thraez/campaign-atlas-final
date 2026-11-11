# R-33 The player viewer on the shared canvas, with a breadcrumb

Status: ready-for-agent
Blocked by: R-32
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
  `<Select>` kept when there is more than one map, no "Ocean" crumb. The live site must look the
  same: compare the smoke test's render and a preview-pane screenshot of `npm run dev` before and
  after.
- **URL:** the existing params keep working (`map`, `entity`, `cx`, `cy`, `cz`, `src/atlas/deepLink.ts`);
  a v2 ocean view is a URL with no `map` (camera in ocean coordinates). Back/forward
  (`viewerHistory.ts`) steps through handoffs: a handoff pushes a history entry, panning and
  zooming inside a view replace it. A `map` id not in the output opens the ocean (v2) or the
  default map (v1), without saying whether it exists elsewhere.
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
