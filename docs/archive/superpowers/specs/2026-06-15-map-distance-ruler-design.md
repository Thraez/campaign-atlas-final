# Spec — Map distance ruler (tape measure)

**Created:** 2026-06-15 · **Status:** blessed WANT (queue I2) · **Gate:** standard (tests + tsc + eslint;
no build-pipeline change — pure client-side UI in both viewers).

## Problem

There is no way to measure the distance between two points on a map. The only
distance information today is on routes (rendered in their hover tooltip using
`map.scale.unitsPerPixel`). A DM or player who wants to know how far apart two
locations are must estimate by eye or by placing a throwaway route — neither is
acceptable UX. A simple click-two-points tape measure closes this gap in under
two routine runs.

## Key grounding (verified 2026-06-15)

- **Scale data already ships to both viewers.** `MapDocument.scale` (`MapScale`:
  `unitsPerPixel: number`, `unitLabel: string`) is defined in
  `src/atlas/content/schema.ts` (L78–81), parsed and sanitised by
  `sanitizeScale` in `scripts/atlas/loadWorldConfig.ts` (L323–329), and present
  in the player `public/atlas/atlas.json`. The player viewer reads it today in
  `AtlasViewer.tsx` (L540–541) to format route distance labels.
- **Click → atlas coordinate is a solved problem.** Both viewers use Leaflet
  with `L.CRS.Simple` (a flat coordinate system). A click event exposes
  `e.latlng.{lat, lng}` where `lng = atlas-x` and `lat = mapHeight - atlas-y`.
  The editor already captures this via `MapClickCapture` (`useMapEvents`,
  `AtlasPlacementEditor.tsx` L134–141) and converts via the pure function
  `mapClickToAtlasCoord(lng, lat, mapHeight)` (`src/atlas/editor/mapClickCoord.ts`).
  The player viewer does not yet capture clicks; it will need a `useMapEvents`
  hook for the ruler mode only (identical pattern to the editor).
- **No existing ruler.** Grepping `measureDistance`, `RulerLayer`, `ruler` across
  `src/` returns zero hits — this is net-new code.
- **Pixel distance formula.** Given two atlas points `(x1,y1)` and `(x2,y2)`,
  pixel distance = `Math.hypot(x2 - x1, y2 - y1)` (same formula already used
  for route distance in `routeDistancePx` at `AtlasViewer.tsx` L65–72). World
  distance = `distPx * scale.unitsPerPixel`.

## Goal

Click once on the map to drop the first point; click again to anchor the second.
The map shows a line between them and a label reading e.g. **"12.3 mi"**. A
clear-button or second ruler activation dismisses the measurement. Works
identically in the player viewer (`AtlasViewer`) and the DM editor
(`AtlasPlacementEditor`). No travel-time calculation; no multi-segment path; no
snap-to-pin. Straight-line distance only.

## Approach

### Pure helper: `measureDistance`

Add `src/atlas/ruler/measureDistance.ts` — a pure function with no DOM or React
dependencies:

```ts
// Returns world-unit distance between two atlas pixel points, or null when
// scale is absent (caller renders "? px" fallback).
export function measureDistance(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  scale: { unitsPerPixel: number; unitLabel: string } | undefined
): { distPx: number; label: string } {
  const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const label = scale
    ? `${(distPx * scale.unitsPerPixel).toFixed(1)} ${scale.unitLabel}`
    : `${Math.round(distPx)} px`;
  return { distPx, label };
}
```

Unit-test in `src/test/ruler/measureDistance.test.ts`: known triangle, zero
distance, missing scale (px fallback), large map.

### `RulerLayer` component

New `src/atlas/ruler/RulerLayer.tsx` — a react-leaflet child component (mounts
inside `<MapContainer>`, returns `null` for DOM, uses `useMapEvents`):

**Props:**
```ts
interface RulerLayerProps {
  active: boolean;              // ruler mode on/off
  mapHeight: number;            // needed for lat↔y flip
  scale?: MapScale;             // from MapDocument.scale
  onClear?: () => void;         // called when the layer self-clears (second click lands)
}
```

**State machine (inside the component):**
- `idle` — `active=false`; do nothing; if transitioning from active, clear any
  drawn line/marker.
- `waiting-first` — `active=true`, no clicks yet; cursor changes to crosshair
  (via Leaflet's map container class).
- `has-first` — first point placed; Leaflet `CircleMarker` rendered at P1.
- `has-both` — second point placed; `Polyline` P1→P2 + mid-point `Tooltip` with
  the distance label rendered. Calls `onClear` to signal the parent that
  measurement is displayed (parent may reset `active` or leave it for the user
  to dismiss manually — see UX below).

Coordinate conversion: `const { x, y } = mapClickToAtlasCoord(e.latlng.lng, e.latlng.lat, mapHeight)` — reuse the existing pure function from `src/atlas/editor/mapClickCoord.ts` rather than duplicating the arithmetic.

When `active` flips to `false` from the outside, the component clears its
internal state and removes the drawn elements.

**Styling:** use the same palette as routes — a dashed white/amber `Polyline`
(`weight:2`, `dashArray:"6 4"`, `opacity:0.9`) and a small `CircleMarker`
(`radius:5`) at each endpoint; mid-point permanent `Tooltip` in the same `text-xs`
style used by route tooltips. `interactive:false` on the Polyline so it does not
intercept pin clicks.

### Ruler activation button

A ruler icon button (`Ruler` from `lucide-react`) in both toolbars:

- **`AtlasViewer.tsx` toolbar** (header, alongside the grid toggle at L319–330):
  a `Button variant="ghost" size="sm"` that toggles `rulerActive` state. When
  active, the button style matches the active grid button (`variant="secondary"`).
  Add `<RulerLayer>` inside `<MapContainer>` after `<MapController>`.

- **`AtlasPlacementEditor.tsx` toolbar**: same button pattern. The ruler must
  deactivate automatically when the user enters pin-placement mode (`pendingId`
  set) or drawing mode, since those modes also capture map clicks — prevent
  double-capture by checking `active && !pendingId && !regionDraft.drawing` in
  the `RulerLayer`'s click handler, or by clearing `rulerActive` in the existing
  mode-change paths. The simpler approach: `active` prop is
  `rulerActive && !pendingId && !regionDraft.drawing`, so the editor parent
  already gates it.

**Dismiss (clear) affordance:**

Two clear paths — either is sufficient; implement both:
1. Clicking the ruler button again when it is already active clears and
   deactivates.
2. When both points are set, the Polyline/Tooltip persists until the button is
   toggled off (or another map mode is activated). No auto-dismiss — the DM may
   want to read the label before clearing.

**No-scale fallback:** when `map.scale` is absent, the label renders
`"NNN px"`. This is honest and matches the existing route behavior. No error
state needed.

**wrapX maps:** the `AtlasViewer` renders `WrappedWorld` at offsets `-W, 0, +W`
when `map.wrapX` is true. The `RulerLayer` captures raw `latlng` from the map;
normalize `lng` into `[0, map.width)` before computing the atlas x-coordinate:
`const nx = ((e.latlng.lng % map.width) + map.width) % map.width`. Pass
`map.wrapX` and `map.width` as props for this guard. For non-wrapping maps (the
common case) this is a no-op.

## Secrecy

None. Pure geometry on pixel coordinates. `MapScale` carries no DM content —
it is world-level theme data equivalent to `oceanColor`. The ruler renders
entirely in the client; it writes nothing to `atlas.json` or any saved state.
Works identically in player and DM views. No redaction functions are called or
bypassed. No leak-regression test required (there is nothing to leak).

## Files

- **New:** `src/atlas/ruler/measureDistance.ts` — pure distance helper.
- **New:** `src/atlas/ruler/RulerLayer.tsx` — react-leaflet component (both viewers).
- **Changed:** `src/pages/AtlasViewer.tsx` — ruler button in toolbar; `<RulerLayer>` inside `<MapContainer>`; `rulerActive` state.
- **Changed:** `src/pages/AtlasPlacementEditor.tsx` — ruler button in toolbar; `<RulerLayer>` inside `<MapContainer>`; `rulerActive` state; gate `active` prop against `pendingId`/`regionDraft.drawing`.
- **New:** `src/test/ruler/measureDistance.test.ts` — unit tests for the pure helper.

No `scripts/`, `vite.config.ts`, `build-atlas.ts`, or schema changes. Standard
gate only.

## Autonomy guard

The feature scope is intentionally narrow. Do NOT expand to:
- Multi-segment path measurement (not a route builder).
- Travel-time / mount speed calculation (explicitly a non-goal per the item spec
  and `docs/NON_GOALS.md`).
- Snap-to-pin on click.
- A persistent saved ruler stored in `world.yaml` or `atlas.json`.

If integrating `RulerLayer` into the editor's existing click-capture chain turns
out to conflict with `MapClickCapture` in a way that requires architectural
changes to the editor's mode system, ship the ruler in `AtlasViewer` only and
hand back the editor integration — do not refactor the mode system mid-run.

## Done when

- Clicking the ruler button in the player viewer (`AtlasViewer`) toggles ruler
  mode; clicking two map points shows a dashed line and a distance label (e.g.
  "12.3 mi" or "NNN px" when scale is absent); clicking the button again clears
  and exits ruler mode.
- Same behavior in the DM editor (`AtlasPlacementEditor`); ruler auto-deactivates
  when pin-placement or drawing mode is entered.
- `measureDistance` unit tests cover: known triangle, zero distance, no-scale
  fallback, large coordinate values.
- Gate green: tsc clean, eslint clean, all tests green (sharded vitest). No
  build-pipeline change. ~1–2 runs.
