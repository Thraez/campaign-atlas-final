# R-17 One player output per campaign: visibility

Status: ready-for-agent
Blocked by: R-13, R-15, R-16 (plan.md lists R-15, R-16; it builds on R-13's build stages)
Size: M
Branch: `rebuild-r17-campaign-outputs`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

The publish must build one player output per campaign (ADR-0004): its own dir, its own assets,
an `atlas.json` naming only its own campaign, and nothing a campaign hides, in any file. This
ticket does visibility; fog per campaign is R-18. Proved on the `content-next/` test world (R-16).
Today's v1 output (`public/atlas/`, `dist/`) stays as it is.

## Acceptance criteria

- The player build, given v2 content, writes one store per campaign at the dir ADR-0004 settles
  (recommended `.atlas-campaigns/<id>/atlas/`, gitignored, outside `public/`): `atlas.json`,
  `search-index.json`, and the images and audio that campaign's `atlas.json` references, copied
  (not linked) into that campaign's own asset dir. No asset dir is shared between campaigns. A
  `--campaign <id>` flag builds one; the default builds all.
- Each campaign's `atlas.json` carries only its own campaign's `id` and `name` (ADR-0004 question 8) and no
  other campaign id anywhere; maps that are `dm` or `unknown` for it are absent, with their frames
  on parent maps, their subtree and their images.
- Each campaign's must-not-ship set (from R-11a) is written next to its build inputs for the scans
  (never into the store): R-17b's isolation scan and `check-derived-secrets` read it.
- Sentinel fixtures (test-only content roots or `content-next/` items) with unique strings of at
  least 4 characters, not common words, in their names, ids and bodies: an item hidden only via
  `notes:`, an item hidden in one campaign only, a map visible in one campaign only (with a unique
  image file), a sound area with a unique audio file inside a hidden region, and a world with no
  map that ships to one campaign (its id and name are absent from that campaign's output, `worlds`
  and `ocean` included; ADR-0004 rule 5). A test builds both campaigns and greps every file of each output
  (bytes for images and audio: the hidden map's image and the hidden audio file are absent) and
  finds each sentinel only where it may be.
- Every existing scan in the registry passes on both campaigns' outputs (R-15 lists them).
- Each campaign's store always has an `assets/` dir with something in it: R-15's `audit-assets`
  task requires it per store and fails with exit 20 otherwise. A campaign that ships no image
  needs the requirement relaxed here instead (in `scanRegistry.ts`, with a test).
- The DM build is unchanged in shape for v1; for v2 it holds every campaign's data (it is never
  published; `.local-atlas/`).
- v1: `npm run atlas:build:player` writes exactly what it wrote before (same check as R-11b).
- `npm run gate` passes.
- Scans that check output against `mustNotShip.paths` compare with `normalizePath` (from
  `src/atlas/content/resolveCampaign.ts`) on both sides; the set holds each hidden path as written
  and normalised.

## Touches

- `scripts/build-atlas.ts` and its stage modules (R-13), `.gitignore`, tests,
  `docs/VISIBILITY_AND_PLAYER_SAFETY.md`.

## Out of scope

- The cross-campaign isolation scan (R-17b).
- Fog per campaign and the source-driven fog scan (R-18).
- The Vite site build per campaign and publish (R-19). Hosting (phase H).
- Moving today's `content/` to v2 (R-20 dry run; cutover in phase 6).
