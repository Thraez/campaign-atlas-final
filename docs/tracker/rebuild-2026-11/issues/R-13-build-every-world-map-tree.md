# R-13 Build assembles every world and the map tree

Status: ready-for-agent
Blocked by: R-11b, R-12
Size: M
Branch: `rebuild-r13-build-worlds-tree`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done"): it reshapes the player build

`scripts/build-atlas.ts` builds only `cfg.defaultWorld` (`loadWorldConfig(contentDir,
cfg.defaultWorld, ROOT)` at ~489, `const worldId = cfg.defaultWorld` at ~737, one entry in
`worlds:` at ~1145-1156 with the `"Astrath Deeprealm"` fallback at ~1149). Split the world assembly
(from ~737 to the `project` object at ~1143) into stages that take R-12's model and loop over every
world and the map tree, and emit the v2 output additions of ADR-0003. Still one output per run (for
campaign `main` on v1); several campaigns come in R-17.

## Acceptance criteria

- The build reads the model from R-12's loader, for v1 and v2 alike; `loadWorldConfig` is no
  longer called by the build.
- World assembly is split into named stages (suggested: load model, read notes, resolve campaign,
  assemble maps and items per world, assets, search index, write), each a function in its own
  module or clearly separated in `build-atlas.ts`; no stage reads `cfg.defaultWorld`.
- Entities carry the world of the folder they live in (`content/<world>/`); today
  `atlas.world ?? opts.defaultWorld` (~1291). A note whose `atlas.world` disagrees with its folder
  warns.
- v2 output (on a fixture with two worlds and a three-level tree): `worlds` lists every world the
  resolver ships to the campaign (ADR-0004 rule 5), here both;
  every map that ships is in `maps` with `parent`, `frame`, `enterZoom`; `ocean` holds the size,
  sea and the `onOcean` placements of top-level maps that ship. Tests check both worlds' maps,
  pins and regions are present and land on the right map id.
- World verdicts: on the same fixture with every map of one world hidden from the campaign, that
  world is absent from `worlds`, from `ocean`, and from every other field, its notes are absent
  from `entities` and the search index (even frontmatter `player` ones), and its id, name and those
  notes' ids, titles and aliases are in the build's must-not-ship set (so `check-derived-secrets` and R-17b look for them).
- A name collision the resolver reports (ADR-0004 rule 8) fails the strict player build, naming both
  items, for v2 as for v1 (R-11b).
- In v2, a note whose frontmatter says `player` (or `rumor`) but that ships to no campaign gets a
  build warning naming the note and the reason (no `notes:` entry naming a `hidden` campaign), so
  the DM sees why it is missing. Warnings go in the hidden-from-player set.
- v1 output unchanged: the player and DM `atlas.json` and `search-index.json` of `content/` match
  the pre-change build apart from `version` and `publishedAt` (same check as R-11b). The world name
  fallback becomes the title-cased id (R-12), not a literal.
- World.yaml and model warnings go in the build's hidden-from-player set (R-06), for every world.
- A gate-time check (a Vitest test, so it runs in `test:ci`) greps non-test files under `scripts/`
  for `defaultWorld` and `worlds[0]` against an allowlist file. A new hit fails; an allowlisted file
  with no hit left also fails (so the list only shrinks). Today's hits outside `build-atlas.ts`:
  `scripts/atlas/audit-assets.ts`, `scripts/check-derived-secrets.ts`,
  `scripts/check-fog-safety.ts` (2), plus `loadConfig`'s required-key check; `build-atlas.ts` must
  have none left except reading the key from `atlas.config.json` for the v1 path.
- `npm run gate` passes.

## Touches

- `scripts/build-atlas.ts` (+ new stage modules under `scripts/atlas/`), output types in
  `src/atlas/content/schema.ts` (`AtlasProject`, `MapDocument` gain optional fields), tests, the
  allowlist file.

## Out of scope

- `worlds[0]` in `src/` (viewer pages `AtlasViewer.tsx`, `AtlasBrowse.tsx`, `AtlasTimeline.tsx`,
  `AtlasCredits.tsx`, `Landing.tsx`, the old editor): phases 3, 5 and retire. Sync's
  (`src/atlas/sync/sync.ts:111`): R-14.
- Per-campaign outputs and dirs (R-17), per-campaign fog (R-18).
- The viewer showing the ocean or the tree (phase 3).
