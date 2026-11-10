# Rebuild 2026-11: tickets

The rebuild of the editor and the map model (ADR-0002). The plan is `docs/rebuild-2026-11/plan.md`
on branch `rebuild-plan-2026-11`; phases and PR outcomes are in `State.md` ("Rebuild queue").

## Done (phases 0 and 1)

R-01 (#111, no ticket file), Q-01..Q-04 (#112-#115),
[R-02](issues/R-02-missing-visibility-dm.md),
[R-03](issues/R-03-scans-fail-missing-artifact.md),
[R-04](issues/R-04-adopt-rebuild-goals.md),
[R-05](issues/R-05-rebuild-queue.md),
[R-06](issues/R-06-player-build-report-leak.md).

Open safety follow-up (no leak today; any phase, before the first real Sync):
[R-07](issues/R-07-root-dm-folder-exclude.md), a `_dm/` folder at the content root is not excluded (done);
[R-07b](issues/R-07b-fog-conceals-dropped.md), the loader drops fog shapes (conceals) (done).

## Phase 2: schema v2 and campaigns in the pipeline

Decisions: [ADR-0003](../../adr/0003-schema-v2-ocean-map-tree-campaign-files.md) (schema v2: the
ocean, the map tree, campaign files) and
[ADR-0004](../../adr/0004-per-campaign-visibility-and-outputs.md) (one per-campaign resolver, one
player output per campaign). Both are `accepted` (2026-11-08), with Isak's answers folded in.

| Order | Ticket | Size | Blocked by | Safety review |
|---|---|---|---|---|
| 1 | [R-10 Schema v2 types](issues/R-10-schema-v2-types.md) | S | Isak accepts ADR-0003, ADR-0004 | - |
| 2 | [R-11a Per-campaign resolver](issues/R-11a-per-campaign-resolver.md) (+ arch-08 predicate) | S-M | R-10 | yes |
| 2 | [R-12 v2 loader and the v1 adapter](issues/R-12-v2-loader.md) | M | R-10 | yes |
| 3 | [R-11b Build calls the resolver](issues/R-11b-build-calls-resolver.md) (+ arch-02) (done) | S | R-11a, R-12 | yes |
| 3 | [R-11c Old Publish Check calls the resolver (done)](issues/R-11c-publish-check-calls-resolver.md) | S | R-11a, R-12 | yes |
| 3 | [R-11d Link redaction from wikilink tokens (done)](issues/R-11d-link-redaction-from-tokens.md) (+ arch-08 redaction) | S | R-11a | yes |
| 3 | [R-11e A hidden region hides what is inside or reaching into it (done)](issues/R-11e-region-containment.md) | S-M | R-11a | yes |
| 3 | [R-15 Scan registry lists campaign dirs (done)](issues/R-15-scan-registry-campaign-dirs.md) | S | R-12 | yes |
| 3 | [R-16 Three-level test world, two campaigns (done)](issues/R-16-test-world-two-campaigns.md) | S | R-12, R-11a | light |
| 4 | [R-07b Fog shapes (conceals) dropped by the loader (done)](issues/R-07b-fog-conceals-dropped.md) | S | - | yes |
| 4 | [R-13 Build assembles every world and the map tree (done)](issues/R-13-build-every-world-map-tree.md) | M | R-11b, R-12 | yes |
| 5 | [R-17 One player output per campaign (done)](issues/R-17-player-output-per-campaign.md) | M | R-13, R-15, R-16, R-11e | yes |
| 5 | [R-14 Sync targets any world (done)](issues/R-14-sync-any-world.md) | S-M | R-13 | if visibility |
| 6 | [R-17b Structural campaign isolation scan](issues/R-17b-campaign-isolation-scan.md) (done) | S-M | R-17 | yes |
| 7 | [R-18 Fog per campaign, source-driven fog scan](issues/R-18-fog-per-campaign.md) (done) | M | R-17, R-17b | yes |
| 7 | [R-19 Publish runs every campaign](issues/R-19-publish-every-campaign.md) (done) | S | R-17, R-17b | yes |
| 8 | [R-20 Migration and down-migration, dry run](issues/R-20-migration-dry-run.md) | S-M | R-17, R-18 | yes |

Same order number = can run side by side (one `npm run gate` at a time on the Mac). Blockers that
differ from plan.md section 6: R-16 also needs R-11a (its `atlas:tree` shows each campaign's
verdicts); R-17 also needs R-13 (it builds on the build stages); R-11b and R-11c also need R-12,
which owns the one v1 adapter (`src/atlas/content/`); R-18 and R-19 also need R-17b. R-11d and
R-17b are new (split out of R-11a and R-17 in review).

## Frontier

- **Done 2026-11-08:** Isak accepted every "Open for Isak" recommendation in ADR-0003 and ADR-0004
  and the three fail-closed rules.
- **Done:** R-11c (merged), R-07b, R-13, R-11e, R-14, R-17, R-07, R-17b, R-18, R-19. **Now:** R-20.

Phase 3 and 4 tickets are written before phase 2 ends (plan.md section 5). Phase H (H-01..H-04)
starts after R-19 at the earliest and before the first real Sync (`tidemarrow/01`).
