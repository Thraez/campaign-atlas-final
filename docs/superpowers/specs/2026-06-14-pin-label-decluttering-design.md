# Spec — Pin label de-cluttering on crowded maps

**Created:** 2026-06-14 · **Status:** blessed WANT (queue F3; graduated from NICE-TO-HAVE N2) · **Gate:**
standard + a player-build sanity check if the pin render path is shared with the player projection (it is —
see Secrecy).

## Problem

On a map with many pins, every pin **label** renders at once and they overlap into an unreadable smear. The
data already carries `pin.priority` (0..10, higher = more important — see `parsePinStyle` in
`scripts/atlas/parseFrontmatter.ts`); use it to thin labels when a map is crowded so the map stays readable.

## Approach (recommended — bounded; do NOT over-build)

- Thin **labels only** — the pin **markers** always render. This is a display/readability change, never a
  data change.
- Drive label visibility by **zoom × priority**: at lower zoom show only higher-priority labels; reveal more
  as the user zooms in. Simplest effective rule: a per-zoom priority threshold `T(zoom)` — a label shows when
  its `priority >= T(currentZoom)`. Choose `T` so a default world-zoom map isn't crowded but most labels
  appear once zoomed in. Extract the "should this label show at zoom Z given priority P" decision into a
  **pure, unit-tested function**.
- Respect any existing per-pin `labelMode` (e.g. always-show / hover) — an explicit always-show label is not
  thinned.

**Autonomy guard:** if a zoom×priority threshold proves insufficient and it would need true label
**collision detection**, ship the threshold version and hand back the collision-detection upgrade as a
separate follow-up — do not expand scope in this unit.

## Secrecy / safety

Pin labels are already player-visible, so thinning them exposes nothing new. BUT the pin render path is
shared between DM and player views — if any code touched feeds the player build, run `npm run atlas:publish`
(scans) + `atlas:publish:integrity-smoke` as part of the gate. Pure front-end render changes (no build
pipeline) don't need the scans.

## Files (expect)

- The map pin/marker render layer (find the component that renders pins + their labels under `src/atlas/`;
  the `pin.priority` / `labelMode` data comes from `parsePinStyle`).
- A new pure helper (e.g. `src/atlas/<pins>/labelVisibility.ts`) + theme/CSS if labels need a fade.
- A unit test for the pure zoom×priority visibility function.

## Done when

- On a crowded map, only higher-priority labels show when zoomed out; lower-priority labels progressively
  appear when zooming in; **all pin markers always show**.
- A low-pin map looks unchanged (nothing thinned when there's no crowding).
- An explicit always-show label is never hidden.
- The visibility decision is unit-tested; gate green (+ publish scans only if the build path was touched).
  ~1–2 runs.
