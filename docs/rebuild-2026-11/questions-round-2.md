# Round 2 questions for Isak (after Stage D)

The plan is `plan.md`, revised after two Opus reviews (goals/cost and safety/sequencing). Four
questions, each with a recommendation; answers go under each.

## 1. Go with the plan?

Option B: keep the pipeline, scans, Sync and tests; rebuild the editor (one document store over the
source data) and the map model (schema v2: ocean canvas, nested maps, campaigns). Phase 0 first:
the Sync guard and quick wins (working links, fitted map, menu fix, region hover card) in week 1–2.
The old editor stays until the new one can do every job you use. About 80–95 sessions, 7–9 months
at light pace, with safe stop points after phase 0, phase 3 (shared canvas) and phase 6 (editor
parity). Alternative A′: keep today's editor shell and slide a store under it panel by panel
(85–100 sessions, two stores side by side for months).

**Recommendation: yes to B, starting with phase 0.**

Answer:

## 2. The 12 open PRs (#99–#110)

The old editor now lives for months (Tidemarrow fog drawing happens in it), so the fixes matter.

**Recommendation: merge all 12 in the State.md order, #109 and #110 first.** They are built, gated
and reviewed; #99 and #105 have safety effect once there are several maps or fog, #103 and #107
prevent lost edits. Alternative: close the four the rebuild makes moot (#99, #103, #105, #107).

Answer:

## 3. How players get in on Cloudflare

**Recommendation: Cloudflare Access with a one-time email PIN, one Pages project (and address) per
campaign.** You list each player's email; no passwords, no shared campaign picker, and one
campaign's players can't fetch another's files.

Answer:

## 4. Where the v2 test world lives before cutover

A v1/v2 mix in one content folder fails the build, by design.

**Recommendation: its own folder `content-next/`, local only, never published.**

Answer:

## Defaults taken unless you say otherwise

- Parity list: at the start of phase 6 you cross out old-editor jobs you don't use (sound areas and
  paste-markdown are the likeliest to go).
- Tiles: none for now; full lossless images with fog baked as today. Measure Tidemarrow's real map
  on your phone; tiles only if it is slow or refused.
- CI once the repo is private: the local gate stays the bar; the deploy job only builds, scans and
  uploads.
- Before any of this: `tidemarrow/01–03` get marked blocked until hosting is private (R-01), since
  01 is ready-for-agent today and would put real vault notes in the public repo.
