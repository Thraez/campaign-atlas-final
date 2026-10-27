# A test walks the player entry's imports

Status: ready-for-agent
Area: player site, publish safety

AGENTS.md: never import editor modules from a player entry point. The guard
(`src/test/player-build-exclusion.test.ts:7-13`) text-matches five files, so a transitive import
would pass. Today two helpers in editor folders are reachable from `src/main.tsx`:
`src/atlas/editor/mapClickCoord.ts` (via RulerLayer) and `src/atlas/tabs/download.ts` (via
`EntityPanel.tsx:26`). Both are harmless leaves, but the folder names mislead.

## Acceptance criteria

- Move those two helpers to player-side folders (`src/atlas/map/`, `src/lib/`).
- A test walks the static import graph from `src/main.tsx` (skipping the `__INCLUDE_EDITOR__`
  dynamic import) and fails on any path under `editor/`, `tabs/`, `categories/`,
  `sound-editor/`, `save/`, `sync/`, `import/` or `publish/` (adjust the list to what the folders
  hold; say why in the test).
- The test fails if one editor import is planted (prove it once, then remove the plant).
