# The service worker precaches only files the build ships

Status: ready-for-agent
Area: publish (offline, PWA)

Found by the safety review of ticket 40 (2026-10-28), checked on `main`'s own `dist/`. Workbox's
`globPatterns` (`**/*.{js,css,html,ico,svg,woff2}`, `vite.config.ts` ~83) match `.svg` and `.ico`
under `atlas/`. The service worker is generated before the image prune runs, so `dist/sw.js`
precaches `atlas/assets/maps/sample-overview.svg`, which the prune then deletes. A precache entry
that 404s fails the service worker's install, so offline mode never installs on the live site.
The prune's header says the precache globs "never match images"; they do.

## Acceptance criteria

- A failing test first: a build's precache list names no file missing from `dist/`.
- The precache leaves `atlas/` to the runtime caches (`globIgnores`), or the prune runs before the
  service worker is generated; say which and why.
- Fix the prune's header comment.
- Own branch from `origin/main`. `eval-25-offline-menu-truth` (#?) edits `vite.config.ts` in the
  runtime caching block: trial-merge with it.
