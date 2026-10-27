# Sync's vault scan works in the browser and skips DM folders by default

Status: ready-for-agent
Blocked by: 04
Area: Sync from Obsidian

Two bugs, found 2026-10-27 by the eval-04 tests and checked by hand.

- `/__atlas/vault-scan` answers `{ files }` (`scripts/vite-plugin-atlas-save.ts` ~1469), but
  `openWithVaultScan` (`src/atlas/import/useMdImportFlow.ts:160`) refuses anything without
  `data.ok`. In a real browser every scan toasts "Vault scan failed: undefined". The tests mock
  the response with `ok: true`, so none caught it. Present since the first Sync commit (44804d1,
  2026-06-17); Sync has likely never run end to end.
- With no folders ticked (the default) the scan reads the whole vault. `IGNORED_FOLDERS` in
  `src/atlas/import/inferType.ts` doesn't list `10_DmNotesAndSecrets`, `00_SessionNotes` or
  `11_DmToolBox`, so their notes are written into `content/` as `dm`. The player build drops them,
  but they sit in the repo, and an embed in them can copy a DM-only image.

## Acceptance criteria

- The client reads the scan's HTTP status (`resp.ok`, `resp.status`) and the route's real body;
  a test drives the real route handler's response through the client mapping, not a mock shape.
- Default Sync leaves out `10_DmNotesAndSecrets`, `00_SessionNotes` and `11_DmToolBox` (per
  `04`'s criteria); the `it.fails` tests in `src/test/sync-safety.test.ts` become plain passing
  tests.
- `docs/IMPORT_EXPORT.md` ("Vault folder names") lists the new ignored folders.
