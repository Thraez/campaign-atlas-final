# Sound comes back after a reload

Status: ready-for-agent
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
