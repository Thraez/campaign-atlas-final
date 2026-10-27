# Clear the production dependency audit

Status: ready-for-agent

The weekly `npm-audit.yml` run has failed since at least 2026-10-12: 21 vulnerabilities (3 critical) in production dependencies, among them dompurify, react-router, undici, js-yaml and zod. `isomorphic-dompurify` pulls jsdom and undici into production dependencies.

## Acceptance criteria

- `npm audit --omit=dev --audit-level=high` exits 0.
- `npm run typecheck:all`, `npm run lint`, `npm run test:ci`, `npm run atlas:publish` pass.
- If `npm audit fix --force` would bump a major (zod), the bump has its own commit and the build's schema checks still pass.
- Consider swapping `isomorphic-dompurify` for plain `dompurify` in the browser and the build's own sanitiser, if that drops jsdom from production; note the outcome here.
