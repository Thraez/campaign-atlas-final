# How the skills fit the atlas's process

Matt's skills assume a team product with PRs. The atlas is Isak's solo tool whose one hard promise is player safety. Where they disagree, this file wins. Decided 2026-10-27: Matt's way on every clash.

## Where work and decisions live

- **Goals** and what "working" means: `docs/GOALS.md`. **State**: `State.md`.
- **Work**: tickets in `docs/tracker/` (`docs/agents/issue-tracker.md`). Big multi-session efforts get a `/wayfinder` map there.
- **Decisions**: ADRs in `docs/adr/` (`docs/agents/domain.md`). `docs/decisions.md` is closed.
- **Retired**: the continuous-dev routine, `DEVELOPMENT_WANTS.md` and the superpowers plans, all in `docs/archive/`. Project memory `handovers/ACTIVE.md` is closed with them.

## Done

A ticket is done when:

1. `npm run typecheck:all`, `npm run lint` and `npm run test:ci` pass;
2. any pipeline it touches passes its checks (`npm run atlas:build:player`, then `npm run atlas:check-secrets` and `npm run atlas:check-derived` on the output, or the full `npm run atlas:publish` chain when scans or the build change);
3. `/code-review` has run on its diff;
4. a change Isak must see (map look, editor UI) has his look. Until then it stays `ready-for-human`.

Then commit it on `main`.

## Git

- Work on `main`, no PRs. Commit locally per ticket.
- A push to `main` publishes the site. Push once at the end of a work session, and only with Isak's yes.

## Tests and seams

- `/tdd` and `/diagnosing-bugs` test at the module interfaces: the build (`scripts/build-atlas.ts`), the safety scans, the importer (`src/atlas/import/`) and the save endpoint (`scripts/vite-plugin-atlas-save.ts`).
- Anything that decides what players see is tested first: a fixture note in, the player build out, the secret absent.
- Editor UI is checked in the preview pane (`.claude/launch.json` → `atlas-editor`), not unit-tested first.

## Not used here

`triage`, `implement-spec`, `pr`, `handoff` and pushed `research/` branches.
