# One client for reading and saving canon

Status: ready-for-agent
Area: editor (save), sync

Was a parked note; the fifth sweep (2026-10-28) verified it and found it wider.
- `/__atlas/read` is fetched by hand in six places (`CharacterKeysPanel.tsx`,
  `buildImportChanges.ts` twice, `canonicalPlacementSave.ts`, reused by `EntityEditPanel.tsx`,
  and `useWorldYamlBaseline.ts`), plus `devEndpointPort.readAtlasFile` on code-retro-07.
- `readSourceFile` is defined twice, with different error classes. `hashContent` is called by hand
  after a read at eight sites. "File is gone" is found by matching error text
  (`EntityEditPanel.tsx` ~49-50).
- `FileKind`, `ConflictReason` and the size caps are defined in both `localFsSave.ts` and the
  plugin.
- `InvalidContent` and `OversizedContent` reach the DM as a bare word, without `reason` or `path`.

Provisional calls (State.md): the client returns a typed outcome union rather than throwing, and
the protocol types and caps move to `src/atlas/save/saveProtocol.ts`, imported by the plugin.

## Shape

`src/atlas/save/canonClient.ts`, built with a `fetchFn`:
- `read(path) → {contents, baseHash} | null`; the hash always comes from the read that produced
  it.
- `save(changes, {rebuild}) → SaveOutcome`: `saved | saved-not-rebuilt | conflict{reason, path,
  currentHash} | busy | refused{error, reason, path} | write-failed{failedPath, rolledBack}`.

It hides URL building, the allowlist pre-check, hashing, the status-to-outcome mapping (including
ticket 33's 207) and the caps. Two adapters: the dev endpoint, and an in-process one that calls
`createDevRouter` on a temp directory.

## Acceptance criteria

- Tests through the in-process adapter: read, hash and save round-trip; an outside edit gives
  `stale-base`; a deleted file reads as `null`; a forced write failure gives `write-failed`; 423
  and 413.
- Every caller above goes through the client; no `/__atlas/read` fetch or `hashContent` after a
  read is left outside it.
- Refusals show the DM the reason and the path.
- Stack on eval-32 (#81) and code-retro-07 (#79); 33 first.
