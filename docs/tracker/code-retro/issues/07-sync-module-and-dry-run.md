# Sync from Obsidian as one module behind a vault seam, with a dry run

Status: ready-for-human (review pending)
Blocked by: 06
Area: Sync from Obsidian

The steps run in a fixed order inside a 280-line React hook (`useMdImportFlow.ts`) with fetch and toast calls; nothing can dry-run against the real vault. Files: `useMdImportFlow.ts`, `stagingState.ts`, `buildImportChanges.ts`, `mergeImportFrontmatter.ts`, `syncMap.ts`, `resolveVaultImage.ts`, `src/atlas/sync/useSyncSettings.ts`, the vault-scan and image-copy handlers in `scripts/vite-plugin-atlas-save.ts`. `parseObsidian.ts` is only used by tests (delete or fold in).

Deepening: `planSync` / `commitSync` behind a vault port, with three adapters: the dev endpoint, in-memory for tests, Node fs for a CLI.

## Acceptance criteria

- `npm run atlas:sync -- --dry-run <vault>` over the real vault prints create/update/unchanged counts per folder and writes nothing.
- Running sync twice: the second run reports zero changes.
- The ticket 03 cases pass against the in-memory adapter.
- The editor's Sync panel works as before (checked in the preview pane).

## Comments

2026-10-28, branch `code-retro-07-sync-module` (stacked on code-retro 06):

- Module: `src/atlas/sync/sync.ts`. `planSync(port, world, source, { dryRun })` scans, classifies against the sync map (moves re-keyed and saved unless dry run), builds Staging rows and holds local edits; `commitSync(port, rows, source)` checks create targets, copies images, writes, records the sync map. `countByFolder` gives create/update/unchanged/skipped per top-level vault folder. The port is `src/atlas/sync/vaultPort.ts`.
- Adapters: `devEndpointPort.ts` (the editor, `/__atlas/*`), `memoryVaultPort.ts` (tests), `scripts/atlas/fsVaultPort.ts` (Node; calls the plugin's own scan, image-copy and save handlers in-process, so `vite-plugin-atlas-save.ts` is unchanged). A dry-run fs port throws on every write.
- `useMdImportFlow.ts` is now state and toasts over `planSync`/`commitSync`. Its interface to the editor is unchanged; the existing hook tests pass as they were.
- CLI: `npm run atlas:sync -- --dry-run <vault>` or `--write <vault>`, with `--folder`, `--ignore`, `--world`, `--repo`. Reads the DM build in `.local-atlas/atlas.json` and the editor's saved folders/globs. `--write` doesn't rebuild.
- Behaviour change to review: the hook never passed the sync map into Staging's context, so identity by sync map (§5.3) and the type-conflict check (needs `baseType`) never ran in the editor. `planSync` passes it.
- Tests: `src/test/sync/sync-module.test.ts` (12, in-memory: counts, picked/ignored folders, dry run, local edits, sync twice, the five 03 cases), `scripts/atlas/fsVaultPort.test.ts` (5, temp vault and repo: dry run changes no file, write then a second run reports 0 create/update).
- Dry run of the real vault (whole vault, no folders saved; no sync map in this worktree, so nothing counts as unchanged yet):

  ```
  folder           create     update  unchanged    skipped
  (vault root)          2          0          0          0
  00_Dashboard          5          0          0          0
  01_Lore              35          0          0          0
  02_Regions           35          0          0          0
  03_Entities         110          3          0          0
  04_Factions           4          0          0          0
  09_Glossary           4          0          0          0
  Generators           18          0          0          0
  Y_Pictures            1          0          0          0
  total               214          3          0          0
  ```

- Needs Isak: open Sync from Obsidian in the preview pane (`atlas-editor`), scan, check Staging and commit as before.
