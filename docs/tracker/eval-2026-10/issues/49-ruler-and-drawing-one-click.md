# Ruler and route/fog drawing both take the same map click

Status: in-review
Area: editor (map tools: ruler, drawing)

Found in an architecture review (2026-11-07).

In the DM editor (`src/pages/AtlasPlacementEditor.tsx`) the distance ruler (`RulerLayer`) and the
drawing layers each listen to map clicks on their own. The ruler was switched off only while a pin
was being placed or a region or sound area was being drawn. Route drawing (`RouteLayer`,
`routeDraft.drawing`) and fog/lit-area drawing (`FogLayer`'s `DrawingClicks`, `fogDraft.tool`) were
missing from that guard.

- **Bug, verified by reading and by a failing test:** with the ruler on while drawing a route or a
  fog shape, one click adds a ruler point and a vertex.

## Acceptance criteria

- A failing test first, through one pure decision of which tool owns a map click.
- While a pin is being placed or any drawing mode (region, route, fog, sound area) is active, the
  ruler takes no clicks; it works again when that ends.
- The editor's map cursor and ruler both follow that one decision, not separate guards.
- The player map's ruler (`AtlasViewer`) is unchanged.
- Checked by eye in the preview: ruler on, start a route, click; only a vertex appears
  (ready-for-human).

## Comments

- Built `resolveMapClickTool` (`src/atlas/editor/mapClickTool.ts`): returns `place-pin`, `draw`,
  `ruler` or `null`. The editor computes it once; `RulerLayer` is active only when it returns
  `ruler`, and the crosshair cursor shows whenever any tool is active (now also while drawing a
  route or fog shape). Test: `src/test/editor/mapClickTool.test.ts` (red on route and fog before
  the fix).
- Provisional call: drawing wins and pauses the ruler, rather than the ruler cancelling a drawing.
  The DM started the drawing on purpose, its vertices are work in progress, and this matches what
  pins, regions and sound areas already did. The ruler toggle stays pressed; its points are
  cleared while paused (`RulerLayer` resets when it goes inactive) and it measures again once the
  drawing ends.
- Not covered: a pending pin placement plus an active drawing can still both take a click
  (`onMapClick` places the pin, the drawing layer adds a vertex). That is outside this ticket.
- Not checked in the preview pane.
