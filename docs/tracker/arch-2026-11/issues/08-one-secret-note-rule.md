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
