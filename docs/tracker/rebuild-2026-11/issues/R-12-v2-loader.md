# R-12 v2 loader

Status: ready-for-agent
Blocked by: R-10
Size: M
Branch: `rebuild-r12-v2-loader`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done"): it parses visibility

Load a content root into one in-memory model, whichever schema version it is (ADR-0003). v2 reads
`_atlas/atlas.yaml`, every listed world's `_atlas/world.yaml` and every listed campaign file; v1
reads today's single `world.yaml` (`scripts/atlas/loadWorldConfig.ts`) and presents it as one
world with one campaign, `main`. A mix fails. Can run in parallel with R-11a.

## Acceptance criteria

- One entry point (suggested `scripts/atlas/loadAtlasModel.ts`) taking the content root and the
  config; returns the model plus warnings, or throws a named error.
- Version detection, each with a test:
  - no `_atlas/atlas.yaml`, `world.yaml` with no `schemaVersion` or `1`: v1 (today's
    `content/astrath-deeprealm/_atlas/world.yaml` says `schemaVersion: 1`);
  - `atlas.yaml` plus world files all at `2`: v2;
  - `atlas.yaml` next to a v1 `world.yaml`, a v2 `world.yaml` with no `atlas.yaml`, or a version
    above 2: fails, naming the file. Extend `scripts/atlas/schemaVersion.ts` (today
    `CURRENT_ATLAS_SCHEMA_VERSION = 1` and a stub `MIGRATIONS`) rather than adding a second
    version check; v1 content is not migrated in memory to a v2 file, only presented as the model.
- v1 path: one world (`atlas.config.json` `defaultWorld`), campaign `main`, each map `open`, or
  `fogged` with its v1 fog when enabled; scalar visibilities kept. It reuses or replaces R-11b's
  adapter (one copy only). The v1 world name, when `world.yaml` has no `name:` (today it has none),
  is the world id title-cased ("astrath-deeprealm" gives "Astrath Deeprealm"), so the hard-coded
  fallback at `scripts/build-atlas.ts:1149` can go in R-13 without changing the output.
- v2 cross-file rules (ADR-0003), each failing with the file and path named, each tested: a world
  in `worlds` with no folder; a campaign listed with no file, or a file not listed, or an `id` that
  doesn't match its filename; a duplicate map id across worlds; an unknown `parent`; a parent in
  another world; a cycle; a top-level map missing from `onOcean` or listed twice; an `onOcean`
  entry naming a child map; a per-campaign visibility key that isn't a listed campaign; a campaign
  file naming an unknown map; a v2 note with `atlas.placements` (as decided in ADR-0003).
- Invalid visibility values load as written and produce a warning naming the item; the resolver
  makes them `dm`. Warnings never reach a player artifact (R-06's rule: they go in the build's
  hidden-from-player set when R-13 wires them).
- `loadWorldConfig` keeps working for existing callers (Publish Check, scans, the editor) until
  they move; no existing test changes except where it asserted the old "version above 1" message.
- Fixture content roots under `src/test/fixtures/` (or similar) for v1, v2 and each failing case;
  not `content-next/` (that is R-16).
- `npm run gate` passes; today's build output is unchanged (it still uses the old path until R-13).

## Touches

- New `scripts/atlas/loadAtlasModel.ts` (+ tests), `scripts/atlas/schemaVersion.ts`,
  `scripts/atlas/loadWorldConfig.ts` (only to share code), fixtures.

## Out of scope

- The build using the model (R-13). Writing v2 files (editor, migration R-20).
- JSON schemas for v2 (`schemas/world.schema.json` stays v1).
- Resolving visibility (R-11a).
