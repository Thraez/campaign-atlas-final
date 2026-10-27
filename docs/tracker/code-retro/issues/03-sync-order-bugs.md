# Sync records what it wrote, checks conflicts before copying images, follows moves

Status: done
Area: Sync from Obsidian (`src/atlas/import/useMdImportFlow.ts`)

- ~257-300: the sync map isn't saved when the rebuild fails, although the files were written.
- ~221-254: images are copied before the conflict check, so a 409 leaves stray images.
- ~158-163: a moved note is never re-recorded at its new path, so the next sync duplicates it.

## Acceptance criteria

- A failed rebuild still records the sync map for the files that were written.
- A 409 conflict leaves no copied images.
- Moving a note in the vault updates its sync-map path; the next sync changes nothing.
- If the fixes need the logic out of the React hook, do the minimum here and leave the rest to ticket 07.

## Comments

2026-10-27, branch `code-retro-fixes`, minimum changes inside the hook (the rest is ticket 07):
- The sync map is recorded right after the Save endpoint writes the files, before the rebuild result is looked at.
- Commit builds the changes once without images, and `assertCreateTargetsFree` (`buildImportChanges.ts`) checks that every file to be created is still free. A taken target raises the same `ConflictError("already-exists")` and toast as the endpoint's 409, before any image is copied. The changes are rebuilt only if an image was copied. Deleting copied images after a 409 was rejected: copy names are fixed per entity, so a re-sync can overwrite an image already in use. A 409 from the endpoint itself (a file appearing between the check and the save) can still leave copied images, a much smaller window.
- A note found moved (no entry at its path, its hash recorded at an old path that's no longer in the vault) has its entry re-keyed at scan time (`moveSyncEntry` in `syncMap.ts`) and saved. If the old path is still in the vault, it's a copy and nothing moves.
- Tests: `src/test/import/useMdImportFlow-order.test.ts` (5). `useMdImportFlow-vault-images.test.ts` was updated for the conflict check's read.
