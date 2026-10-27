# Vault image copy: stay inside the vault, don't overwrite

Status: done
Area: Sync from Obsidian

`indexVaultImages` (`scripts/vite-plugin-atlas-save.ts` ~1212) checks `path.resolve`, not
`realpath`, so a symlinked image pointing outside the vault can be copied. The copy writes with
`process.cwd()` instead of the server root (~1251) and silently overwrites `<entityId>-<n>`.
Its re-encode policy is a second copy of the save path's (~500-541).

## Acceptance criteria

- A symlink in the vault that points outside it is refused (test).
- The copy never overwrites an existing file (test).
- It writes under the server root, through the same image cleaning as save.

## Comments

2026-10-27, branch `eval-05-vault-image-copy`:
- The vault index skips symlinks, and the copy resolves the real path and refuses any image whose
  real path is not exactly where the index saw it (a symlinked file or folder on the way).
- The copy writes with `wx`: the same bytes reuse the file (a re-sync); different bytes take the
  next free `-2`, `-3`… name. Nothing is overwritten.
- `publicDir` is required and the dev route sets it from `server.config.root`; `process.cwd()` is
  gone.
- `cleanImageBytes` in `scripts/vite-plugin-atlas-save.ts` is the one re-encode for both save and
  copy. Its settings come from `imageEncoding.ts` (`REENCODE_QUALITY` for a JPEG or WebP kept as
  is), and so does the `-2` naming (`suffixedName`). Copies of `.webp` were already re-encoded
  (sharp's default, quality 80); now they match saves at 85.
- A failed write reports `write-failed`, not `unreadable`.
- From the review: an image changed in the vault and re-synced gets a new `-2` name; the old file
  stays until the asset audit or a delete removes it.
- Tests: `src/test/import/vault-image-copy.test.ts` ("vault image copy safety").
