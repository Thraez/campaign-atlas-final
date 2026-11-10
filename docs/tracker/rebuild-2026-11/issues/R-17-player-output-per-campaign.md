# R-17 One player output per campaign: visibility

Status: done
Blocked by: R-13, R-15, R-16 (plan.md lists R-15, R-16; it builds on R-13's build stages). R-11e (no per-campaign output ships before containment) was a blocker; done 2026-11-10
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
  image file), a pin, route and sound area with a unique audio file inside a hidden region, and a world with no
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

## Done

On v2 content the player build writes one store per campaign, `.atlas-campaigns/<id>/atlas/`
(`scripts/atlas/build/campaignStore.ts`; `--campaign <id>` builds one, `--out` moves the root, a
store inside `public/` is refused). Every campaign is built before any is written, so one failure
writes nothing. Each store holds `atlas.json` (with `campaign: {id, name}` and no other campaign's
id), `search-index.json` and `assets/`: byte copies of the map images it names
(`assets/maps/<sha256-16><ext>`) and its audio (`assets/audio/<hash>.ogg`), replaced on every
write. Hidden maps (with frames, subtree and images) and pins, routes and sound areas hidden by
rule 9 are absent. The must-not-ship set is written beside the store
(`.atlas-campaigns/<id>/must-not-ship.json`, with `otherCampaigns`); `check-derived-secrets
--must-not-ship` reads it (whole-word ids and names, `normalizePath` on both sides for paths,
fail closed on an unreadable file) and the scan registry passes and requires it for every v2
campaign dir. `check-fog-safety` reads a v2 campaign's fog from the campaign file. `audit-assets`
requires `assets/` only when the store names a file there. The DM build carries every campaign
file (`campaigns`). v1 player and DM `atlas.json` and `search-index.json` are identical to
before (ignoring `version` and `publishedAt`).

The State.md leak (a hidden map or world name in a shipped note body): a link to any must-not-ship
id or name is redacted to `…` like a link to a hidden note, and counts as a cross-reference leak,
so `--strict` fails with exit 8. The must-not-ship scan catches any plain-text mention.

Sentinels on `content-next/` (listed in its README) and `src/test/build/campaign-stores.test.ts`
build both campaigns and grep every file of each store, bytes for images and audio.

Review round 1 (five should-fixes):
- S1: every v2 player build, strict or not, matches each campaign's `atlas.json` and
  `search-index.json` against its must-not-ship set in memory and fails with exit 12, writing
  nothing (`findSecretsInText` in `check-derived-secrets.ts`). The scan registry takes the stores
  root from the config's `outputDir`.
- S2: the set adds every other campaign's name and id (when `isReportableName`), in the build and
  the scan.
- S3: the stores root is compared on the real path of its nearest existing folder, case-folded on
  macOS and Windows, so `--out PUBLIC` and a symlink to `public/` are refused.
- S4: each store is built in a temp folder and renamed over the old one; a full build removes
  root folders that aren't current campaigns. The root may not be the repo, `src/`, `scripts/`
  or the content folder, and a non-empty root needs the `.atlas-campaigns-root` marker. Stores are
  written only after every campaign passes; the per-campaign renames aren't one atomic step.
- S5: markdown and HTML images in a v2 note fail the player build (exit 1); the path scan
  matches a path after `(` or `=`.
- v1 output is still identical; the link redaction runs only for v2.

Left out: markdown reference-style images and `<source>`/`<video>` tags aren't matched by the
S5 check (the in-build path match still catches a hidden path); entity images and embedded assets in v2 notes fail the player build closed (not
published per campaign yet); a tiled map layer is an error; fogged v2 maps ship with no fog mask
(R-18). `check-player-files` and the v1 store comments still describe the v1 layout (R-19).
