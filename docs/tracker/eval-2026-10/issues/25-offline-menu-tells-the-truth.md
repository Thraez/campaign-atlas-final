# The offline menu says what is actually stored

Status: in-review (review pending)
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

## Comments

2026-10-28, branch `eval-25-offline-menu-truth`:

- `pwa.ts`: `getOfflineCoverage(layerSrcs)` reads the caches: "none" unless the Workbox precache
  (shell) and `atlas.json` in `atlas-data` are there; "notes-and-map" when every local layer of the
  map on screen is in `atlas-assets`, else "notes". `isOfflineReady` (SW controller) is gone.
- "Save this map for offline" (`saveForOffline`) adds `atlas.json`, `search-index.json` and the
  map's local layers (URLs from `normalizeAtlasAssetUrl`, as the viewer builds them) to those
  caches. External layers are skipped. Refuses offline.
- "Clear offline copy" deletes the content caches only and keeps the shell, so a later save works
  without a new service worker. Save and clear notify; the menu also re-reads when opened and when
  the map changes.
- Menu wording: "Not saved for offline yet"; "Works offline: the notes; pictures you have opened"
  plus "This map is not saved yet"; "Works offline: this map and the notes; pictures you have
  opened".
- Lovable preview-host check and its tests removed; the iframe check stays. `vite.config.ts`
  unchanged.
- Tests: `src/test/pwa.test.ts` ("offline coverage"), `src/test/atlas/OfflineMenu.test.tsx`.
- Not checked in a real browser with a service worker (needs a production build served over
  HTTPS or localhost).
