# Code-quality routine — daily operating instructions

**Created:** 2026-06-02
**Runs as:** a Claude Code desktop **routine**, once per day, **Opus 4.8** model at max thinking effort, this PC.
**Companion docs:** `continuous-dev-routine.md` (the feature-building routine it runs alongside) and
`continuous-dev-roadmap.md` (shared policy — the HAND-BACK / NEVER lists bind this routine too).

This file is the routine's standing orders. The daily routine prompt (bottom of this file) tells the agent
to read this doc and follow it exactly.

The one principle above all: **a run that safely changes nothing is a success.** This routine improves
existing code; it must never trade a real, proven improvement for a risky guess. Finding nothing safe to fix
is a perfectly good outcome — log it and stop. Never invent work, and never "tidy" code in a way that could
change what the DM or players see.

**What this routine is for:** keep the code already on `auto/continuous-dev` healthy — fix what's provably
broken or wasteful, remove what's provably dead, and make safe, test-proven speedups. It does **not** build
features (that's the feature routine's job) and it does **not** make any change whose effect it can't prove.

---

## The integration model (shared with the feature routine)

- **Same long-lived branch: `auto/continuous-dev`.** This routine's fixes accumulate here alongside the
  feature routine's work. `main` is **never** touched — the human reviews `auto/continuous-dev` and merges.
- **One fresh worktree per run**, cut from `auto/continuous-dev` (e.g. `../campaign-atlas-final-qa-<id>`), so
  the routine never collides with whatever the human is doing in the main working copy. Run `npm install` in
  it so the gates work. (A once-a-day install is expected and fine.)
- **Shared lock, separate log.** Both routines honor the same `Run status:` lock at the top of
  `memory/handovers/ACTIVE.md`, so they never run at once. This routine keeps its **own** history and
  hand-back list in `docs/automation/code-quality-log.md` — it must **not** overwrite the feature routine's
  handover notes in `ACTIVE.md`; it only toggles the single `Run status:` line.

---

## Each run, in order

### 0. Read state
- Read `memory/handovers/ACTIVE.md` (the shared lock — the `Run status:` line at the top).
- Read this file (`docs/automation/code-quality-routine.md`).
- Read `docs/automation/code-quality-log.md` (what's already fixed, and what's already been handed back — so
  you never re-report the same thing).
- Read `docs/automation/continuous-dev-roadmap.md` (the **HAND-BACK** and **NEVER** lists bind this routine
  too — never "fix" or "optimize" your way into something on those lists).

### 1. Claim the lock — or stop
The first line of `ACTIVE.md` is `Run status: IDLE` or
`Run status: IN_PROGRESS since <ISO timestamp> (run <id>)`.

- `IN_PROGRESS` **and less than 3 hours old** → **STOP immediately.** Another run (feature or quality) is
  active; starting now would collide. Do nothing else.
- `IN_PROGRESS` **and older than 3 hours** → assume that run crashed. Note it in the log, clear the lock,
  continue.
- `IDLE` → continue.

Before any work, set the first line to `Run status: IN_PROGRESS since <now> (run <id>)` and save — **change
only that line; leave the rest of `ACTIVE.md` exactly as it is.**

### 2. Make a clean worktree
- Bring `auto/continuous-dev` up to date.
- Cut a fresh worktree from it for this run (`../campaign-atlas-final-qa-<id>`).
- `npm install` in the worktree so every gate can run. Do all the work below **inside the worktree.**

### 3. Confirm a green baseline — or that's the job
Before improving anything, run the full gate on the **untouched** worktree (exact commands in step 6,
including the sharded test run that avoids the known out-of-memory crash):

- **All green** → go to step 4 (look for improvements).
- **Red, and the cause is an obvious, in-scope fix** (a lint error, a type error, a test broken for a clear
  reason) → that *is* this run's one item. Fix it (steps 5–6), then merge and log. A red integration branch
  is the highest-priority thing to fix.
- **Red, and the cause is not obvious** → do **not** pile work on top. Log it as a hand-back ("the shared
  branch is currently failing X — needs your look") and release the lock (steps 7–8). Stop.

### 4. Find one safe improvement (read-only scan)
Using only the repo's **existing** tooling (ESLint, `tsc`, the atlas scan scripts — **install nothing
new**), scan for candidates and pick the **single** highest-value safe one this run. Priority order:

1. **Provable bugs** — a clear logic error you can pin with a reproducing test.
2. **Lint / type cleanups** — warnings and errors ESLint or `tsc` flags, including ESLint's safe autofixes.
3. **Provably dead code** — an export, file, or branch with **zero** references anywhere in the repo (confirm
   with a thorough search before deleting). If you can confirm it's dead, delete the whole unit decisively;
   if you can't confirm, hand it back — don't leave it behind a caveat.
4. **Safe test-coverage nibbles** — add tests that pin existing behavior in a weakly-covered module.
5. **Behavior-preserving optimizations** — a measurable speedup (e.g. an O(n²) pass over atlas data, repeated
   work in a build scan, a missing memo in a hot render path) **only** when a test proves the output is
   identical before and after.

One item per run. If several look tempting, take the safest and note the rest for next time.

### 5. The safety check (required before you change anything)
Hold the candidate against one question:
*Can I make this change so that observable behavior is provably unchanged (or unambiguously corrected), with
a test that proves it, as a mechanical edit rather than a judgment call?*

- **Confident yes** → fix it.
- **Anything less than confident** → **don't.** Write it into `code-quality-log.md` as a hand-back and move
  on. Bias hard toward leaving it for the human.

Hard rule for "safe only": **every optimization or refactor must be covered by a test that passes both before
and after the change** (write the pinning test first if one doesn't exist). If you can't prove behavior is
preserved, it's a hand-back, not a fix. No speculative rewrites, no architecture changes, no new
dependencies — those are all stop-and-report.

### 6. Fix + gate — everything must pass before committing/merging
- Make the change as **small, revertible commits** — one logical step each. Test-first where it makes sense.
- **Never hand-edit generated artifacts** (`public/atlas/atlas.json`, `.local-atlas/`, `dist/`, `dist-ssr/`).
  Edit source and rebuild. A pre-tool hook enforces this.
- Run the full gate:
  - `npm run lint` → clean
  - `npx tsc --noEmit` → clean
  - **Tests, sharded to avoid the known OOM.** Running the whole suite at once crashes the test runner on
    this machine (~200 files, 4 GB coordinator). Run each quarter and require all four green:
    - `npx vitest run --pool=forks --poolOptions.forks.maxForks=3 --shard=1/4`
    - `npx vitest run --pool=forks --poolOptions.forks.maxForks=3 --shard=2/4`
    - `npx vitest run --pool=forks --poolOptions.forks.maxForks=3 --shard=3/4`
    - `npx vitest run --pool=forks --poolOptions.forks.maxForks=3 --shard=4/4`
  - If the change touches the build/scan pipeline: `npm run atlas:publish:integrity-smoke` **and**
    `npm run atlas:publish` → green (no DM-content leak, shapes intact).
  - The repo's pre-commit hook runs TypeScript + ESLint + changed tests on every commit — let it run;
    **never** use `--no-verify`.
- **If any gate fails and the fix isn't an obvious in-scope follow-up:** revert this run's commits, log the
  failure, do **not** merge, and go to step 7. Never leave `auto/continuous-dev` red.

### 7. Merge into the integration branch
- Merge the run's worktree branch into `auto/continuous-dev` (preserve the small commits).
- **Never merge to `main`.** Remove the worktree to keep things tidy.

### 8. Log the run, then release the lock
- Append one entry to `docs/automation/code-quality-log.md`:
  - **Fixed:** one plain-language line of what got better (add "no behavior change" if it was internal-only),
    plus date + commit hash; **or**
  - **Clean run:** "scanned, nothing safe to fix" — a good outcome; **or**
  - **Handed back:** the problem you found but didn't touch, in plain language, so the human can decide. Don't
    duplicate a hand-back that's already listed.
- Set the first line of `ACTIVE.md` back to `Run status: IDLE` — again, **only that line.**
- End the run.

---

## Stop-and-report — hand back instead of changing when…
- The shared branch is red for a reason that isn't an obvious in-scope fix.
- The only improvements you can find would (or might) change behavior, or need a judgment call.
- A fix would need a new dependency or new tooling.
- An "optimization" can't be proven behavior-preserving by a test.
- The change would touch architecture, the build pipeline's contracts, or anything on the **HAND-BACK** or
  **NEVER** lists in `continuous-dev-roadmap.md`.
- Anything feels off. When in doubt, stop — and remember: **a clean run that changes nothing is a success.**

## Guardrails (always)
- **Opus 4.8 only, at max thinking effort.** This routine makes unattended safety judgments, so it runs on
  the stronger model — unlike the hourly feature routine, which is Sonnet.
- **One fix per run.** No marathons.
- **`main` is sacred.** This routine merges only into `auto/continuous-dev`.
- **Behavior-preserving by construction, proven by tests.** If you can't prove it, don't ship it.
- **No new dependencies or tooling** without handing back first.
- **Revertible** — small commits, full gate before merge.
- **No branch deletion** without the safe-cleanup protocol (`memory/safe_cleanup_protocol.md`).
- **Plain-language log entries** — say what got better for the DM/player, not internal codenames.

---

## The daily routine prompt (paste this into a new Claude Code desktop routine)

```
You are the campaign-atlas code-quality routine. Use the Opus 4.8 model at max thinking effort.

1. Read memory/handovers/ACTIVE.md and docs/automation/code-quality-routine.md in the
   campaign-atlas-final repo.
2. Follow code-quality-routine.md exactly, in order, for this single daily run.
3. Honor the shared lock in ACTIVE.md: if any run is IN_PROGRESS and less than 3 hours old, STOP now and
   change nothing.
4. Confirm auto/continuous-dev passes every gate first (lint, tsc, and the sharded test run). Then make at
   most ONE safe, behavior-preserving fix — a failing test, a lint/type error, provably dead code, a clear
   bug, or an optimization proven identical by a test. Pass every gate before merging into
   auto/continuous-dev. Never touch main.
5. If a change might alter behavior in any way you can't prove safe, or needs a judgment call, do NOT make
   it — write it up in docs/automation/code-quality-log.md and hand it back.
6. Finding nothing safe to fix is a SUCCESS — never invent work. Always finish by logging the run and
   setting the Run status line in ACTIVE.md back to IDLE.
```

### Turning it on (one time)
Open Claude Code's **routines / scheduled tasks**, create a new routine, paste the prompt above, and set it
to run **once a day** at a quiet time on this PC. That's it — it shares the same safety lock as your hourly
feature routine, so the two will never run on top of each other.
