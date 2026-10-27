# Sync from Obsidian as one module behind a vault seam, with a dry run

Status: ready-for-agent
Blocked by: 06
Area: Sync from Obsidian

The steps run in a fixed order inside a 280-line React hook (`useMdImportFlow.ts`) with fetch and toast calls; nothing can dry-run against the real vault. Files: `useMdImportFlow.ts`, `stagingState.ts`, `buildImportChanges.ts`, `mergeImportFrontmatter.ts`, `syncMap.ts`, `resolveVaultImage.ts`, `src/atlas/sync/useSyncSettings.ts`, the vault-scan and image-copy handlers in `scripts/vite-plugin-atlas-save.ts`. `parseObsidian.ts` is only used by tests (delete or fold in).

Deepening: `planSync` / `commitSync` behind a vault port, with three adapters: the dev endpoint, in-memory for tests, Node fs for a CLI.

## Acceptance criteria

- `npm run atlas:sync -- --dry-run <vault>` over the real vault prints create/update/unchanged counts per folder and writes nothing.
- Running sync twice: the second run reports zero changes.
- The ticket 03 cases pass against the in-memory adapter.
- The editor's Sync panel works as before (checked in the preview pane).
