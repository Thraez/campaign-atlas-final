# R-07b Fog shapes (conceals) are dropped by the loader

Status: done
Size: S
Branch: `rebuild-r07b-fog-conceals`
Builder: Opus
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

Found while building R-11b (2026-11-08). No live leak: `content/` has no conceals today. Like R-07,
it must be done before the first real Sync. It can run alongside R-13 (independent of it).

- `scripts/atlas/loadWorldConfig.ts` ~316-322 builds each fog as `{mapId, enabled, color, reveals}` and
  drops `conceals`.
- The editor's Fog tab saves "Fog shapes" as `conceals` (`useFogDraft.ts` ~333).
- The loader also drops `featherPx`; carry it through too (not a safety issue).
- So a fog shape the DM draws inside a lit area ships lit: its pins, regions, routes, sound, and the
  map image there unredacted. Affects the build's fog redaction, the v1 adapter (resolver) and the
  fog scan, which all read this loader.

## Fix

Carry `conceals` through the loader (likely `conceals: f.conceals ?? []`), then make sure map
redaction paints conceals, the resolver's `isLit` sees them (it already handles them in tests), and
check 21/15 use them (`scripts/check-fog-safety.ts` tests source points with `isLit` against
the loaded fog, so both only see conceals once the loader carries them).

## Acceptance criteria

- A conceal inside a reveal hides a pin, region, route, sound area and the image area, with a test
  for each.
- A check-15 variant: a pin, region point or route point inside a conceal island of a lit area
  exits 15 when shipped.
- A check-21 variant with a sound-only area and a conceal island (R(200,200,210,210) inside area R(100,100,400,400))
  exits 21.
- `npm run gate` passes.

## Done

Conceals and `featherPx` are kept by the loader. The fog mask is built in image pixel space via the
layer rect, and alpha = min(source, mask). The loader fails closed on duplicate fog blocks,
`featherPx` above 2000, and degenerate or malformed fog shapes or reveals. A rotated layer makes
fog redaction throw.
