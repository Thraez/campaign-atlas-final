# A world.yaml visibility typo fails closed

Status: in-review
Area: player safety, world.yaml loader
Payoff: med · Size: S

`normalizeVis` (`scripts/atlas/loadWorldConfig.ts` ~486-489) turns an invalid value such as
`visibility: secret` into `player`, and tests lock that in (`atlas-world-loader.test.ts` ~489-503).
ADR-0001 left world.yaml defaults out of scope, but a typo failing open is a different case; the
lens already assumes `dm` (`projectMapForPlayer.ts` ~39).

Needs Isak: an ADR addendum. Recommended: an invalid value becomes `dm` with a build warning; a
missing value stays `player`.

## Acceptance criteria

- Invalid values load as `dm` and warn; missing stays `player`; tests updated; ADR addendum.

## Comments

2026-11-07: Isak's call (via the orchestrator): an invalid value loads as `dm`. Built in PR #110
(`arch-07-invalid-visibility-fails-closed`) with the ADR-0001 addendum. Provisional call: an empty
`visibility:` (YAML null) counts as invalid, so `dm`; only an absent key is `player`. Sound-only areas follow the same rule. Review follow-up (not
ticketed; `SoundscapeTab.tsx` is in #107): the tab shows an unset sound area as `dm` while the build
ships it.
