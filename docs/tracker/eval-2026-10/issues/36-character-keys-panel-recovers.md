# The character keys panel recovers and keeps every key

Status: done (PR #86, merged 2026-10-28)
Area: editor (character keys)

Found by the fifth sweep (2026-10-28), from reading; not run.
`src/atlas/secrets/CharacterKeysPanel.tsx`:
- A failed load (anything but 404, or a network error) shows "No characters yet" with
  `baseHash` null (~36, 48). Saving then fails with `already-exists` until a reload.
- After a 409 the `baseHash` is never refreshed (~84-89): the ticket 32 class.
- Non-string values are dropped on load (~41) and the next save writes the file without them. A
  hand-edited `Bob: 12345` loads as a number, so Bob's key is lost.
- `EntityEditPanel.tsx` (~125-140) parses the same file a second way, line by line; its
  `startsWith(" ")` after `trim()` never matches.

## Acceptance criteria

- Failing tests first for each of the three bugs.
- A failed load says so and offers a retry; it never shows an empty list that a save would
  write over the file.
- A conflict re-reads the file and keeps the DM's unsaved rows (as tickets 17 and 32).
- Every key survives a load and save; numbers are kept as strings.
- One parser for `character-keys.yaml`, used by the panel and the entity panel.
- Uses ticket 39's `canonClient.read` if 39 has landed; otherwise stands alone.
