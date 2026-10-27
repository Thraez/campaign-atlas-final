# Dev save endpoint as one route table

Status: ready-for-agent
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
