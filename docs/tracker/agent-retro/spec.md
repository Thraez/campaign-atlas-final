# Retro: the agent sessions of 2026-10-27/28

Over these two days an orchestrator session and its side sessions evaluated the atlas, filed tickets
and built them. Most of the building happened overnight while Isak slept. PRs #57 to #90 all merged
and published by the evening of 2026-10-28. The rules for merging changed three times along the way.
This file covers what worked, what slowed us, and the tickets that follow from it. The code retro is
`../code-retro/`.

## What worked

- **A third review lens for player safety.** Each PR got a Standards and a Spec review (two Opus
  agents). Anything that touched visibility, parsing or the scans also got an adversarial safety
  review against `main`'s logic. That review found four leaks that were already live on `main`:
  - a DM note overwriting a player entity in Sync;
  - an image path escaping its folder;
  - the `publish: false` bypass;
  - a failed build that still wrote the player atlas.

  Standards and Spec caught none of the four. When the safety lens re-checked its own fixes, two of
  three re-checks found something more.
- **Invariant tests over case-by-case fixes.** The `publish: false` bypass got past a fix aimed at
  that one case. It was caught by a 144-case test: write a note, read it back, and check it is never
  more visible than its source. For anything touching visibility, ask the builder for the invariant
  test from the start.
- **Provisional calls.** Work never stopped on a question: each open question got its recommended
  answer, logged in `State.md`, and Isak reviews them in a batch.
- **Stacking branches that edit the same file.** It kept each PR's diff conflict-free. Later, when
  the conflicts came, every one could be resolved by keeping both sides.
- **The full local gate in place of CI**, followed by a check of the live site after each publish.

## What slowed us

1. **CI minutes ran out.** The PR check ran on every push to a PR into `main`. Retargeting a stacked
   PR started another run, and sessions waited on checks. Isak had to stop it by hand. #90 made the
   PR check manual. `publish-atlas.yml` still runs `test:ci` on every merge, and `npm-audit.yml`
   still runs every week. → 03
2. **The gate lived in a scratch script.** "Full local gate" meant eight commands kept in a session
   scratchpad (`gate.sh`), and that script had a log-naming bug. The repo's `npm run verify` covers
   only three of the steps. → 01
3. **The rules changed and the docs did not.** The merge rule went from "commit on `main`, no PRs" to
   "PRs wait for Isak's yes, because a merge publishes", and then to "merge on the local gate plus an
   Opus review". `workflow.md` still said "Work on `main`, no PRs", and `State.md` grew to 300 lines
   of queue. → 02
4. **Local `main` drifted.** 21 docs commits never left local `main`, and tickets 33-43 sat only on
   a side branch (`eval-sweep5-docs`). Branches cut overnight from local `main` carried those docs
   commits into their PRs. Fixed by the wind-down PR. Rule now: tracker edits ride with the ticket's
   PR or go in a docs PR. Nothing waits on local `main`.
5. **Refused or prompting commands**, each a stall while Isak was away:
   - `npm run atlas:publish` (on the ask list);
   - `git reset --hard`;
   - long chained commands with shell variables;
   - `gh pr update-branch`;
   - pushes that Auto refused.

   Replacements now used: the publish steps run one by one; `git -C <path> checkout -- .`; one plain
   command per call. A merge that conflicted in GitHub was resolved locally in a worktree.
6. **Approvals relayed between sessions don't count.** One push waited until Isak said yes in that
   session's own chat. That is correct, but plan for it: a session that will need a push needs
   Isak's yes in its own chat.
7. **Builders marked tickets done before review**, three times. Briefs now say "review pending", and
   the status changes only after review.
8. **The Mac ran out of capacity.**
   - Load from parallel sessions (a load average of about 33) made Vitest workers hit the 60 s
     timeout. Rerunning the failed shard once the load dropped passed every time.
   - A usage limit stopped four agents at once around 03:00; each one resumed once it reset.
9. **zsh modifiers.** `$b:r` and `$T:s` are zsh modifiers, so they mangled a refspec and a
   `git cat-file` path. Write `${b}` before a colon.
10. **Reviewer claims need a spot check.** One "case-sensitive search" bug was false: the index body
    is lowercased on load.

## Tickets

| #   | Ticket                                                                  | Status           |
| --- | ----------------------------------------------------------------------- | ---------------- |
| 01  | [One local gate command](issues/01-one-gate-command.md)                 | ready-for-agent  |
| 02  | [Agent docs match the merge flow](issues/02-agent-docs-match-merge-flow.md) | done         |
| 03  | [No scheduled CI](issues/03-no-scheduled-ci.md)                         | ready-for-human  |
