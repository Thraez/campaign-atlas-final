# Audio URLs use the same asset URL rule as images

Status: done (PR #77, merged 2026-10-28)
Area: sound, player site

Found by the third sweep (2026-10-28), unverified: check it first. `AudioEngine.ts` ~19-27 fetches
a relative `atlas/assets/audio/...`, which resolves only because the viewer lives at `/atlas`. At
`/atlas/` (trailing slash) it would request `/atlas/atlas/assets/audio/...`.
`listAvailableAudio.ts` ~34 (editor only) uses a third rule, an absolute `/atlas/...` that
ignores BASE_URL.

## Acceptance criteria

- First reproduce it: a test, or the dev server at `/atlas/`. If it doesn't reproduce, record
  that and close the ticket.
- Otherwise audio URLs go through `normalizeAtlasAssetUrl`, as images do, in both the engine and
  the editor list.
- A test pins the URL for `/atlas` and for `/atlas/` under the GitHub Pages base path.

## Comments

2026-10-28: Reproduced with a test (`src/test/sound/audioAssetUrl.test.ts`), BASE_URL
`/campaign-atlas-final/`. `/atlas/` is reachable: React Router matches it to the `/atlas` route and
Pages serves the SPA for it through `404.html`.

- Engine at `.../campaign-atlas-final/atlas/` fetched
  `.../campaign-atlas-final/atlas/atlas/assets/audio/deadbeef.ogg` (at `/atlas` it was right).
- Editor manifest, at both URLs, fetched `https://thraez.github.io/atlas/assets/audio/manifest.json`
  (base path dropped).

Fix: `AudioEngine.audioUrl` puts a bare filename under `atlas/assets/audio/` and then runs
`normalizeAtlasAssetUrl`; `loadAvailableAudio` fetches `normalizeAtlasAssetUrl(AUDIO_MANIFEST_URL)`,
and the constant is now base-relative. Both now resolve to
`https://thraez.github.io/campaign-atlas-final/atlas/assets/audio/...` at `/atlas` and `/atlas/`.
`url.ts` is already player code (images use it), so no editor module enters the player graph.
Branch `eval-28-audio-asset-urls`, stacked on `eval-23-crossfade-latest-wins`.
