# Publish scans find the real atlas.json and fog layers

Status: in-review
Area: player safety, publish scans (`scripts/`)
Payoff: high (the fog promise) · Size: S-M

`scanRegistry.ts` runs the scans on `dist` and `public/atlas`. Two of them look in the wrong place:

- `check-fog-safety.ts:111` reads `<dir>/atlas.json`. In `dist` the file is
  `dist/atlas/atlas.json`, so the scan logs "skipping" and passes. In `public/atlas`, layer `src`
  values are `atlas/assets/maps/…` (site-root relative), and `path.join(targetAbs, src)` (:185,
  :258) gives `public/atlas/atlas/assets/…`, which never exists. So check 13 (original PNG beside
  the redacted one) and check 16 (alpha leak, skipped when the file is missing) never run on real
  output. The tests pass only because their fixture uses a layout neither folder has
  (`check-fog-safety.test.ts` ~309-337; `publish-integrity-smoke.ts` ~224).
- `check-player-secrets.ts:112-119` has the same lookup, so its forbidden-field check never runs on
  `dist`; unparseable JSON returns no hits (fails open, unlike `check-player-files`, exit 18). Its
  header claims a plaintext check that nothing does. Three scans keep their own text-extension list
  and walker (`check-no-secrets.ts:42`, `check-derived-secrets.ts:48`, `check-player-secrets.ts:18`).

## Acceptance criteria

- One helper in `scripts/atlas/` locates the player `atlas.json` (`<dir>/atlas.json` or
  `<dir>/atlas/atlas.json`) and resolves a site-root asset path to a file (reuse `toAssetPath`,
  `scripts/atlas/playerImageRefs.ts`).
- The fog scan uses it; a fog layer whose `.fog.png` is missing is a finding, not a skip.
- check-player-secrets uses it; invalid JSON fails the scan; the header says what it checks.
- Tests use the real `dist` and `public/atlas` layouts and fail on the old code. The smoke test
  matches.
- Optional, if small: the three scans share one text-file walker.

## Comments

2026-11-07: built in PR #109 (`arch-01-scans-find-real-artifacts`). New
`scripts/atlas/playerArtifact.ts` (locate atlas.json by layout, resolve asset paths, one shared
text-file walker); `scanRegistry` passes the layout, so a built site with no `atlas/atlas.json`
fails. Missing `.fog.png` is code 17; invalid JSON and unreadable paths fail check-player-secrets.
Provisional call: the original-beside-redacted check runs on the built site only, since
`public/atlas` keeps originals by design. Review (Opus, medium): three fixes, then clean. Gate
passed; its publish step now scans `dist`. Follow-up: 09.
