# Stop the map flying while it has no size

Status: ready-for-agent

Seen once in the preview pane on 2026-10-27, not reproduced in four tries: `Invalid LatLng (NaN, NaN)` from Leaflet's `flyTo` in `MapController` (`src/pages/AtlasViewer.tsx`), which reached the error boundary. Most likely the map flew while its container had zero size (the browser pane was hidden). Not router-related.

## Acceptance criteria

- `MapController` skips (or defers) `flyTo`/`setView` while `map.getSize()` is zero, and flies once the map has a size.
- A test mounts the viewer with a zero-size map container and a selected entity, and no error reaches the boundary.
- Typecheck, lint and test:ci pass.
