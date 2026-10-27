# Editor Save keeps world.yaml's other keys

Status: ready-for-agent
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
