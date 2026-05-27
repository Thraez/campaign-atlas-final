# Spec — Speed up `npm run atlas:publish`

**Date:** 2026-05-28
**Status:** Ready for design phase
**Recommended model:** Opus 4.7 for design + ce-optimize setup; Sonnet 4.6 for execution
**Depends on:** nothing (independent of the flake/hook work)
**Estimated session:** 1.5–2.5 hours total (split across design + execution)

## What this fixes (plain language)

`npm run atlas:publish` is the "make the player build, then check it for leaks" command. Today it runs 12 things one after another. Several of those things are independent file scans that could run side-by-side. Faster publish = faster feedback after each round of edits.

## The shape of the chain today

From `package.json` line 19:

```
atlas:snapshot
  → atlas:build:player        (writes public/atlas/)
  → build                     (writes dist/)
  → atlas:check-secrets dist
  → atlas:check-secrets public/atlas
  → atlas:check-shape public/atlas/atlas.json
  → atlas:check-derived dist
  → atlas:check-derived public/atlas
  → atlas:check-image-privacy dist
  → atlas:check-image-privacy public/atlas
  → atlas:audit-assets
  → atlas:check-fog public/atlas
  → atlas:check-fog dist
```

The first three (`snapshot → build:player → build`) are sequential by necessity — outputs feed the next step. Everything after `build` is a read-only scan over `dist/` or `public/atlas/` and is parallelizable.

There's also a flat tax: each scan is a separate `tsx` cold start. Merging the dual-directory invocations (`check-secrets`, `check-derived`, `check-image-privacy`, `check-fog`) into single calls that accept multiple dirs would cut 4 cold starts.

## Goal (the metric)

Reduce wall-clock time of `npm run atlas:publish` on a warm-cache clean tree, **without weakening any scan**.

- **Primary metric:** seconds, minimize.
- **Baseline:** to be measured in Phase 1 of `/ce-optimize`. Expected current range: 30–90 seconds depending on asset count.
- **Target:** at least 40% reduction. Hard target if achievable: under 20 seconds.

## Hard safety gates (must not regress)

Speedups that disable or weaken security scans are not acceptable. Concretely:

1. **Exit code 0 on the current clean tree.** Trivial but must hold.
2. **Exit non-zero when a planted DM secret is in `dist/`.** A new `npm run atlas:publish:integrity-smoke` command must be built as a precondition to this optimization — it copies a known-bad fixture into a temp output dir and confirms the scan suite still rejects it. Without that integrity smoke, the optimization can game the metric by skipping checks.
3. **Exit non-zero when EXIF is planted on an image in `dist/`.** Same shape.
4. **Exit non-zero when fog geometry is planted in the player atlas.** Same shape.
5. **Exit non-zero when the atlas shape is corrupted.** Same shape.

The integrity smoke is the safety net. The optimizer measures speed only on a clean tree; the gate runs the integrity smoke as a separate check.

## Why `ce-optimize` fits

- **Objective metric:** seconds. No judgment call.
- **Clear degenerate gates:** exit 0 on clean, exit non-zero on each planted fault.
- **Real hypotheses to try:** parallelism, dedupe, sharp-decode caching, streaming.
- **No "more is better" trap:** unlike a clustering quality score, "faster" can't be gamed without breaking gates.

## Hypotheses to seed the loop

| # | Hypothesis | Category | Expected impact |
|---|---|---|---|
| 1 | Run the 7 post-build scans concurrently in one `tsx` entry that calls them via `Promise.all` | algorithm | High — biggest win |
| 2 | Merge `check-secrets`, `check-derived`, `check-image-privacy`, `check-fog` to each accept multiple dirs in a single invocation | preprocessing | Medium — saves 4 cold starts |
| 3 | Cache the `sharp` decode between `check-image-privacy` and `audit-assets` (single `sharp.metadata()` pass per file) | data-handling | Medium — image-heavy worlds |
| 4 | Stream-process `check-no-secrets` and `check-derived-secrets` — read files chunked, exit early on hit | algorithm | Low-medium |
| 5 | Skip already-checked files when both `dist/` and `public/atlas/` contain the same atlas binary (hash + skip) | parameter-tuning | Low — depends on overlap |
| 6 | Use `worker_threads` for CPU-bound `sharp` decodes | architecture | High but adds complexity — defer unless 1–4 don't hit target |

## Scope

**Mutable** (the optimizer may modify):
- `scripts/check-no-secrets.ts`
- `scripts/check-derived-secrets.ts`
- `scripts/check-image-privacy.ts`
- `scripts/check-fog-safety.ts`
- `scripts/check-artifact-shape.ts`
- `scripts/atlas/audit-assets.ts`
- `package.json` (the `atlas:publish` script line)
- A new `scripts/atlas/publish-orchestrator.ts` if helpful

**Immutable** (must not be touched by experiments):
- `scripts/build-atlas.ts` (the build itself — different optimization, different session)
- `scripts/vite-plugin-atlas-save.ts`
- `src/**` (no production code touched by a build-script change)
- The integrity-smoke harness (`scripts/atlas/publish-integrity-smoke.ts`, to be created as a precondition)

## Non-goals

- Optimizing `atlas:build:player` itself — that's its own session if needed.
- Optimizing the Vite `build` step — same.
- Reducing scan strictness "because it's a small risk."

## Constraints

- Per project rule, anything touching `scripts/` is Opus territory. Design + spec drafting must be on Opus. Execution of individual experiments inside `/ce-optimize` can be Sonnet.
- The optimization branch is `optimize/atlas-publish-speedup` per the ce-optimize convention.
- Worktrees count toward the 12-worktree budget — keep `execution.max_concurrent: 1` (serial) for the first run.

## What to read first

- `package.json` lines 16–26 (the script chain)
- All six `scripts/check-*.ts` files (small, total ~few hundred lines)
- `scripts/atlas/audit-assets.ts`

## Open questions for the design phase

- Where is the actual time spent today? Profile before designing — the answer may be "the build, not the scans," in which case this whole optimization is wrong target.
- Are any scans already incremental (skip on hash match)? If so, parallelism may add less than expected.
- Is there overlap between `dist/` and `public/atlas/` outputs that lets one scan cover both?
