# Plan — Speed up `npm run atlas:publish` via `/ce-optimize`

**Spec:** `docs/superpowers/specs/2026-05-28-atlas-publish-speedup.md`
**Optimization branch:** `optimize/atlas-publish-speedup` (the skill creates this)
**Recommended model:** Opus 4.7 for Phases 0–2 of `/ce-optimize`; Sonnet 4.6 for Phase 3 experiment execution.

## Two-stage execution

### Stage 1 — Precondition session (Opus, ~30–45 min)

Build the integrity-smoke harness BEFORE running `/ce-optimize`. Without it, the optimizer has no safety net.

1. **Profile current `atlas:publish`** end-to-end on the current `main`:
   ```
   /usr/bin/time -v npm run atlas:publish 2>&1 | tee /tmp/atlas-publish-baseline.log
   ```
   (Windows: use `Measure-Command { npm run atlas:publish }` in PowerShell.)
   Note the wall-clock seconds and which steps dominate. **If the build itself dominates the scans, stop and re-scope** — the optimization target may be wrong.

2. **Build `scripts/atlas/publish-integrity-smoke.ts`.** It must:
   - Copy `dist/` and `public/atlas/` to a temp dir.
   - Run four fault-injection variants in series:
     - Plant a known-bad secret (use a string the existing `check-no-secrets` regexes catch — read the regex from the script).
     - Plant a known-derived secret filename.
     - Plant EXIF on a copy of an existing JPEG (use `sharp(buf).withMetadata({ exif: ... })`).
     - Plant fog geometry in `atlas.json`.
   - For each variant, run the full publish-scan chain (NOT the build — just the scans) against the corrupted dir and assert exit code is non-zero.
   - Exit 0 only if ALL four faults are caught. Exit 1 otherwise.

3. **Wire it into `package.json`:**
   ```json
   "atlas:publish:integrity-smoke": "tsx scripts/atlas/publish-integrity-smoke.ts"
   ```

4. **Verify on `main` (before any speedup work):**
   ```
   npm run atlas:publish && npm run atlas:publish:integrity-smoke
   ```
   Both must pass. This is the trusted baseline.

5. **Commit the integrity smoke harness on its own PR** (`feat(scans): add publish integrity smoke for ce-optimize`). Merge to `main` before starting Stage 2.

### Stage 2 — `/ce-optimize` session (Opus setup, Sonnet experiments, ~1–2 h)

Run `/ce-optimize` with the spec YAML below. The skill handles the loop; this plan only defines the spec.

## ce-optimize spec YAML

Save to `.context/compound-engineering/ce-optimize/atlas-publish-speedup/spec.yaml` (the skill writes this — do not commit). The orchestrator will validate.

```yaml
name: atlas-publish-speedup

metric:
  primary:
    type: hard
    name: publish_time_seconds
    direction: minimize
    target: 20.0          # adjust after profiling baseline; aim for ~40% improvement minimum
  degenerate_gates:
    - name: publish_exit_code
      operator: "=="
      threshold: 0
    - name: integrity_smoke_exit_code
      operator: "=="
      threshold: 0
    - name: scans_run_count
      operator: ">="
      threshold: 7        # all 7 post-build scans must still be invoked
  diagnostics:
    - per_scan_seconds   # logged, not gated; useful for understanding wins

measurement:
  command: "tsx scripts/atlas/measure-publish.ts"   # wrapper writes JSON with the fields above
  working_directory: "."
  timeout_seconds: 300
  stability:
    mode: repeat
    repeat_count: 3
    aggregation: median
    noise_threshold: 1.0  # seconds; below this is noise, not improvement

scope:
  mutable:
    - scripts/check-no-secrets.ts
    - scripts/check-derived-secrets.ts
    - scripts/check-image-privacy.ts
    - scripts/check-fog-safety.ts
    - scripts/check-artifact-shape.ts
    - scripts/atlas/audit-assets.ts
    - scripts/atlas/publish-orchestrator.ts  # may be created by experiments
    - package.json                            # only the atlas:publish line
  immutable:
    - scripts/build-atlas.ts
    - scripts/vite-plugin-atlas-save.ts
    - scripts/atlas/publish-integrity-smoke.ts
    - scripts/atlas/measure-publish.ts
    - src/**
    - public/atlas/**     # outputs, not inputs

execution:
  mode: serial
  max_concurrent: 1
  backend: worktree

stopping:
  max_iterations: 8
  max_hours: 2.0
  plateau_iterations: 3
  target_reached: true
```

## Pre-seeded hypothesis backlog

The skill will prompt for hypotheses in Phase 2. Provide these:

1. (high) Parallelize 7 post-build scans via `Promise.all` in a new `scripts/atlas/publish-orchestrator.ts`. Category: algorithm.
2. (high) Merge dual-dir invocations (`check-secrets dist + public/atlas` → one invocation). Category: preprocessing.
3. (medium) Cache `sharp` decode between `check-image-privacy` and `audit-assets`. Category: data-handling.
4. (medium) Combine 1 + 2 (orchestrator that takes multi-dir-aware scan modules and runs them concurrently).
5. (low) Stream/early-exit `check-no-secrets` and `check-derived-secrets`. Category: algorithm.
6. (low) `worker_threads` for `sharp` decodes. Category: architecture. **Only if 1–4 plateau short of target.**

No new runtime dependencies expected. If a hypothesis proposes one, the skill's dependency-pre-approval gate will surface it.

## After the loop

- Skill produces `optimize/atlas-publish-speedup` branch with all kept experiment commits.
- Run `/ce-code-review mode:autofix` against the cumulative diff (Phase 4 option in the skill).
- Open PR. Include before/after timings in the PR description.

## Verification before claiming done

- Median `publish_time_seconds` improved by ≥ 40% vs baseline (or hit absolute target).
- `npm run atlas:publish:integrity-smoke` still exits 0.
- All four fault injections still caught.
- No scan disabled or downgraded.

## Rollback

The optimization branch is preserved. Reverting the merge commit drops all changes atomically. The integrity smoke stays — it's useful regardless.
