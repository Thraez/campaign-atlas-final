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
