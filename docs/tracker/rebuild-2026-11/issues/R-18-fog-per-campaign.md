# R-18 Fog baked per campaign; fog scan source-driven

Status: done
Blocked by: R-17, R-17b
Size: M
Branch: `rebuild-r18-campaign-fog`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

Fog is per campaign (ADR-0003: in campaign files). Bake each campaign's fog into its own copy of
each fogged map's image, in its own output. And make the fog scan source-driven: today
`scripts/check-fog-safety.ts` decides which maps to check from the artifact
(`atlas.maps.filter((m) => m.fog?.enabled)`, ~171), so an output that forgot to mark a map fogged
passes, and it loads only `defaultWorld`'s source fog (~142-160). It must check every map that the
campaign's source says is fogged.

## Acceptance criteria

- For each campaign and each map whose state is `fogged` in that campaign's file, the build bakes
  that campaign's reveals, conceals and `featherPx` into the map's layers with the existing
  redaction (`redactLayer` in `scripts/atlas/redactFogMap.ts`, called from `redactMapsForPlayer`
  ~1366 in `build-atlas.ts`), writes the result only into that campaign's asset dir, and never
  ships the unfogged original there. Maps stay lossless (`maps:optimize` and
  `src/atlas/assets/imageEncoding.ts` own format and naming; import them).
- The same map fogged in campaign A and open in campaign B: A's output has only the fogged image,
  B's only the full one; neither dir holds the other's file (test, comparing bytes).
- The fog scan takes the source per campaign: for campaign C it loads C's campaign file through the
  R-12 loader, and every map fogged there must appear fogged in C's output (redacted image, no
  original, no fog geometry, nothing that ships under fog: pins, regions, routes, frames, sound
  areas). A child map whose frame has any part of its area under the parent's fog in C must be absent from
  C's output with its whole subtree (ADR-0004 rule 4): no map entry, no image, none of its items;
  the scan computes this from source, not from the output. A map fogged in source but not in the output fails with a new exit code. In publish mode,
  source fog that can't be loaded (missing or broken campaign file, missing config) fails; it no
  longer counts as a "configless run" (exit 0 today, header of `check-fog-safety.ts`).
- v1: campaign `main`'s fog is the v1 `world.yaml` fog; today's checks keep passing on `content/`
  (it has no fog today) and on the existing fog fixtures.
- Integrity-smoke variants (`scripts/atlas/publish-integrity-smoke.ts`): an output whose
  `atlas.json` drops a source-fogged map's fog marker fails; one holding another campaign's
  unfogged image fails.
- Tests on `content-next/`: the pin under one campaign's fog is absent from that campaign's
  `atlas.json` and search index, present in the other's. A city whose frame is under fog on a
  fogged parent ships nothing to that campaign (no map entry, image, pin, region, route or sound
  area of it or its children), and ships in full to the campaign where the parent is open. An
  integrity-smoke variant that plants that city's map entry back into the fogged campaign's
  `atlas.json` fails the fog scan.
- `npm run gate` passes.

## Touches

- `scripts/build-atlas.ts` (fog stage), `scripts/atlas/redactFogMap.ts` (only if it needs the
  campaign's output dir), `scripts/check-fog-safety.ts`, `scripts/atlas/scanRegistry.ts`,
  `scripts/atlas/publish-integrity-smoke.ts`, tests, `docs/VISIBILITY_AND_PLAYER_SAFETY.md`.

## Out of scope

- Tiles (phase T replaces the fog scan's image check in its own PR).
- Fog drawing in the new editor (E7, phase 6). `MapDocument.fog` removal (retire).
