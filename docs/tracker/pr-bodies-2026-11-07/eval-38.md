Ticket: `docs/tracker/eval-2026-10/issues/38-deep-links-one-resolver.md`

Deep links resolve the same way on load, on Back/Forward and on an entity click: one pure
`resolveDeepLink(link, project, {currentMapId, defaultMapId, hasDesktopAside})` in
`src/atlas/resolveDeepLink.ts`.

- On phones, Back and Forward to an entity entry open the bottom sheet.
- `viewerHistory.ts` replaces the raw `pushState(null)`/`replaceState(null)`, which reset
  react-router's history index; the helpers keep `{usr, key, idx}`.
- Popstate is skipped when leaving the viewer's route (Back to Landing no longer gets `?map=…`
  written onto it) and when only the hash changed (an in-page `#` link doesn't reopen a closed sheet).
- Provisional calls (in the ticket): an entity link with no center uses the URL's map, else its
  placement on the default map, else its first placement; an entity link whose map is missing or
  invalid drops its center and resolves the same way; a bare center with an invalid map goes to the
  default map and flies there.
- Tests: a 12-URL table through load and popstate options; the real viewer, load vs Back; phone
  sheet; router index under BrowserRouter; the two popstate guards (each fails without its guard).

Review (Opus, medium): resolver shared; its findings (center from a missing map, Back to Landing,
`#` links, ticket wording) fixed in 536e8d7.

## Local gate (2026-11-07, branch at 536e8d7, on origin/main 2f4e7e6)

```
typecheck:all exit 0 · lint exit 0 · format:check exit 0
test:ci exit 0 — all shards green
atlas:publish exit 0 · atlas:check-secrets dist exit 0 · atlas:check-derived dist exit 0
GATE PASSED
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
