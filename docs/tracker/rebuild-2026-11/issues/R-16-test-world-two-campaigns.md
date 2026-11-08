# R-16 Three-level test world, two campaigns

Status: done
Blocked by: R-12, R-11a
Size: S
Branch: `rebuild-r16-test-world`

Make the small made-up v2 test world that phases 2-6 prove themselves on (`docs/GOALS.md`, "First
content"; Isak, round-2 Q4: `content-next/`, local only, never published). Three levels (an ocean
world map, a continent, a city), two worlds on the ocean, two campaigns that differ by visibility
and by fog. Plus `npm run atlas:tree`, the command Isak looks at at the end of phase 2. The plan
blocks this on R-12 only; it also needs R-11a, because the tree is shown per campaign.

## Acceptance criteria

- `content-next/` (made-up content, no real vault text or names; committed or gitignored as
  ADR-0003 question 9 settles, recommended committed; the repo is public until phase H) with `_atlas/atlas.yaml`, two
  worlds, `_atlas/campaigns/a.yaml` and `b.yaml` (pick short ids, for example `main` and
  `sandbox`), and in one world a three-level tree: a world map on the ocean, a continent framed in
  it, a city framed in the continent. Small lossless map images (a few hundred px), stored where
  ADR-0003 Q3 settles (recommended `content-next/<world>/_atlas/images/`).
- The content holds at least, each named in a short `content-next/README.md` so later tests can
  find them: a note visible in both campaigns; a note hidden only via `notes:` in one campaign; a
  region visible in one campaign only; a map (the city) visible in one campaign only; a map
  `unknown` in one campaign; a pin, a route and a sound-only area inside a hidden region; one map
  fogged in one campaign and open in the other, with a pin under that fog; a note with frontmatter
  `dm`; a `notes:` entry with a stale `basedOn`; a second city whose frame sits under the fog of a
  map fogged in one campaign (ADR-0004 rule 4); a second world whose every map is hidden from one
  campaign (rule 5); one campaign file with `notes: hidden` and one with `notes: vault`.
- `atlas.next.config.json` at the repo root points the build at `content-next/` (ADR-0003); its
  outputs go to a gitignored dir outside `public/`. R-01's vault check and `check-vault-content`
  don't flag `content-next/` (it has no vault source markers); confirm and test.
- `npm run atlas:tree` (new script, suggested `scripts/atlas/atlas-tree.ts`, `--config` defaulting
  to `atlas.config.json`) prints, for each campaign, the ocean and the map tree with each map's
  visibility verdict and state, and per map the count of pins, regions, routes and sound areas that
  ship, from R-12's loader and R-11a's resolver. On `content/` it prints today's one map for `main`.
  `npm run atlas:tree -- --config atlas.next.config.json` shows the two campaigns differing.
- A test runs the tree command's function on `content-next/` and checks the two campaigns' trees
  differ exactly as the README says.
- Nothing in `atlas:publish`, `publish-atlas.yml` or the Vite build reads `content-next/`.
- `npm run gate` passes.

## Touches

- New `content-next/`, `atlas.next.config.json`, `scripts/atlas/atlas-tree.ts` (+ test),
  `package.json` (script), `.gitignore`, `README.md` (commands table), `COMMANDS.md`.

## Out of scope

- Building player outputs for the test world (R-17), fog images (R-18).
- Viewer or editor support for it (phases 3 and 4).

No adversarial player-safety review needed (test content and a read-only report); the reviewer
checks only that `content-next/` can't reach a published build.
