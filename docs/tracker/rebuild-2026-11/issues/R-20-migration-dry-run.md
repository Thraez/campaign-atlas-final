# R-20 Migration script and down-migration, dry run only

Status: ready-for-agent
Blocked by: R-17, R-18
Size: S-M
Branch: `rebuild-r20-migrate-v2`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done"): it rewrites visibility

Write `npm run atlas:migrate-v2`: today's v1 `content/` to v2 (ADR-0003), and a v2-to-v1
down-migration kept until retire. In this ticket it only ever writes to a copy; the cutover ticket
(phase 6) runs it on `content/`. It is proved by building before and after: the player output of
every campaign (today only `main`) must not change.

## Acceptance criteria

- `atlas:migrate-v2 --out <dir>` reads the content root from the config, writes the migrated tree
  to `<dir>`, and refuses when `<dir>` is the content root or inside it (until cutover changes
  that). `--dry-run` (the default when `--out` is missing) prints what it would write and writes
  nothing. Running it twice on its own output is a no-op (idempotent: a v2 input is detected and
  left as is).
- What it writes, each checked by a test on a fixture and on a copy of `content/`:
  - `_atlas/atlas.yaml`: `schemaVersion: 2`, the ocean, `worlds: [<defaultWorld>]`,
    `campaigns: [main]`, one `onOcean` entry per v1 map;
  - the world's `world.yaml` at v2: each v1 map a top-level map, layers unchanged (today one map,
    six layers), regions, routes and sound areas nested under their map; every map and item that
    ships today gets `{ main: player }` (or `{ main: rumor }`); items that don't ship keep a value
    that doesn't ship (`dm`/`hidden`; a missing or invalid value becomes `dm`); world-level settings
    (calendar, credits, import folders, water) carried over; the world name written explicitly
    (today's output name, "Astrath Deeprealm");
  - `_atlas/campaigns/main.yaml`: every map listed, `open`, or `fogged` with the v1 fog's reveals,
    conceals and `featherPx`; and the note default ADR-0004 question 5 settles (recommended
    `notes: vault`);
  - pins: each note's `atlas.placements` (6 notes today) moved into `maps[].pins` with
    `{ main: <placement visibility> }`, and removed from that note's frontmatter in the copy (other
    frontmatter and the body byte-identical).
- v1 input that the v2 validators (R-10, `src/atlas/content/schemaV2.ts`) would reject is
  converted, each case covered by a fixture test:
  - per-map `water` moves to the world-level `water`; if two maps carry different `water`
    blocks, the migration refuses and names both maps;
  - a region or sound-only area with fewer than 3 points is dropped with a warning, as v1
    does (`loadWorldConfig` skips such regions with a warning; `resolveSoundscape` skips such
    sound areas);
  - a v1 map's `soundscape.areas` move to the map's `sound:` list; the rest of `soundscape`
    (`enabled`, `masterGain`) stays under `soundscape`;
  - each map gets a `zoom` range (v2 requires one; v1 has none), and any `frame` written gets
    `rotation: 0`.
  The migrated `world.yaml` and campaign file pass `validateWorldFileV2` and
  `validateCampaignFileV2`.
- The diff: a test (and a script mode, `--check`) builds the v1 player output of the original and
  the v2 player output of the migrated copy for campaign `main`, and compares `atlas.json`,
  `search-index.json` and the set and bytes of asset files. Allowed differences, listed in one
  place in the code: `version`, `publishedAt`, `schemaVersion`, and the v2-only additions of
  ADR-0003 (`ocean`, `parent`, `frame`, `enterZoom`) and ADR-0004 (the campaign's own `id`/`name`).
  Anything else fails. On a copy of today's `content/` the diff is empty.
- Down-migration `atlas:migrate-v2 --down --out <dir>`: v2 to v1, refusing (with the reason) when
  there is more than one campaign, any `parent`, a per-campaign value naming a campaign other than
  `main`, or a `notes:` block. A round trip v1 to v2 to v1 builds the same player output as the
  original.
- The DM build of the migrated copy holds every entity and item the original's DM build holds.
- `npm run gate` passes; `content/` is untouched by the branch.

## Touches

- New `scripts/atlas/migrate-v2.ts` (+ tests), `package.json`, fixtures, `README.md` / `COMMANDS.md`.

## Out of scope

- Running it on `content/`, disabling the old editor's save, Sync stripping placements: the
  cutover ticket (phase 6). The rollback window ends at the first new-editor save on real content.
- Moving map images out of `public/` (ADR-0003 Q3) for real content: cutover.
