# Editor "just works" on first run — auto-build the DM atlas — design

**Date:** 2026-05-31
**Status:** blessed → queued as WANT **E3** (`docs/automation/continuous-dev-queue.md`)
**Origin:** dogfooding item #5 ("The editor should just work on first run") in `docs/DEVELOPMENT_WANTS.md`
**Backs queue unit:** E3
**Confidence:** medium-high — clear outcome, but it touches **dev/build wiring**, so read the approach
note. This is the one in the batch most worth a human glance at the chosen approach.

## The problem

On a fresh checkout, `npm run dev` serves the committed **player** atlas (`public/atlas/atlas.json`), so the
DM editor opens **degraded**: a scary banner — *"Player atlas loaded — Save won't work. Run
`npm run atlas:build` in your terminal…"* — and content tabs that look empty (player entities have no
`sourcePath`, which is how the editor detects "this isn't the DM atlas"). A DM should never have to open a
terminal to use their own editor.

Recon established the mechanism (verify files still match):
- `atlas:build` (no flags) writes the **DM** atlas to `.local-atlas/atlas.json`. The Vite dev plugin
  (`scripts/vite-plugin-atlas-save.ts`) already serves `.local-atlas/atlas.json` **when it exists**, falling
  back to `public/atlas/` when it doesn't. So the only thing missing on a fresh checkout is that
  `.local-atlas/atlas.json` hasn't been built yet.
- The degraded banner lives in `src/pages/AtlasPlacementEditor.tsx` (fires when every entity has an empty
  `sourcePath`).
- `runBuild()` is already exported from `scripts/build-atlas.ts` as a clean programmatic API (no
  `process.exit`, returns `{ ok, exitCode, durationMs, error? }`); the save plugin already calls it.
- There is **no** staleness check anywhere, and the build does a full content walk on every run
  (sub-second for a small vault; a few seconds when fog PNGs are re-encoded via `sharp`).

## Approach (chosen) — a `predev` guard that builds the DM atlas if missing or stale

npm automatically runs a `predev` script before `dev`. Add:

```jsonc
"predev": "tsx scripts/ensure-dm-atlas.ts"
```

New `scripts/ensure-dm-atlas.ts`:
1. If `.local-atlas/atlas.json` is **missing** → build the DM atlas via `runBuild({ player: false })`, then
   exit 0.
2. If it **exists** → compare its mtime against the newest mtime among the build inputs (the `.md`/`.yaml`
   content files under the configured `contentRoot`, plus `atlas.config.json` / `world.yaml`). If the atlas
   is newer than every input → **skip** (exit 0 immediately, so warm `npm run dev` stays fast). If any input
   is newer → rebuild.
3. **Never block dev on a build failure.** Catch build errors, print a short plain-language warning, and
   exit 0 anyway so Vite still starts and the existing banner remains as the fallback. (A non-zero `predev`
   exit would abort `npm run dev` — we must not make a broken note prevent the editor from opening.)

Factor the staleness decision into a small **pure, testable** function, e.g.
`isAtlasStale(atlasMtimeMs: number | null, newestSourceMtimeMs: number): boolean` (null atlas ⇒ stale),
so the logic is unit-tested without disk I/O.

### Why `predev` over the alternatives
- **No new endpoint, no editor UI changes.** The existing `serveLocalAtlas` middleware already serves
  `.local-atlas` once it exists, so building it before Vite starts is sufficient — zero React changes.
- A runtime "build now" button would need a new long-running `/__atlas/build` endpoint plus a loading state
  in the editor — more surface, more risk.
- A Vite `buildStart` hook inside the save plugin is a reasonable second choice (the plugin already imports
  `runBuild()`); note it in passing, but prefer `predev` for being purely additive and framework-agnostic.

> **Verify before building:** confirm `runBuild`'s current signature/return shape and how `contentRoot` is
> resolved from `atlas.config.json`; reuse the config-reading the build script already does rather than
> re-implementing it.

## Testing

- Unit-test `isAtlasStale`: missing atlas (null) ⇒ stale; atlas older than newest source ⇒ stale; atlas
  newer than all sources ⇒ fresh.
- (Optional, if cheap) a test that `ensure-dm-atlas` swallows a build failure and exits 0.

Full gate: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` green. Because this touches build tooling,
also run `npm run atlas:publish` once to confirm the publish path still succeeds — but note the change is
**dev-only** and must not affect `npm run build` / the player build output.

## Acceptance criteria

- On a checkout with no `.local-atlas/atlas.json`, `npm run dev` auto-builds the DM atlas first, and the
  editor opens with content and **no** "Save won't work" banner.
- A warm `npm run dev` with nothing changed **skips** the rebuild (fast start).
- A build failure during `predev` prints a clear warning but does **not** prevent the dev server from
  starting.
- `npm run build` and the player build are unaffected; `scripts/ensure-dm-atlas.ts` is not imported by any
  player/runtime bundle.
- Full gate green.

## Out of scope

- Incremental/partial atlas builds, file-watching, or build caching beyond the simple mtime guard.
- Any change to what the editor renders or to the save flow.
- Touching the player build pipeline or the published `public/atlas/` artifacts.
