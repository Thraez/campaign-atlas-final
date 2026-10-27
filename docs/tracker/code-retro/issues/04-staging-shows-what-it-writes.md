# Staging shows the visibility it will write

Status: ready-for-agent
Area: Sync from Obsidian

`src/atlas/import/ImportStagingModal.tsx:208-216` shows the vault's visibility on create rows, but `buildImportChanges.ts:90-91` writes `dm`. Approving a secrecy increase does nothing (`mergeImportFrontmatter.ts:119`).

Goal rule (`docs/GOALS.md`): notes from `01_Lore` and `02_Regions` arrive as `player`; from `03_Entities` and `04_Factions` as `dm` until tagged.

## Acceptance criteria

- The Visibility shown on every Staging row equals what commit writes.
- Folder rule above holds, with a test per folder.
- Approving a secrecy increase (player to dm) writes the lower visibility.
