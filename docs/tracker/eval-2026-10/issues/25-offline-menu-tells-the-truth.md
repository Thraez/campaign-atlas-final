# The offline menu says what is actually stored

Status: done (PR #78, merged 2026-10-28)
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

2026-10-28, branch `eval-25-offline-menu-truth` (first build d54f0d0, review fixes after it):

- What is stored is read from the caches (`getOfflineCoverage` in `src/pwa.ts`). "none" unless a
  service worker is there (controlling, or an active registration), the Workbox precache holds the
  shell, and `atlas-data` holds both `atlas.json` and `search-index.json`. "notes-and-map" when
  every layer of the map on screen is in `atlas-assets`. A map with no layers of its own or any
  external (http, data, blob) layer is never claimed ("notes-map-online"). Otherwise "notes".
- One store (`setOfflineMap`, `subscribeOfflineCoverage`) reads the caches once per change for
  both the menu and the offline banner. The viewer sets the map (key: map id plus layer srcs).
  The menu re-reads when opened; save and clear notify.
- Installing (provisional call P1): when a service worker activates, and on any load whose
  precached shell differs from the last automatic save, the app saves `atlas.json`,
  `search-index.json` and the current map's local layers. So the first install and every deploy
  that brings a new worker refresh the current map. A cleared cache is not refilled until the
  next deploy. "Save this map for offline" stays in the menu for other maps.
- Saving fetches with `cache: "reload"` and `cache.put`, so a re-save replaces a map whose file
  was replaced under the same name. Entries saved this way skip Workbox's expiry: saved maps
  don't expire, and they are bounded by the number of maps in the atlas.
- "Clear offline cache" (P2) deletes the content caches and keeps the app shell; the menu says
  so under the item.
- Cache names live in `src/pwaCacheNames.ts`, imported by `vite.config.ts` and `src/pwa.ts`.
  No other Workbox setting and not the `__INCLUDE_EDITOR__` gate changed.
- Wording, menu: "Not saved for offline yet" / "Works offline: the notes; pictures you have
  opened" with "This map is not saved yet" or "This map's pictures come from another site and
  aren't saved" / "Works offline: this map and the notes; pictures you have opened".
- The Lovable preview-host removal is its own commit on this branch: it is outside this ticket.
- Tests: `src/test/pwa.test.ts` ("offline coverage", "offline store", "automatic save on
  install"), `src/test/atlas/OfflineMenu.test.tsx` (menu states and the banner per state).
- Not checked in a real browser with a service worker.
