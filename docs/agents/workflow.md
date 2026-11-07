# How the skills fit the atlas's process

Matt's skills assume a team product. The atlas is Isak's solo tool whose one hard promise is player safety. Where they disagree, this file wins. Decided 2026-10-27: Matt's way on every clash.

## Where work and decisions live

- **Goals** and what "working" means: `docs/GOALS.md`. **State**: `State.md`.
- **Work**: tickets in `docs/tracker/` (`docs/agents/issue-tracker.md`). Big multi-session efforts get a `/wayfinder` map there.
- **Decisions**: ADRs in `docs/adr/` (`docs/agents/domain.md`). `docs/decisions.md` is closed.
- **Retired**: the continuous-dev routine, `DEVELOPMENT_WANTS.md` and the superpowers plans, all in `docs/archive/`. Project memory `handovers/ACTIVE.md` is closed with them.

## Done

A ticket is done when its PR is merged after:

1. the full local gate passes on the branch with `main` merged in: `npm run gate`. It runs
   `typecheck:all`, `lint`, `format:check`, `test:ci`, `atlas:publish` (build plus the 9 scans, run 14 times across
   `dist`, `public/atlas` and `content/`; a missing or empty artifact fails a scan), then `atlas:check-secrets dist` and `atlas:check-derived dist`, stops at the first failure and
   names it, writes each step's log to `.gate-logs/`, and restores `public/atlas/` afterwards,
   pass or fail. A shard that times out under load is rerun once (inside `test:ci`);
2. `/code-review` has run on its diff and its findings are fixed. Anything touching visibility,
   parsing or the scans also gets an adversarial player-safety review, and a re-check of its fixes;
3. a change Isak must see (map look, editor UI) is listed in `State.md` for his look.

Set `Status: done` after the review, never before.

## Git

- A branch and a PR per ticket, cut from `origin/main`. Tracker and `State.md` edits ride in that PR
  or in a docs PR; local `main` holds nothing that isn't on `origin`.
- Merging publishes, so it needs Isak's yes (`AGENTS.md`, "Git and deploy"). GitHub CI is not a
  gate: nobody starts or waits on it.
- Stack a branch on another only when both edit the same file; retarget it to `main` once its parent
  merges.

## Tests and seams

- `/tdd` and `/diagnosing-bugs` test at the module interfaces: the build (`scripts/build-atlas.ts`), the safety scans, the importer (`src/atlas/import/`) and the save endpoint (`scripts/vite-plugin-atlas-save.ts`).
- Anything that decides what players see is tested first: a fixture note in, the player build out, the secret absent.
- Editor UI is checked in the preview pane (`.claude/launch.json` → `atlas-editor`), not unit-tested first.

## Not used here

`triage`, `implement-spec`, `handoff` and pushed `research/` branches.
