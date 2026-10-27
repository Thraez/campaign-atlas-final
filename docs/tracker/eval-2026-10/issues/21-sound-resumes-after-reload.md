# Sound comes back after a reload

Status: in-review (review pending)
Area: sound, player site

Found by the third sweep (2026-10-28) and spot-checked. `soundEnabled` is kept in localStorage
(`src/atlas/sound/soundPrefs.ts` ~28), but `engine.unlock()` runs only from `enableSound`
(`SoundSettingsProvider.tsx` ~111-118). After a reload the invite stays hidden
(`SoundControl.tsx` ~30), `crossfadeTo` returns early because there is no AudioContext
(`AudioEngine.ts` ~78), and `SoundscapeLayer.tsx` ~47 still sets `ambiencePlaying`. The page says
"Ambience playing" and plays nothing, and a player can only fix it by clearing site data.

Provisional call (State.md): a saved "sound on" unlocks audio on the player's first tap or key
press anywhere. The invite shows until then.

## Acceptance criteria

- With `soundEnabled` saved, a reload shows the invite (or a "tap to resume" state) until the
  first user gesture, and that gesture unlocks the engine and starts the current ambience.
- "Ambience playing" is announced only while audio is actually playing.
- Tests: reload with sound saved on, then gesture, then ambience starts. Before the gesture,
  nothing claims to be playing.

## Comments

- 2026-10-28, branch `eval-21-sound-after-reload`: `SoundSettingsProvider` now tracks
  `audioUnlocked`. With sound saved on and audio still locked, it listens (capture phase) for the
  first `pointerdown` or `keydown` on `window` and unlocks the engine from that gesture.
  `SoundControl` shows a "Tap to resume sound" invite until then and hides mute/volume.
  `SoundscapeLayer` picks no bed before unlock, and sets `ambiencePlaying` from
  `AudioEngine.crossfadeTo`, which now resolves true only when the bed really started (false
  before unlock, for silence, on a failed load, or when superseded). Tests:
  `src/test/sound/soundAfterReload.test.tsx`.
- Not checked on a real phone: iOS Safari may want `touchend` rather than `pointerdown` as the
  unlocking gesture; the invite button still unlocks there either way.
