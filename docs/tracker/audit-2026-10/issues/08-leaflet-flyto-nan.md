# Stop the map flying while it has no size

Status: done

Seen once in the preview pane on 2026-10-27, not reproduced in four tries: `Invalid LatLng (NaN, NaN)` from Leaflet's `flyTo` in `MapController` (`src/pages/AtlasViewer.tsx`), which reached the error boundary. Most likely the map flew while its container had zero size (the browser pane was hidden). Not router-related.

## Acceptance criteria

- `MapController` skips (or defers) `flyTo`/`setView` while `map.getSize()` is zero, and flies once the map has a size.
- A test mounts the viewer with a zero-size map container and a selected entity, and no error reaches the boundary.
- Typecheck, lint and test:ci pass.

## Comments

- 2026-10-28: MapController checks `map.getSize()`; while zero it waits for Leaflet `resize` (a ResizeObserver on the container calls `invalidateSize`), then flies once. Test in `src/test/pages/AtlasViewer.smoke.test.tsx` (audit-08). Review pending.
- 2026-10-28: The tests use a stand-in, not real Leaflet: react-leaflet is mocked and `flyTo`/`setView`/`fitBounds` are made to throw while `getSize()` is zero. They prove the map never moves at zero size; they do not run Leaflet's own NaN path.
- 2026-10-28: Two-axis review (standards, spec) ran on cc6471b. Fixes: the wait moved into `src/atlas/map/whenMapHasSize.ts` (player-safe), used by `MapController` and `FitBoundsController` (its mount fit had the same NaN path; a fit cancelled at zero size is rescheduled). Small extension of scope: the editor's `FlyTo` in `AtlasPlacementEditor.tsx` uses it too (editor imports player, not the reverse). New tests: target changed at zero size flies only the newest and calls `off("resize")`; reduced motion uses `setView` without animation after the resize; `FitBoundsController` waits for a size. `src/test/map/whenMapHasSize.test.ts` drives the ResizeObserver -> `invalidateSize` -> `resize` route with a captured observer stubbed per test (the global stub in `src/test/setup.ts` is a no-op). Gate: typecheck:all, lint (13 warnings, 0 errors), format:check, test:ci (4 shards), atlas:snapshot, atlas:build:player, build, atlas:scan (all 12 scans clean), atlas:publish:integrity-smoke all pass.
