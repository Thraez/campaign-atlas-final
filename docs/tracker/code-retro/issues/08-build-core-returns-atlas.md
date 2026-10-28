# The build core returns the atlas; one player projection

Status: ready-for-agent
Blocked by: 06
Area: build pipeline, tests

`runBuildCore` (`scripts/build-atlas.ts` ~338-1150) returns only `{ok, exitCode}` and roots itself at `process.cwd()`, so 12 test files spawn `npx tsx build-atlas` under jsdom. That feeds the out-of-memory and worker-timeout pain. The player projection exists twice (`buildEntity` and `src/atlas/content/projectEntityForPlayer.ts`), held together by a parity test that runs two builds. All 308 test files run in jsdom (`vitest.config.ts:13`).

Deepening: `buildAtlas(root, flags)` returns `{project, searchIndex, report}`; writing files is a thin adapter; the build uses `projectEntityForPlayer`.

## Acceptance criteria

- Only one CLI smoke test spawns the build; the others run in-process under `@vitest-environment node`.
- The parity test is deleted; one projection remains.
- The full suite passes in 2 shards or fewer on the Mac.
- `atlas:publish` output is byte-identical before and after on the current content.

## Comments

**2026-10-28, build (Opus).** `buildAtlas(root, flags)` returns
`{project, searchIndex, report, assets}` and writes no file. `writeBuildOutput` is the only writer:
fog masks, hashed audio (with its prune), the audio manifest, then `atlas.json` and
`search-index.json`. `runBuild` = `buildAtlas`, report, then write only if no gate failed. The
build's player projection is `projectEntityWithReport`; `buildEntity`'s copy and the parity test
are gone. One spawn left (`build-atlas-cli.test.ts`); the rest run in-process under node.

Review follow-ups:

- A failed build writes nothing, for **every** build (player and DM), not just player builds:
  no atlas, no search index, no fog masks, no audio, no manifest. The last good output stays.
  Pinned by `build-failure-writes-nothing.test.ts` (unclosed `%%`).
- Moving the fog writes after the asset check exposed an ordering trap: strict player builds
  checked that the `.fog.png` existed before it was written. `validateAsset` now takes the
  planned files (`planned`), and `fog/redactBuild.test.ts` has a strict case.
- One context builder, `createProjectionContext`, used by the build and (through
  `buildProjectionContext`) the editor preview. DM builds list the folder-excluded notes in
  `buildReport.excludedNotes` (DM only), so the preview redacts `_dm/` links like the build.
  Pinned by `content/preview-matches-build.test.ts` (preview body equals the player build's).
- Leftover: none. All asset writes moved behind `writeBuildOutput`.

Byte checks (old = 28a3b2a), `version`/`publishedAt` ignored:

- Current content: player `atlas.json` and `search-index.json` identical. DM output is identical
  apart from the new `buildReport.excludedNotes`.
- The real vault with visibilities injected (460 entities): the in-memory player and DM results are
  identical to the old build's files. The vault fails a gate, so the new build writes nothing
  there, by design.
- Fog and audio, on current content plus an injected fog map and stale files: both `.fog.png`
  masks, all hashed audio, `manifest.json` and the stale-file prunes are identical (39 files
  under `public/`).
- `dist` is the exception: the bundle differs because the editor and viewer import the rewritten
  projection module. Its atlas JSON is the identical player atlas; `check-secrets` and
  `check-derived` on `dist` are clean.

Gate: typecheck:all, lint (0 errors), format:check, tests in 2 shards (162 + 162 files, 3,402
tests), `atlas:snapshot`, `atlas:build:player`, `build`, `atlas:scan` (12 clean),
integrity-smoke (6/6), check-secrets and check-derived on `dist`: all pass.
