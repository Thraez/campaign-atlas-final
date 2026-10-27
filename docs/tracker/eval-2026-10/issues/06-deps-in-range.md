# In-range dependency updates; drop date-fns

Status: done
Area: dependencies

`npm outdated` on 2026-10-27: Radix packages, typescript-eslint, prettier, tsx, marked, postcss,
autoprefixer and others have newer versions inside their ranges. `date-fns` is imported nowhere.

## Acceptance criteria

- `npm update` within the existing ranges; `date-fns` removed.
- `npm audit` no worse than before.
- Typecheck, lint, `npm run test:ci`, `atlas:publish` and the integrity smoke pass.

## Comments

2026-10-27, branch `eval-06-deps-in-range`: `npm update` within the ranges and `date-fns`
removed. TypeScript went 5.8 to 5.9, which types `Uint8Array` buffers more strictly; two
signatures in `src/atlas/secrets/secretCrypto.ts` now say `Uint8Array<ArrayBuffer>`.
`npm audit`: 7 before, 7 after (the libvips advisories in `sharp` and the rest from
`audit-2026-10/02`). Typecheck, lint, `test:ci`, `atlas:publish` (12 scans) and the smoke pass.
