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
