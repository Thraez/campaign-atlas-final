# Sound comes back after a reload

Status: ready-for-human (Isak tries a reload with sound on, on desktop and on a phone)
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

- 2026-10-28, branch `eval-21-sound-after-reload`: `SoundSettingsProvider` tracks
  `audioUnlocked`, true only once the AudioContext is running. With sound saved on and audio
  not running, it listens (capture phase) on `window` for `pointerup`, `touchend`, `click`
  and `keydown` (not Escape or lone modifiers), and unlocks from that gesture. Gestures inside
  the sound invite are left to its buttons, so Dismiss stays silent for the visit. If a gesture
  leaves the context suspended or resume fails, the saved "on" and the "Tap to resume sound"
  invite both stay. Only an explicit enable where Web Audio can't start turns it off.
  `AudioEngine.unlock()` resolves whether the context is running. `crossfadeTo` returns
  "playing" | "paused" | "locked" | "silence" | "failed" | "superseded". A crossfade beaten
  to the same bed still reports it as playing. `SoundscapeLayer` picks no bed before unlock and
  sets `ambiencePlaying` from that result. Tests: `src/test/sound/soundAfterReload.test.tsx`.
- This hasn't been tried on a real phone. Touch unlock is covered only by jsdom events.
- Provisional call: the "paused" result (bed set up while the context is suspended) counts as
  playing, because the "Ambience playing" label can't show while muted anyway.
