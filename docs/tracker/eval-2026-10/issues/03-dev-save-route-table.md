# Dev save endpoint as one route table

Status: done
Blocked by: 01
Area: editor, local save

`scripts/vite-plugin-atlas-save.ts:1363-1712` has about ten middlewares, each repeating the
loopback check, URL and body parsing, JSON replies and the build lock, with four result shapes.
A new route that forgets `rejectNonLoopback` would expose the vault on the LAN.
`EDITOR_CODE_FINGERPRINTS` (`scripts/check-no-secrets.ts:31-38`) misses `/__atlas/read`,
`vault-scan`, `vault-image-copy` and `local-write`. Request bodies have no size limit.

Leave the vault handlers' insides alone (`code-retro/07`).

## Acceptance criteria

- One table of routes: method, path, whether it takes the build lock, a handler returning
  status and body. The loopback check and parsing are applied once, for every route.
- A test: every route in the table refuses a non-loopback request.
- `EDITOR_CODE_FINGERPRINTS` comes from the table, or a test checks it lists every route.
- Request bodies have a size limit.
- The existing guard and save tests pass unchanged.

## Comments

### 2026-10-27, branch `eval-03-route-table` (cut from `eval-05-vault-image-copy`)

- `DEV_ROUTES` in `scripts/vite-plugin-atlas-save.ts` is the one table: method, path,
  `takesBuildLock`, body cap, and a handler returning status and body. All 14 routes are in
  it, including the four `.local-atlas` overlay GETs (`/atlas/atlas.json`,
  `/atlas/search-index.json`, `/__atlas/local/editor-settings.json`, `/__atlas/local/sync-map.json`).
  `createDevRouter` is the single middleware: loopback gate for every `/__atlas/*` request
  (any method, known route or not), then build lock (423), body cap (413) and JSON parse (400),
  then the handler. Response shapes and status codes are unchanged; vault handler insides untouched.
- Paths live in `scripts/atlas/devRoutes.ts` (plain strings). `EDITOR_CODE_FINGERPRINTS` is built
  from it, so it now also covers `/__atlas/read`, `vault-scan`, `vault-folders`,
  `vault-image-copy`, `local/...` and `local-write`, `assets/images`. Player build scans clean.
- Body caps: save 128 MB, local-write 8 MB, vault-image-copy 1 MB. Nothing caps how many files
  one save batch holds, so the save cap is a ceiling against runaway requests, not a computed fit:
  about ten or more full-size editor image uploads in one save would hit it (vault images go
  through vault-image-copy). Over the cap: Content-Length checked first, then the rest of the body
  is drained and discarded and the reply is 413 `{ error: "PayloadTooLarge" }` with
  `Connection: close`. Draining matters: closing the socket mid-upload makes a browser report
  "Failed to fetch" instead of the 413.
- Test: `src/test/atlas-dev-routes.test.ts` (every route refuses LAN peers, cross-origin pages,
  LAN Host and Origin-less writes; fingerprints cover every route; body cap, lock and
  InvalidBody shapes over a real loopback socket).
- No leak found: the overlays were already gated. Two small hardenings: `/__atlas/local/*` now
  403s a refused request instead of falling through to Vite, and a wrong-method or unknown
  `/__atlas/*` request is gated before it is handed on. A handler that throws now gets a 500
  instead of a hung request.
- Review fixes: the drain above, `devRouteRefusal` renamed `refusalPolicy`, unused `DevApiPath`
  type dropped. Gate: typecheck, lint (0 errors), format, `test:ci`, full `atlas:publish`
  (12 scans clean) and `atlas:publish:integrity-smoke`.
