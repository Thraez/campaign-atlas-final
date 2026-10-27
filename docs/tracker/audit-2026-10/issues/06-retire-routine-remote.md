# Delete the routine's remote branch

Status: ready-for-human
Blocked by: Isak's yes at push time

The continuous-dev routine is retired (docs in `docs/archive/`). Its one unmerged commit (`84c195a`, AGENTS.md trim) was applied by hand on `main` on 2026-10-27.

## Acceptance criteria

- Tag `archive/continuous-dev` at `origin/auto/continuous-dev` (`84c195a`) and push the tag.
- Delete `origin/auto/continuous-dev`.
- The PC side follows `docs/PC-CLEANUP.md`.
