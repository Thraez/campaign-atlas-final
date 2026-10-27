# Map space module owns the coordinate flip

Status: wontfix
Area: map layers

Retro candidate 5. About 20 hand-written `H - y` sites bypass `src/atlas/map/coords.ts`. Deferred by Isak on 2026-10-27; reopen if a pin or click lands in the wrong place.

## Acceptance criteria (when reopened)

- A round-trip property test for atlas space and Leaflet space.
- For each layer, a click at atlas (x, y) is stored as (x, y).
- No `height -` outside `src/atlas/map/`.
