# The offline menu says what is actually stored

Status: ready-for-agent
Area: player site, offline

Found by the third sweep (2026-10-28). `clearOfflineCache` deletes every cache, the shell's
precache included (`pwa.ts` ~182-186), but `isOfflineReady` only checks for a controlling service
worker (~189-191), and nothing tells the menu the state changed. So it keeps saying "Available
offline". The claim is too broad even without clearing: maps, portraits and audio are cached
only once visited (`vite.config.ts` ~116-124). The Lovable preview-host code (`pwa.ts` ~33-48) is
dead.

Provisional call (State.md): the menu claims only what is stored. Installing caches `atlas.json`
and the current map's layers; portraits and audio stay cached on visit.

## Acceptance criteria

- After "Clear offline cache" the menu stops claiming offline, and doesn't claim it again until
  the caches exist.
- Installing precaches `atlas.json` and the current map's layers. The menu says what works
  offline in plain words (for example "This map and the notes; pictures you have opened").
- The dead Lovable preview-host code is removed.
- Tests for the menu state before install, after install and after clearing.
