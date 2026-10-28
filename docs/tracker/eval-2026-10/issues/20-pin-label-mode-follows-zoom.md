# Pin labels switch between always-on and hover when the zoom changes

Status: ready-for-human
Area: map, player site

The eval-11 build found this on 2026-10-28; the old code had it too. react-leaflet sets a label's
permanent/hover mode once, when it creates the tooltip. The label-collision pass decides the mode
for each zoom, but a label that starts as hover-only stays hover-only after zooming in, and an
always-on label stays always-on after zooming out where it now collides.

## Acceptance criteria

- When the zoom changes a pin's label decision, the label's mode changes too. This holds both ways:
  hover to always-on, and always-on to hover.
- It keeps eval-11's caching: a search keystroke, pan or hover still causes no `setIcon`, and labels
  are rebuilt only for pins whose decision changed.
- A test zooms in and out on a fixture with colliding labels and checks each label's mode.

## Comments

2026-10-28, branch `eval-20-label-mode-zoom` (on top of `audit-08-flyto-zero-size`): the pin's
`Tooltip` in `PlacementMarkers.tsx` is keyed by its label mode, so React remounts it (unbind, new
`L.Tooltip`, bind) only when the zoom flips that pin's decision; react-leaflet's Tooltip has no
update hook, so `permanent` can't change in place. `pinLabels.test.tsx` now zooms one mounted map
0 → 2 → 0 and checks every copy's mode, and that unchanged labels keep their tooltip object; the
per-zoom remount workaround is gone. The PIN_BENCH run still shows 0 `setIcon` on keystroke, pan
and zoom. Ready for Isak's look: labels now appear and disappear as he zooms.
