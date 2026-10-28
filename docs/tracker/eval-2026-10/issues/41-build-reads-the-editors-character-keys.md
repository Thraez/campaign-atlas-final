# The build reads the character keys the editor writes

Status: ready-for-agent
Area: build (character secrets)

Found while building ticket 36 (2026-10-28), verified by reading. The build reads
`<contentRoot>/_dm/character-keys.yaml` (`scripts/build-atlas.ts` ~356-372); the keys panel and
the entity panel write `<contentRoot>/<world>/_dm/character-keys.yaml`
(`CharacterKeysPanel.tsx` ~18, `EntityEditPanel.tsx` ~124). Keys saved in the editor never reach
the build, so every character secret is left out of the player build with a missing-key
warning. Fails safe (nothing leaks); no keys file is tracked yet. The existing secrets-fortress
test writes the world-level path too, so its `vesper` secret is skipped silently.

The build also parses the file itself and keeps string values only, so a hand-edited
`Bob: 12345` is offered as a target in the editor but skipped by the build. Provisional call
(State.md): the build uses the editor's `parseCharacterKeys`. A version of that was built on
the ticket 36 branch (bf95e9d, with a test) and reverted for the conflict with #82; reuse it.

## Acceptance criteria

- A failing test first: keys saved where the editor saves them encrypt that character's secret
  in a player build, and the player decrypts it with that key.
- One function names the keys path, used by the build and both panels.
- The build reads with `parseCharacterKeys`: `Bob: 12345` is key "12345"; empty or nested
  entries get the missing-key warning naming the entry, never a value.
- The secrets-fortress test's `vesper` secret is encrypted, not skipped.
- If a keys file exists at the old `content/_dm/` path, the build warns that it is ignored
  (or reads it as a fallback; say which).
- Stack on code-retro-08 (#82), which reshapes `runBuildCore`. Player safety review (third lens).
