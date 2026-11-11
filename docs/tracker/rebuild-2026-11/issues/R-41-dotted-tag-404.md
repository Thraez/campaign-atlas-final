# R-41 A dotted tag loads on a direct link

Status: ready-for-agent
Blocked by: -
Size: S
Branch: `rebuild-r41-dotted-tag`
Model: Sonnet (settled plan)

Found by the R-36 Phase 3 playtest (2026-11-11, `previews/r36/notes.md`, gitignored).

Follow-up from R-34's review. `atlas:serve:next` returns 404 for a direct load of
`/atlas/tag/<tag>` when the tag has a dot (e.g. `v1.2`), because a missing name with an extension
is treated as a missing asset. No tag in `content-next/` has a dot today, so nothing shows yet.

## Acceptance criteria

- `/atlas/tag/v1.2` gets the site's `index.html` on the local server, like any other route.
- A missing asset (`/assets/x.js`) still gets a 404 (R-34's rule).
- Fix by limiting the 404 rule to asset folders or known extensions. Check what the hosted site
  (GitHub Pages) does with the same URL and note it.
- Test in `scripts/atlas/serveCampaigns.test.ts`.

## Touches

`scripts/atlas/serveCampaigns.ts`, its test.
