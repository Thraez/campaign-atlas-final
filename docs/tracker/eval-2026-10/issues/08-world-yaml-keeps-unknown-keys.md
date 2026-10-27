# Editor Save keeps world.yaml's other keys

Status: done
Area: editor, local save

Bug, found 2026-10-27. `buildFullWorldYaml` (`src/atlas/yaml/buildFullWorldYaml.ts:58-70`) writes
only schemaVersion, name, maps, calendar, credits and assetCredits, and `serializeWorldYaml`
(`worldYamlSerialize.ts:83`) keeps only the leading comment block. So any editor Save that writes
world.yaml (a map, region, route, fog or layer edit) drops the `import:` block
(`content/astrath-deeprealm/_atlas/world.yaml:117`, Sync's folder map, read at
`scripts/atlas/loadWorldConfig.ts:414`) and any other key the editor doesn't model. The YAML is
built from the atlas.json projection while `baseHash` is taken from the bytes on disk, so loader
defaults get written into the file too.

## Acceptance criteria

- Save replaces only what the editor edits and keeps every other top-level key (`import:`
  included) and the comments it keeps today.
- A round-trip test: load the real world.yaml, save an unchanged map, load again; the same keys
  and the same `import:` value come back.
- The existing world.yaml save tests pass.

## Comments

2026-10-27, branch `eval-08-world-yaml-keys`:

- `buildFullWorldYaml` now parses the existing file's top-level mapping and writes it back with
  only the editor-owned keys replaced (`EDITOR_OWNED_KEYS`: schemaVersion, name, maps, calendar,
  credits, assetCredits, plus the legacy top-level regions/fog/routes, which the loader folds into
  `maps[]` and so are dropped as before to avoid duplicates). Every other key (`import:`, anything
  unknown) passes through, and the file's key order is kept; new owned keys are appended. The
  leading comment block is still handled by `serializeWorldYaml`, unchanged.
- Loader default no longer leaks in: `credits` equal to the default (both true) is not written
  into a file that didn't have the key. That was the one loader default that showed up on the
  real world.yaml.
- Tests in `src/test/build-full-world-yaml.test.ts`, "keeps keys the editor doesn't model":
  `import:` + an unknown `dmNotes:` key kept (with key order), legacy top-level `regions:` dropped,
  and a round-trip of the real `content/astrath-deeprealm/_atlas/world.yaml` (same top-level keys,
  same `import:` value, same `importConfig`). The first and third failed on the old code.
- Gate: typecheck:all clean, lint 0 errors / 13 warnings, format:check clean, test:ci all 4 shards
  green (3,390 tests), atlas:publish "all 12 scans clean", integrity-smoke "all 6 caught".
- Not covered, left open: comments inside or between YAML keys (other than the leading block) are
  still lost on save, a documented existing limitation. Other loader defaults inside `maps[]`
  (e.g. `wrapX: false` always written) can still appear in the file; they don't change meaning.
- Worktree note: the worktree had no `node_modules`, and `test:ci` spawns
  `./node_modules/.bin/vitest`; I linked `node_modules/.bin` to the main repo's (gitignored).
