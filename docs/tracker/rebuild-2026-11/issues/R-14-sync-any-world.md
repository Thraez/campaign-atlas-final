# R-14 Sync targets any world

Status: ready-for-agent
Blocked by: R-13
Size: S-M
Branch: `rebuild-r14-sync-any-world`

Sync from Obsidian picks the first world when none is named:
`syncWorldFromProject` (`src/atlas/sync/sync.ts:110-111`) falls back to `project.worlds[0]`, and it
collects `existingById` and `entityMeta` from every entity in the DM build, whatever its world. With
several worlds (R-13), a sync could match a vault note to an entity of another world, or write into
the wrong folder. The CLI already takes `--world` (`scripts/atlas-sync.ts:72`).

## Acceptance criteria

- `syncWorldFromProject` requires a world id when the build has more than one world, and fails with
  a message listing the worlds; with exactly one world it may default to it. No `worlds[0]`.
- `existingById` and `entityMeta` hold only the target world's entities; an entity with the same
  id in another world is not matched, updated or overwritten.
- Files land under `content/<target world>/`; entries in the sync map (`.local-atlas/sync-map.json`,
  read by `src/atlas/sync/useSyncSettings.ts`) carry their world, so the same vault note synced into
  two worlds doesn't clash; an old map without worlds reads as the v1 default world.
- A memory-port test (`VaultPort` in-memory adapter, `src/atlas/sync/vaultPort.ts`) with a DM build
  of two worlds sharing one entity id: a sync into world B creates or updates only B's file and
  leaves A's untouched; a dry run lists only B's rows.
- The editor's Sync panel and `useMdImportFlow` (`src/atlas/import/useMdImportFlow.ts`) pass an
  explicit world id; the old editor keeps working on today's one-world content.
- R-01's guard is untouched: a real (non-dry-run) Sync still refuses while `hosting: public`.
- `npm run gate` passes.

## Touches

- `src/atlas/sync/sync.ts`, `src/atlas/sync/SyncPanel.tsx`, `src/atlas/import/useMdImportFlow.ts`,
  `scripts/atlas-sync.ts`, `scripts/vite-plugin-atlas-save.ts` (sync route, if it picks a world),
  sync tests.

## Out of scope

- Stripping `atlas.placements` on sync (after cutover).
- A world picker UI in the new editor (E10, phase 6).
- Running Sync on the real vault (blocked by H-04).

No adversarial player-safety review needed unless the change touches what visibility Sync writes;
if it does, it needs one.
