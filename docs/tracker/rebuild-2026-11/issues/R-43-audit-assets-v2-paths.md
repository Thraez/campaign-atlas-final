# R-43 audit-assets resolves v2 world image paths

Status: ready-for-agent
Blocked by: -
Size: S
Branch: `rebuild-r43-audit-assets-v2`
Model: Opus (`scripts/`)

Found by the R-36 Phase 3 check. Every `atlas:publish:next` prints 8 `BROKEN REF (info)` lines for
images that exist (`mirefold.png`, `skerrow-isles.png`, `hookhaven.png`, ...). The scan does walk the
campaign's `assets/` (`scanRegistry.ts`, the `audit-assets` task); the cause is the references: a v2
`world.yaml` layer `src` is relative to the world's `_atlas/` folder (e.g. `images/mirefold.png`,
`content-next/quessaly/_atlas/world.yaml:142`), and `collectReferences` (`audit-assets.ts`, the
`extractWorldYamlLayerSrcs` loop) normalises it as given and never resolves it against that folder, so
it never matches the shipped asset's path. The same gap can make real assets read as ORPHAN. The lines
are info only (build-atlas is the authority), but a real missing image would hide among them.

## Acceptance criteria

- `collectReferences` resolves a v2 world's layer `src` the way the build does (relative to the world's
  `_atlas/`), so on the test world the 8 lines are gone and no asset reads ORPHAN wrongly.
- A genuinely missing image on the test world still shows a BROKEN REF (test with a fixture).
- v1 `content/` output is unchanged.
- `atlas:publish:next` prints no BROKEN REF for `content-next/`.

## Touches

`scripts/atlas/audit-assets.ts` and its test.
