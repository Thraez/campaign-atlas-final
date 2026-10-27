# Sync records what it wrote, checks conflicts before copying images, follows moves

Status: ready-for-agent
Area: Sync from Obsidian (`src/atlas/import/useMdImportFlow.ts`)

- ~257-300: the sync map isn't saved when the rebuild fails, although the files were written.
- ~221-254: images are copied before the conflict check, so a 409 leaves stray images.
- ~158-163: a moved note is never re-recorded at its new path, so the next sync duplicates it.

## Acceptance criteria

- A failed rebuild still records the sync map for the files that were written.
- A 409 conflict leaves no copied images.
- Moving a note in the vault updates its sync-map path; the next sync changes nothing.
- If the fixes need the logic out of the React hook, do the minimum here and leave the rest to ticket 07.
