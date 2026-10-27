# The newest soundscape request always wins

Status: in-review (review pending)
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

## Comments

- 2026-10-28 (agent): Branch `eval-23-crossfade-latest-wins`, stacked on ticket 21 (PR #71). 21
  already handled two calls to the same bed during one decode (both report "playing") and an older
  call landing after the newer one started; neither criterion here was met by it. `crossfadeTo` now
  bumps a request counter and records the newest target (a bed id or null). After the decode, a
  stale call returns "superseded" without starting anything, unless the newest call wants the same
  bed (they share the decode, and whichever resumes first starts it). Tests in
  `src/test/sound/AudioEngine.test.ts` ("the newest crossfade request wins") cover older-first,
  newer-first, null during a decode, and A-B-A; they replace the old single-order test.
