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

## Built

Polish item P-03, branch `polish-p03-phone-top-bar`.

- On v2 below 768 px (new `usePhoneBar`, a `matchMedia` hook; false in jsdom and on desktop) the
  bar is `[menu][home][breadcrumb][search icon]` on one row, no wrapping. Ruler, calm mode, grid
  and offline options moved into the menu drawer as a "Map tools" group (`PhoneBarTools`, new
  `tools` render prop on `AtlasNavMenu`, which is now controlled so the ruler row closes the
  drawer). Calm shows On/Off and keeps `aria-pressed`; offline options is a row (`OfflineMenu
  row`) that opens the same dropdown. The campaign chip is not repeated: the drawer's title is
  already the campaign name. The legend is on the map, not in the bar.
- Breadcrumb: `collapseCrumbs` (pure, tested). Up to three levels show in full; deeper trails show
  "…" plus the last two, and "…" opens a menu of the earlier levels, so every level stays
  reachable. Crumb buttons, home, menu and search are 40 px tall at least.
- Bar height at 375 px: 137 px before, 61 px after (ocean and Quessaly > Oskmark, both campaigns).
  Desktop (1280): 61 px and the same controls as the baseline.
- Provisional calls: the grid toggle also moved into the menu; the phone breakpoint is `md`
  (768), so a 768 to 1023 px tablet keeps the full bar plus the hamburger as before. v1 is
  untouched (its bar never wraps, and the phone layout is v2 only).
- Tests: `collapseCrumbs.test.ts`; two cases in `AtlasViewer.v2.test.tsx` (bar holds only the
  four items; menu holds ruler and calm, ruler closes it).
- Not checked: v1 in a browser (unchanged code path, covered by the existing smoke tests); a
  trail deeper than three levels in a browser (the test world has three; the fold is unit
  tested); a real touch device.
- Shots: `docs/polish-2026-11/shots/p03-*.jpg`.
