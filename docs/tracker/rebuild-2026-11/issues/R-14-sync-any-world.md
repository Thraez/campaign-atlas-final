# R-14 Sync targets any world

Status: done
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
- `existingById` and `entityMeta` hold only the target world's entities; an entity of another
  world is not matched, updated or overwritten. Note ids are global across worlds (the build's
  duplicate-slug check refuses a second note with the same id; provisional call 2026-11-10), so a
  vault note whose id lives in another world is held for review (`id-in-other-world`, naming that
  world), can't be ticked or committed, and is refused by an unattended sync. The same holds for
  the editor's drag-and-drop and paste import.
- Files land under `content/<target world>/`; entries in the sync map (`.local-atlas/sync-map.json`,
  read by `src/atlas/sync/useSyncSettings.ts`) carry their world; an old map without worlds belongs to the DM
  build's world when it has exactly one, and is refused (delete it, or sync once on a one-world
  build) when it has several.
- A memory-port test (`VaultPort` in-memory adapter, `src/atlas/sync/vaultPort.ts`) with a DM build
  of two worlds: a sync into world B with a vault note whose id is already in A holds that note and
  writes nothing for it, B's own notes update only B's files, A's are untouched, and a dry run lists
  only B's rows.
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

## Done

A sync names its world: `syncWorldFromProject` refuses an unknown world and, with several worlds
and none named, lists them; one world is the default. `worldEntities` keeps only the target
world's entities (a worldless entity counts only in a one-world build), so a shared id matches
the target's file only. `commitSync` refuses any change outside `content/<world>/`.
`.local-atlas/sync-map.json` is now `{version: 2, worlds}`, read and written per world; an old
flat map belongs to the DM build's only world and is refused with several (the dev route and the
CLI port normalize it; the browser never guesses; no `defaultWorld` read), and a failed read
throws instead of reading as empty. `commitSync` re-checks every ticked row's id against the other
worlds itself, and `/__atlas/local-write` refuses `sync-map.json`. R-01's guard and the scan
read every world's entries. The Sync panel shows and passes the open map's world and is disabled
without one. Note ids are global across worlds: a note whose id another world holds is held
(`id-in-other-world`) in Sync and in the editor's import, can't be ticked or committed, and an
unattended sync refuses it. Per-world map saves merge server-side under a lock file
(`saveWorldSyncMap`, the dev route `/__atlas/local/sync-map/world` and the CLI port), so two worlds'
saves never lose each other's entries. Beyond the spec: `SyncWorld.dmBuildSize` lets a sync create notes in a world that
has no entities yet while the DM-build check still covers the whole build.
