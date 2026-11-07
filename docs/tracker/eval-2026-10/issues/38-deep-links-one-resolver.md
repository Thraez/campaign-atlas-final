# Deep links resolve the same way on load and on Back

Status: done
Area: player site (viewer)

Was a parked note; the fifth sweep (2026-10-28) verified it by reading `AtlasViewer.tsx`
~316-381. Load (`attemptLoad`) and Back/Forward (`popStateHandler`) resolve a URL differently,
and `openEntity` (~474-477) is a third rule:
- `?map=B&entity=X` with no center: on load it ignores `map=B`, picks the entity's first
  placement on any map, switches there and flies. On Back it stays on B and doesn't fly. A
  Timeline link to an entity placed on the world map and a city map can open the city map.
- `?map=<invalid>&cx=..&cy=..`: on load it falls back to the default map and flies to those
  coordinates on it; on Back it keeps the current map and doesn't fly.
- A center with no map: on load, the default map; on Back, the current map.
- Phones: on load an entity URL opens the bottom sheet (~358). Back or Forward to an entity entry
  sets `openId` but never opens the sheet (~334 only closes it).

Provisional call (State.md): an entity link with no center uses the URL's map if valid, else the
entity's placement on the default map, else its first placement.

## Acceptance criteria

- One pure `resolveDeepLink(link, project, {currentMapId, defaultMapId, hasDesktopAside})`
  returning `{mapId, openId, fly | null, openSheet}`, called by load and by popstate.
- A table test: each URL above, through load and through popstate, gives the same result.
- On phones, Back and Forward to an entity entry open the sheet.
- Check that the raw `pushState(null)` and `replaceState(null)` calls don't break react-router's
  history index; replace them if they do.
- Build after the open viewer PRs merge (#64, #67, #69, #70, #78): they all edit
  `AtlasViewer.tsx`, though none of them these lines.

## Comments

- 2026-11-07: Done. `src/atlas/resolveDeepLink.ts` is the one rule; `AtlasViewer` calls it from
  load and popstate (`applyUrl`), and `openEntity` resolves `{active map, entity, no center}`
  through it, so clicking an entity and reloading its URL fly the same way. The sheet state is
  set from `openSheet` on both paths, so Back/Forward to an entity entry on a phone opens it.
  Tests: `src/test/resolve-deep-link.test.ts` (table, both paths, phone and desktop),
  `src/test/pages/AtlasViewer.deepLinks.test.tsx` (real viewer, load vs Back; all fail on the
  old code), `src/test/viewer-history.test.tsx`.
- Provisional calls: an invalid or absent map with a center goes to the default map and flies to
  the center (what load already did); an entity link with a center but no valid map does the
  same; an entity link on a valid map it isn't placed on stays on that map without flying.
  `currentMapId` is used only if the default map is missing.
- History: raw `pushState(null)`/`replaceState(null)` did break react-router's index (the
  router's next push counted from `null`; the test shows it). `src/atlas/viewerHistory.ts` now
  keeps the router's `{usr, key, idx}` (replace keeps it, push bumps `idx` with a fresh key).
  Router `navigate` was not used: it would re-render the route tree on every pan and the viewer
  tests run under `MemoryRouter`.
