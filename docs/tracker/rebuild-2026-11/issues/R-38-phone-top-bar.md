# R-38 Phone top bar: breadcrumb and search on one bar

Status: ready-for-agent
Blocked by: -
Size: S
Branch: `rebuild-r38-phone-top-bar`
Model: Sonnet (settled plan)

Found by the R-36 Phase 3 playtest (2026-11-11, `previews/r36/notes.md`, gitignored).

ux-flows P7: on a phone the breadcrumb and search share one bar. On v2 at 375 px the top bar is
137 px tall in three rows: menu, home, chip, ruler, calm and search on row 1; the offline icon
alone on row 2; the breadcrumb on row 3. R-33 accepted the wrapping as provisional.

## Acceptance criteria

- At 375 px the top bar is one row (or two at most, with nothing alone on a row): breadcrumb and
  search side by side; the rest of the controls move into the menu (P7).
- The offline icon no longer takes a row of its own.
- The bar is well under 137 px tall. The map gets the space back.
- Desktop unchanged. v1 output unchanged.
- Tests for the narrow layout where the viewer tests can see it; real browser check at 375 px on
  `atlas:serve:next`, both campaigns.

## Touches

`src/pages/AtlasViewer.tsx` (toolbar), `src/atlas/map/MapBreadcrumb.tsx`, `src/index.css`.

## Out of scope

Redesigning the desktop bar.
