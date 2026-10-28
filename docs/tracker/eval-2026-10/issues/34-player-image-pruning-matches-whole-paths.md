# Player-image pruning matches whole asset paths

Status: ready-for-agent
Area: publish (player safety)

Found by the fifth sweep (2026-10-28), verified by reading. `isReferenced`
(`scripts/atlas/playerImageRefs.ts:12-14`) keeps an image when its file name appears anywhere in
the player JSON (`playerJson.includes(fileName)`). So a DM-only `elf.png` ships when `shelf.png`
is referenced, and `images/x.png` ships when `maps/x.png` is. The image-privacy scan uses the same
rule, so it passes the same leak.

Provisional call (State.md): match the full `assets/...` path, not the basename. Bare
`![[name]]` embeds still count, resolved to their asset path the way the build resolves them.

## Acceptance criteria

- Failing tests first: a DM-only image whose name is a suffix of a player image's name is
  pruned, and so is one that shares a basename with a player image in another folder.
- References come from the parsed player JSON (URL-like string values), not a text search.
- The image-privacy scan uses the same function and catches both cases.
- Player safety review (third lens) on the branch; `atlas:check-secrets` and
  `atlas:check-derived` clean on `dist`.
