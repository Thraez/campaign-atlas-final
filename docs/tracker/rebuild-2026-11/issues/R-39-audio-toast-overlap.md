# R-39 The audio toast no longer covers the minimap and Wander

Status: ready-for-agent
Blocked by: -
Size: S
Branch: `rebuild-r39-audio-toast`
Model: Sonnet (settled plan)

Found by the R-36 Phase 3 playtest (2026-11-11, `previews/r36/notes.md`, gitignored).

On a phone the toast "Tap to bring the world to life" (`src/atlas/sound/SoundControl.tsx`) overlaps
the minimap and the Wander button. It is in v1 too (the R-33 baseline shows it), so this changes
the live v1 look: it is a fix, not part of the rebuild.

## Acceptance criteria

- At 375 px the toast sits where it covers neither the minimap nor Wander (or shares their stack
  without overlap), and still can be dismissed or tapped.
- Desktop unchanged.
- Real browser check at 375 px on v1 (`atlas:build:player` preview) and v2 (`atlas:serve:next`).

## Touches

`src/atlas/sound/SoundControl.tsx`, `src/index.css`.

## Built in P-01

Folded into polish item P-01 (branch `polish-p01-overlay-stack`): the invite now sits in one notice
dock above Wander, the minimap and the layer credits. Details and checks:
`docs/polish-2026-11/items/P-01-overlay-stack.md`.
