# Delete the dead EntityReadingView

Status: in-review
Area: entity pane, player preview
Payoff: low-med · Size: S

Only tests import `src/atlas/entity/EntityReadingView.tsx`. It rebuilds the DM-lens HTML (~:39-50)
the way `EntityPanes.tsx` (~:43-53) does, minus `resolveImageEmbeds`, so the copies have drifted.
The leak-regression tests (`player-preview-leak-regression.test.tsx` ~100-150) target the dead
component, so they guard nothing that ships.

## Acceptance criteria

- `EntityReadingView.tsx` and its own test are gone.
- The leak-regression cases run against `EntityPanes` (what the app renders) and still pass.
- The DM-lens render has one owner.

## Comments

2026-11-07: built in PR #108 (`arch-04-delete-entity-reading-view`). The 17 leak tests render
`EntityPanes`; all pass, no leak. Player mode asserts the DM block and secret name on the player
pane plus a test that the DM pane is hidden (`display:none`; the editor keeps it so the DM can open
it). The DM-mode Connections tests had no equivalent (the DM pane is body-only) and became a
positive control. New alias case in `EntityPanes.test.tsx`. Review (Opus, medium): clean; nothing
on the player site imports the panes. Gate passed.
