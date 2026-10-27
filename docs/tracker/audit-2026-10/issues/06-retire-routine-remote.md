# Delete the routine's remote branch

Status: done

The continuous-dev routine is retired (docs in `docs/archive/`). Its one unmerged commit (`84c195a`, AGENTS.md trim) was applied by hand on `main` on 2026-10-27.

## Acceptance criteria

- Tag `archive/continuous-dev` at `origin/auto/continuous-dev` (`84c195a`) and push the tag.
- Delete `origin/auto/continuous-dev`.
- The PC side follows `docs/PC-CLEANUP.md`.

## Comments

2026-10-27: tagged `archive/continuous-dev` at `84c195a`, pushed the tag, deleted `origin/auto/continuous-dev` (Isak's yes).
