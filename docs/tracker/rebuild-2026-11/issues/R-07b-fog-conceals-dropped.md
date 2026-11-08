# R-07b Fog shapes (conceals) are dropped by the loader

Status: ready-for-agent
Size: S
Branch: `rebuild-r07b-fog-conceals`
Builder: Opus
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

Found while building R-11b (2026-11-08). No live leak: `content/` has no conceals today. Like R-07,
it must be done before the first real Sync. It can run alongside R-13 (independent of it).

- `scripts/atlas/loadWorldConfig.ts` ~316-322 builds each fog as `{mapId, enabled, color, reveals}` and
  drops `conceals`.
- The editor's Fog tab saves "Fog shapes" as `conceals` (`useFogDraft.ts` ~333).
- So a fog shape the DM draws inside a lit area ships lit: its pins, regions, routes, sound, and the
  map image there unredacted. Affects the build's fog redaction, the v1 adapter (resolver) and the
  fog scan, which all read this loader.

## Fix

Carry `conceals` through the loader (likely `conceals: f.conceals ?? []`), then make sure map
redaction paints conceals, the resolver's `isLit` sees them (it already handles them in tests), and
check 21/15 use them.

## Acceptance criteria

- A conceal inside a reveal hides a pin, region, route, sound area and the image area, with a test
  for each.
- A check-21 variant with a conceal island (R(200,200,210,210) inside area R(100,100,400,400))
  exits 21.
- `npm run gate` passes.
