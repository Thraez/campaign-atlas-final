# Staging shows the visibility it will write

Status: done
Area: Sync from Obsidian

`src/atlas/import/ImportStagingModal.tsx:208-216` shows the vault's visibility on create rows, but `buildImportChanges.ts:90-91` writes `dm`. Approving a secrecy increase does nothing (`mergeImportFrontmatter.ts:119`).

Goal rule (`docs/GOALS.md`): notes from `01_Lore` and `02_Regions` arrive as `player`; from `03_Entities` and `04_Factions` as `dm` until tagged.

## Acceptance criteria

- The Visibility shown on every Staging row equals what commit writes.
- Folder rule above holds, with a test per folder.
- Approving a secrecy increase (player to dm) writes the lower visibility.

## Comments

2026-10-27, branch `code-retro-fixes`:
- Each Staging row's `resolvedVisibility` is now what commit writes. A new note gets its own tag, else the folder rule (`defaultVisibilityForVaultPath` and `PLAYER_VAULT_FOLDERS` in `inferType.ts`). An update keeps the atlas's visibility, except for a secrecy increase, which shows and (once approved) writes the vault's.
- `buildImportChanges` writes `row.resolvedVisibility` on create and the approved value on update.
- This replaces the old "new imports are always dm" rule. A dropped file outside the vault, untagged, is still `dm`.
- The modal no longer locks new rows' visibility (its "saved DM-only" tooltip was no longer true). Vault updates stay locked, with a tooltip pointing to the editor.
- Also fixed: the editor never passed the DM atlas's visibility and type (`entityMeta`) to the Sync hook. So in the app an update row couldn't know its visibility, and the secrecy-increase and type-conflict reviews never fired. `AtlasPlacementEditor` now builds and passes it.
- Tests: 8 in `src/test/build-import-changes.test.ts`, one per folder plus tag, dropped file, update and approval. Three older tests that pinned the dm lock were updated.
- Seen, not changed: staging infers type from folders using the bare filename, not the vault path (`extractStagingFields(input.raw, input.filename)`), so `03_Entities/NPCs` → npc never fires for vault notes. That's a candidate for ticket 07.
