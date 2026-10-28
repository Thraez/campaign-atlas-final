# The newest soundscape request always wins

Status: ready-for-agent
Area: sound

Found by the third sweep (2026-10-28). Enter area A and then B. If A's audio decodes first,
`this.active` is still null, so A starts; when B decodes, `if (this.active) return` drops it
(`AudioEngine.ts` ~82-94). The player hears A while standing in B. The same thing happens after
`crossfadeTo(null)` on a map switch: the old bed still starts. The one test
(`AudioEngine.test.ts` ~231) covers only the newer request resolving first.

## Acceptance criteria

- A request counter (or token) means only the newest `crossfadeTo` call may start or keep audio.
  That includes `null`.
- Tests cover the older request resolving first, `null` arriving during a decode, and the order
  the existing test already checks.
