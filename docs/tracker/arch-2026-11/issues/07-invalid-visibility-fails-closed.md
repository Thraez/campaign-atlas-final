# A world.yaml visibility typo fails closed

Status: ready-for-human
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
