Ticket: `docs/tracker/eval-2026-10/issues/41-build-reads-the-editors-character-keys.md`

The player build reads character keys where the editor saves them
(`<contentRoot>/<world>/_dm/character-keys.yaml`), with the editor's `parseCharacterKeys`. Before,
every character secret saved in the editor was left out of the player build.

- `characterKeysPath()` in `src/atlas/secrets/characterKeysFile.ts` names the path for the build,
  `CharacterKeysPanel` and `EntityEditPanel` (js-yaml only; no editor code reaches player entries).
- `Bob: 12345` is key "12345"; empty or nested entries get the missing-key warning naming the entry.
- A keys file at the old `content/_dm/` path is ignored with a warning (not read as a fallback).
- An unreadable or invalid keys file now warns (it was silently empty). The build's warning is fixed
  text plus at most a line number: js-yaml's reason can quote key text (`*alias`, `!tag`), and
  build warnings ship in `atlas.json`.
- Tests: keys saved where the editor saves them encrypt and decrypt; numeric keys; old path ignored;
  alias/tag keys never reach any output file; secrets-fortress's `vesper` secret is now encrypted.

Review (Opus, medium, player-safety lens): found the YAML-reason leak, fixed in 6a28b0c; re-check
CLEAN (no warning, error or log can carry key text into player output).

## Local gate (2026-11-07, branch at 6a28b0c, on origin/main 2f4e7e6)

```
typecheck:all exit 0 · lint exit 0 · format:check exit 0
test:ci exit 0 — all shards green
atlas:publish exit 0 · atlas:check-secrets dist exit 0 · atlas:check-derived dist exit 0
GATE PASSED
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
