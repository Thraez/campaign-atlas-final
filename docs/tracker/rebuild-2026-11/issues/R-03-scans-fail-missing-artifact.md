# Scans fail on a missing artifact

Status: ready-for-human
Widens: arch-09 (`check-player-files` passed a `dist/atlas/` with no `atlas.json`)

In publish mode a missing listed dir fails every scan. Before this, most scans skipped a missing
target (`does not exist, skipping`) or passed an empty one (`no images found — clean`), so a
publish could go green with nothing checked.

## What changed

- Publish mode is the scan registry itself: `atlas:scan` (the orchestrator) runs only inside
  `atlas:publish`, so in `npm run gate` and `publish-atlas.yml`, and the editor's Publish check
  (`runPublishScans`) reads the same list. No flag or env var was needed.
- Each task in `scripts/atlas/scanRegistry.ts` lists the artifacts it scans (`requires`): the
  player `atlas.json` for the artifact scans (via `playerAtlasJsonPath(dir, layout)`), `content/`
  for `check-vault-content`, `public/atlas/assets/` and `content/` for `audit-assets`. Review
  hardening: `check-derived-secrets` and `check-image-privacy` also need `atlas.config.json` and
  `content/` (they derive secret names from it and pass with none), `check-fog-safety` needs
  `atlas.config.json` (without it the in-fog and alpha checks are skipped).
  `scanTasks` fails a task with exit 20 and names the path when a listed file is missing or empty,
  or a listed dir is missing or empty, before the scan runs. The Publish check shows a
  missing-artifact reason with the path as its locator.
- arch-09: `check-player-files` itself fails (18) when `dist/atlas/atlas.json` is missing, using
  `locatePlayerAtlas(dir, "built-site")`.
- Run by hand, the scans keep their old behaviour (a dir not built yet is skipped).

## Acceptance criteria

- [x] `check-player-files` on a built site fails when `atlas/atlas.json` is missing; test in
      `src/test/playerFiles.test.ts`.
- [x] Every scan in the registry, in publish mode, fails with the missing path named when an
      artifact it lists is missing or empty.
- [x] Table-driven test over the registry: for every task and every artifact it lists, the
      artifact removed and emptied fails the task (`scripts/atlas/scanRegistry.test.ts`).
- [x] The gate (`atlas:publish`) and the deploy workflow run the scans through the registry.
- [x] Docs: `docs/agents/workflow.md` scan count, `docs/VISIBILITY_AND_PLAYER_SAFETY.md`,
      `docs/WORKFLOWS.md`.
- [x] `npm run atlas:publish` on a normal build passes every scan.
