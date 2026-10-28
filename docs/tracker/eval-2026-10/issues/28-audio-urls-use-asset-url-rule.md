# Audio URLs use the same asset URL rule as images

Status: ready-for-agent
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
