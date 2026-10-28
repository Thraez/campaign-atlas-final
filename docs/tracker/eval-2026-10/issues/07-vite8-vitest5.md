# Vite 8 with Vitest 5

Status: ready-for-human
Blocked by: tidemarrow/03
Area: dependencies

Vite 5.4 to 8 and Vitest 3.2 to 5 (with `@vitest/coverage-v8`, `@vitejs/plugin-react-swc` 4,
`vite-plugin-pwa` 2). Do them together: Vitest follows Vite's major.

## Acceptance criteria

- The player build's output passes every scan and the integrity smoke, and the prune plugins
  still run after the PWA step.
- `npm run test:ci` passes; the shard runner still recognises worker timeouts.
- The live preview (`atlas-pages-preview`) loads under `/campaign-atlas-final/`.

## Comments

2026-10-28, from eval-24: Vitest 4 removed `test.poolOptions`. `vitest.config.ts` sets
`poolOptions.forks.{maxForks, minForks, isolate}`; under Vitest 4+ that becomes top-level
`maxWorkers: 3` and `isolate: true` (`minForks` has no replacement). It is the only place the
worker cap lives now: `scripts/dev/shardOutcome.ts` passes only `--shard`/`--changed`.
