# R-17b Structural campaign isolation scan

Status: ready-for-agent
Blocked by: R-17
Size: S-M
Branch: `rebuild-r17b-isolation-scan`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

A scan that proves each campaign's player output holds nothing that campaign hides and nothing of
another campaign (ADR-0004, "The isolation check is structural"). A plain text search can't do it:
short ids like `main` or `a` appear in every bundle (false hits), and `check-derived-secrets` skips
names shorter than `MIN_NAME_LENGTH` (4, `scripts/check-derived-secrets.ts:50`) and the
`GENERIC_NAMES` set (`isReportableName`, `:125`), so a short hidden name would pass unseen. So
the scan parses `atlas.json` and compares fields, and searches text only for names it can find
safely.

## Acceptance criteria

- New scan (suggested `scripts/check-campaign-isolation.ts`) in `scripts/atlas/scanRegistry.ts`,
  run per campaign output, reading that campaign's must-not-ship set (R-17 writes it beside the
  build inputs) and the loaded model's campaign list.
- Structural checks on the parsed `atlas.json`, exact matches, any length:
  - the campaign fields hold exactly this campaign's `id` and `name` (ADR-0004 question 8 as
    accepted) and no other campaign's id or name;
  - every world id in `worlds` and `ocean`, every map id (and `parent`), every item id (pins,
    regions, routes, sound areas) and every note/entity id is not in the must-not-ship set;
  - no field anywhere in the parsed tree is a key or value naming another campaign's id where a
    campaign id is expected (campaign fields, any per-campaign map left over).
  The same structural check runs on `search-index.json` ids.
- Text search over every text file in the output (`atlas.json`, `search-index.json`, any other
  JSON or JS) only for must-not-ship names, titles and aliases that pass `isReportableName` (import
  it; don't copy the threshold or the list). Shorter or common names are covered by the structural
  checks only, and the scan's report says how many were checked each way.
- "Every asset referenced": every image and audio file in the campaign's **store**
  (`.atlas-campaigns/<id>/atlas/`, the layout of ADR-0004 question 7) is referenced by that store's
  `atlas.json`, and every reference resolves to a file in that store. On a **built site**
  (`dist-campaigns/<id>/`) the scan runs the structural and text checks on the site's atlas dir and
  checks its file list equals its store's (R-19 wires that run); it doesn't judge Vite's own
  `assets/` bundle beyond the text search.
- New exit codes documented in the scan's header; exit 20 when the output is missing (R-03).
- Integrity-smoke variants (`scripts/atlas/publish-integrity-smoke.ts`), as `scanRegistry.test.ts`
  requires: clean passes; each of these planted sentinels fails: another campaign's id in the
  campaign field, a hidden map id of 1-3 characters (`c1`) in `maps`, a hidden world id in
  `ocean`, a hidden long name in `search-index.json`, an unreferenced image in the store.
- A test shows `main` and `a` appearing as ordinary substrings in the bundle don't trip the text
  search (no false hit).
- Every existing scan still passes on both campaigns of `content-next/`; `npm run gate` passes.

## Touches

- New `scripts/check-campaign-isolation.ts` (+ test), `scripts/atlas/scanRegistry.ts`,
  `scripts/atlas/publish-integrity-smoke.ts`, maybe `scripts/check-derived-secrets.ts` (export
  `isReportableName` only), `docs/VISIBILITY_AND_PLAYER_SAFETY.md`.

## Out of scope

- Building the outputs (R-17). Fog (R-18). Running it from publish over every campaign and over the
  built sites (R-19).
