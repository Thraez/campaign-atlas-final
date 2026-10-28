# Deep links resolve the same way on load and on Back

Status: ready-for-agent
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
