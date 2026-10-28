# Pin labels switch between always-on and hover when the zoom changes

Status: ready-for-agent
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
