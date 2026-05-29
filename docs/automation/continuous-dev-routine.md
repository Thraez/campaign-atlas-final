# Continuous-development routine — hourly operating instructions

**Created:** 2026-05-29
**Runs as:** a Claude Code desktop **routine**, once per hour, **Sonnet** model, this PC.
**Companion doc:** `docs/automation/continuous-dev-roadmap.md` (what to build).

This file is the routine's standing orders. The hourly routine prompt (see the bottom of this file)
tells the agent to read this doc and follow it exactly.

The one principle above all: **stopping and waiting for the human is always a valid, safe outcome.**
A run that does nothing because nothing was certain is a *success*, not a failure. Never invent work to
stay busy.

---

## The integration model

- **One long-lived branch: `auto/continuous-dev`.** All routine work accumulates here. `main` is **never**
  touched by the routine — the human reviews `auto/continuous-dev` and merges it to `main`.
- **One fresh worktree per run, cut from `auto/continuous-dev`.** The run does its work there, gates it,
  commits in small revertible steps, then merges back into `auto/continuous-dev`.
- **The handover + lock live in branch-independent project memory** at `memory/handovers/ACTIVE.md`, so
  every run sees the same state regardless of which worktree it is in.

---

## Each run, in order

### 0. Read state
- Read `memory/handovers/ACTIVE.md` (the handover + lock).
- Read `docs/automation/continuous-dev-roadmap.md` (what to build).

### 1. Claim the lock — or stop
At the top of `ACTIVE.md` is a **Run status** line:
`Run status: IDLE` or `Run status: IN_PROGRESS since <ISO timestamp> (run <id>)`.

- If `IN_PROGRESS` **and** the timestamp is **less than 3 hours old** → **STOP immediately.** A previous
  run is still working; starting now would collide. Do nothing else.
- If `IN_PROGRESS` **and** the timestamp is **older than 3 hours** → assume the previous run crashed.
  Note this in the handover, clear the lock, and continue.
- If `IDLE` → continue.

Before doing any work, set `Run status: IN_PROGRESS since <now> (run <id>)` and save `ACTIVE.md`.
This is the conflict guard the human asked for.

### 2. Pick the work
From the roadmap, in strict order:
1. The first **WANT** not yet done → take it.
2. If no WANT remains → the first **NICE-TO-HAVE** that **clearly passes the design check** (step 2a).
3. If a candidate is on the **HAND-BACK** or **NEVER** list → do **not** build it. Go to step 7
   (stop-and-report).
4. If nothing is safe to build → go to step 7 (stop-and-report with candidate suggestions).

#### 2a. The design check (required before any NICE-TO-HAVE or self-ideated item)
Hold the candidate against `README.md`, `docs/PRODUCT_SPEC.md`, and `docs/NON_GOALS.md`. Ask:
*Can I justify this as clearly inside the app's small, deliberate scope, improving the DM's prep loop or
the player's browse experience, without adding permanent surface-area the docs warn against?*
- **Confident yes** → build it.
- **Anything less than confident** → **stop and hand it back** (step 7). Bias hard toward stopping.

### 3. Make a clean worktree
- Bring `auto/continuous-dev` up to date.
- Create a fresh worktree from it for this run (e.g. under `../campaign-atlas-final-run-<id>`).
- Install dependencies in the worktree if needed (`npm install`) so gates can run.

### 4. Build
- Implement the chosen item. Prefer test-first where it makes sense.
- Keep commits **small and revertible** — one logical step per commit — so any problem can be backed out.
- Never hand-edit generated artifacts (`public/atlas/atlas.json`, `.local-atlas/`, `dist/`, `dist-ssr/`).
  Edit source and rebuild. A pre-tool hook enforces this.

### 5. Gate — all must pass before committing/merging
- `npm run lint` → clean
- `npm run test` → all green
- `npx tsc --noEmit` → clean
- If the change touches the build/scan pipeline: `npm run atlas:publish:integrity-smoke` **and**
  `npm run atlas:publish` → green (no DM content leaks, shapes intact).
- The repo's pre-commit hook (`scripts/pre-commit.sh`) also runs TypeScript + ESLint + changed tests on
  every commit — let it run; **never** use `--no-verify`.

**If any gate fails:** revert this run's commits, write the failure (item + error) into the handover, do
**not** merge, then go to step 7. Do not leave a broken state on `auto/continuous-dev`.

### 6. Merge into the integration branch
- Merge the run's worktree branch into `auto/continuous-dev` (preserve the small commits).
- **Never merge to `main`.** That is the human's gate.
- Remove the run's worktree to keep things tidy.

### 7. Write the handover for the next run, then release the lock
Overwrite `memory/handovers/ACTIVE.md` with:
- **Run status:** set back to `IDLE`.
- **Last run:** what was built (or why the run stopped), and the resulting state of `auto/continuous-dev`.
- **Next:** the next roadmap item, or — if stopping for the human — a short list of **candidate wants to
  bless**, each with a one-line "why it fits the design."
- **Branch/PR:** `auto/continuous-dev` and any relevant commit hashes.

Then tell the (asynchronous) human, via the handover, what happened. End the run.

---

## Stop-and-report — when to hand back to the human

Write a "needs your decision" handover and **stop** (do not build) when any of these is true:
- The next candidate is on the HAND-BACK or NEVER list.
- A NICE-TO-HAVE does not *clearly* pass the design check.
- The WANT list is empty and no nice-to-have is safe.
- A gate failed and the cause is not an obvious, in-scope fix.
- The work would require a product or architecture decision (not just execution).
- Anything feels "far from our design." When in doubt, stop.

---

## Guardrails (always)

- **Sonnet only.** Every run uses the same model.
- **One item per run.** No marathon multi-feature runs.
- **`main` is sacred.** Routine merges only into `auto/continuous-dev`.
- **Revertible by construction** — small commits, full gate before merge.
- **No branch deletion** without the safe-cleanup protocol (`memory/safe_cleanup_protocol.md`).
- **Plain outcomes in the handover** — describe what was done for the DM/player, not internal codenames.

---

## The hourly routine prompt (paste this into the Claude Code desktop routine)

```
You are the campaign-atlas continuous-development routine. Use the Sonnet model.

1. Read memory/handovers/ACTIVE.md and docs/automation/continuous-dev-routine.md in the
   campaign-atlas-final repo.
2. Follow continuous-dev-routine.md exactly, in order, for this single hourly run.
3. Honor the lock in ACTIVE.md: if a previous run is IN_PROGRESS and less than 3 hours old, STOP now.
4. Do at most one roadmap item. Pass every gate before merging into auto/continuous-dev. Never touch main.
5. If anything is uncertain or off-design, stop and write a hand-back note in ACTIVE.md instead of building.
6. Always finish by writing the next handover and setting Run status back to IDLE.
```
