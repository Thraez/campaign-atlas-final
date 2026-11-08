# R-12 v2 loader

Status: in-review
Blocked by: R-10
Size: M
Branch: `rebuild-r12-v2-loader`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done"): it parses visibility

Load a content root into one in-memory model, whichever schema version it is (ADR-0003). v2 reads
`_atlas/atlas.yaml`, every listed world's `_atlas/world.yaml` and every listed campaign file; v1
reads today's single `world.yaml` (`scripts/atlas/loadWorldConfig.ts`) and presents it as one
world with one campaign, `main`, through the one v1 adapter, which this ticket owns. A mix fails.
Can run in parallel with R-11a; R-11b and R-11c wait for both.

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
- The v1 adapter: one pure module in `src/atlas/content/` (suggested
  `src/atlas/content/v1Model.ts`), so both `scripts/` and `validateProject`
  (`src/atlas/yaml/validateProject.ts`, compiled by `tsconfig.app.json`, which includes only `src/`)
  can import it. Its input is a minimal v1 shape defined in `src/atlas/content/` (today's
  `WorldConfig` lives in `scripts/atlas/loadWorldConfig.ts:141`, out of the app's reach; move the
  needed part of the type or define the minimal input, and have both callers map into it). Output:
  one world (`atlas.config.json` `defaultWorld`), campaign `main` with `notes: vault`, each map
  `open`, or `fogged` with its v1 fog when enabled; scalar visibilities kept; no `notes:` entries.
  This is the only place those v1 rules are written; a test pins each. The v1 world name, when `world.yaml` has no `name:` (today it has none),
  is the world id title-cased ("astrath-deeprealm" gives "Astrath Deeprealm"), so the hard-coded
  fallback at `scripts/build-atlas.ts:1149` can go in R-13 without changing the output.
- v2 cross-file rules (ADR-0003), each failing with the file and path named, each tested: a world
  in `worlds` with no folder; a campaign listed with no file, or a file not listed, or an `id` that
  doesn't match its filename; a duplicate map id across worlds; an unknown `parent`; a parent in
  another world; a cycle; a top-level map missing from `onOcean` or listed twice; an `onOcean`
  entry naming a child map; a per-campaign visibility key that isn't a listed campaign; a campaign
  file naming an unknown map; a v2 note with `atlas.placements` (as decided in ADR-0003).
- Invalid visibility values load as written and produce a warning naming the item; the resolver
  makes them `dm`.
- A campaign file with no `notes:` field loads as `notes: hidden` (fail closed, ADR-0004 question 5),
  with a warning naming the file. Warnings never reach a player artifact (R-06's rule: they go in the build's
  hidden-from-player set when R-13 wires them).
- `loadWorldConfig` keeps working for existing callers (Publish Check, scans, the editor) until
  they move; no existing test changes except where it asserted the old "version above 1" message.
- Fixture content roots under `src/test/fixtures/` (or similar) for v1, v2 and each failing case;
  not `content-next/` (that is R-16).
- `npm run gate` passes; today's build output is unchanged (it still uses the old path until R-13).

## Touches

- New `src/atlas/content/v1Model.ts` (+ test), new `scripts/atlas/loadAtlasModel.ts` (+ tests),
  `scripts/atlas/schemaVersion.ts`,
  `scripts/atlas/loadWorldConfig.ts` (only to share code), fixtures.

## Out of scope

- The build using the model (R-13). Writing v2 files (editor, migration R-20).
- JSON schemas for v2 (`schemas/world.schema.json` stays v1).
- Resolving visibility (R-11a).

## Notes from the build

What landed:

- `scripts/atlas/loadAtlasModel.ts` is the one entry point: `loadAtlasModel(contentRoot,
  {defaultWorld}, {root?})` returns `{model, warnings}` or throws `AtlasModelError`, whose
  `issues` name the file and path of every problem at once.
- `src/atlas/content/atlasModel.ts` holds the model types and the error; `v1Model.ts` is the v1
  adapter (pure, input `V1WorldInput` defined in `src/`); `v2Model.ts` is the pure cross-file
  check. `scripts/atlas/schemaVersion.ts` gained `readSchemaVersion`, the one version check
  (missing, not a positive integer, above 2); the v1 path through `resolveAndMigrate` now refuses
  version 2 with a message pointing at `loadAtlasModel`. `CURRENT_ATLAS_SCHEMA_VERSION` stays 1;
  no existing test changed.
- Tests: `src/atlas/content/v1Model.test.ts` (19) and `scripts/atlas/loadAtlasModel.test.ts`
  (37), including a round trip of today's `world.yaml` and of the v1 fixture against
  `loadWorldConfig`'s output.

Decisions (fail-closed where the ticket was open):

- v1 maps get map visibility `player` (they have none and always ship today; matches R-20's
  `{main: player}`) and the viewer's zoom range, -6..4. The v1 campaign is named "Main".
- v1 fog colour is dropped (v2 has none); `conceals` and `featherPx` are carried when present,
  though `loadWorldConfig` drops them today.
- v2 has one world-level `water`; v1 maps whose water differs (absent next to present counts) are
  refused, naming both maps, rather than one picked silently. R-20 must do the same.
- The no-`world.yaml` fallback map (`<world>-overview`) moved into the adapter. The adapter also
  takes v1 pins (no map id: the first map); `loadAtlasModel` reads them from the notes (see
  below).
- Invalid visibility is kept as written with a warning; a non-string one in the v1 adapter loads
  as `dm`. Warnings come back separately so R-13 can put them in the hidden-from-player set.
- Beyond the ticket's list, also refused: a world id that doesn't match its folder; an unlisted
  v2 world folder; a listed world folder with no `world.yaml`; `atlas.yml` and campaign `.yml`
  files; duplicate entries in `worlds`/`campaigns`; ids that aren't safe path segments; campaign
  files or a v2 `world.yaml` (in any folder) with no `atlas.yaml`; legacy `atlas.x`/`atlas.y` and
  unreadable frontmatter in v2 notes (so a pin can't hide behind a parse error); `atlas.yaml`
  without `schemaVersion: 2`.

Deviations:

- Fixture roots are committed for v1, v2, both mixes and version 3
  (`src/test/fixtures/atlas-model/`); each cross-file failure mutates a temp copy of the v2 root
  in its test instead of a committed root per case.
- `validateProject` doesn't call the adapter yet; it can import it (everything is in `src/`).
  Wiring it is left to the ticket that moves validation onto the model.

After the safety review (no leaks; two should-fixes and nits, all fixed):

- v1 fog with no `enabled` field is now `fogged` (fail closed), as `loadWorldConfig` reads it;
  only `enabled: false` is open. Tested.
- The loader returns the notes the build reads (`notes: ModelNote[]`, each `{world, file,
  note}` with `readNote`'s note: id, title, aliases, visibility, `atlas`), read through
  `scanContentFolder` with the config's `include`/`exclude`, so folder-excluded notes (`_dm/`)
  are left out. Their world: v1, the default world (as the build does); v2, the note's top-level
  folder, or `""` at the root (no known world, so it ships nowhere). The v2 pin check still sees
  every note, excluded ones too.
- v1 pins: each read note's `atlas.placements` (legacy `atlas.x`/`y` when it has none) comes
  through the adapter as pins on their maps, with the note's visibility (as R-20 writes them).
  A placement behind a secret (`secretId`) loads as `dm` with a warning: the model has no secret
  locks. `label` and pin style have no v2 field and are dropped. Tested by a round trip on
  today's content against the build's own reading (six placed notes) and on the v1 fixture.
- Symlinks: a symlinked note or folder anywhere in the content root is refused (this also covers a
  symlinked world folder); a symlinked campaign file says it is a symlink; a world.yaml that is a
  symlink or resolves outside the root is refused; so is a symlinked atlas.yaml. Tested.
- `atlasModel.ts` is the canonical model: R-11a's resolver will type on `WorldModel`/`MapModel`
  (and take `ModelNote`s) after this merges; R-11a's own types were not changed here.
- R-20's ticket now says a water block on one map and none on another is refused, that a v1 map
  with no `scale` needs one supplied (or a refusal), and how secret/label/style placements map.
- Open for R-13: v1 pins behind a password secret ship today but load as `dm` here, so wiring the
  build onto the model must decide them before claiming unchanged output.
