# Sound-only areas inside fog ship to players

Status: ready-for-agent
Blocked by: the Morning queue (`build-atlas.ts` is in #100)
Area: player safety, build, fog scan
Payoff: med-high · Size: S-M

`filterSoundscapeForPlayer` (`scripts/atlas/filterSoundscape.ts` ~29-39) never checks a
sound-only area's own `points` against fog, while regions are (`build-atlas.ts` ~787-790). The fog
scan doesn't look at the soundscape (`check-fog-safety.ts` ~203-237). An area with no `visibility`
ships too, though the editor creates areas as `dm` (`useSoundscapeDraft.ts`).

## Acceptance criteria

- The filter takes `isFogged` and drops a fogged sound-only area; the build passes it.
- The fog scan checks sound areas (a new code).
- Decide and test the missing-visibility case (provisional call: `dm`, matching the editor).

## Comments

- 2026-11-08 (rebuild phase 2 tickets): folded into
  [R-11b](../../rebuild-2026-11/issues/R-11b-build-calls-resolver.md) (build calls the resolver):
  build it there, not here. The missing-visibility case is already decided and built (R-02, #116:
  a sound-only area with no `visibility` is `dm`). The fog drop and the fog scan's new code are
  R-11b's acceptance criteria.
