# One secret-note rule; body redaction from tokens

Status: ready-for-agent
Area: player projection
Payoff: low · Size: S

`entityIsSecret` (`projectEntityForPlayer.ts` ~181) copies `readNote`'s `isSecret` rule. The body
redaction (~260-263) regex-matches the trimmed target, so `[[ Name ]]` keeps the name in the
shipped `body`; the strict build and the derived scan still catch it.

## Acceptance criteria

- One exported predicate in `readNote.ts`, used by both.
- Redaction works from wikilink token positions; a test with `[[ Name ]]`.

## Comments

- 2026-11-08 (rebuild phase 2 tickets): folded into
  [R-11a](../../rebuild-2026-11/issues/R-11a-per-campaign-resolver.md) (the per-campaign
  resolver): build it there, not here. Both criteria above are R-11a's.
