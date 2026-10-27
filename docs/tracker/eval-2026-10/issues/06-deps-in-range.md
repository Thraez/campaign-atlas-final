# In-range dependency updates; drop date-fns

Status: ready-for-agent
Area: dependencies

`npm outdated` on 2026-10-27: Radix packages, typescript-eslint, prettier, tsx, marked, postcss,
autoprefixer and others have newer versions inside their ranges. `date-fns` is imported nowhere.

## Acceptance criteria

- `npm update` within the existing ranges; `date-fns` removed.
- `npm audit` no worse than before.
- Typecheck, lint, `npm run test:ci`, `atlas:publish` and the integrity smoke pass.
