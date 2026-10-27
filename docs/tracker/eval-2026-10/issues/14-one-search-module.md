# One search for the palette, Browse and Timeline

Status: ready-for-agent
Area: player site, search

Provisional call (grill round 2, Q2), 2026-10-27: Isak hasn't answered yet; built on the
recommended answer. Reversing it means dropping this ticket.

The search palette (`src/atlas/search/SearchPalette.tsx`) parses `"quoted phrases"` with
`parseSearchQuery.ts` and searches note text. `AtlasBrowse.tsx` and `AtlasTimeline.tsx` go through
`entityMatchesQuery.ts`, which does neither, so the same query finds different notes on different
pages.

## Acceptance criteria

- One search module owns query parsing and matching; the palette, Browse and Timeline all call it.
- Quoted phrases and note-text matching work on all three pages.
- Tests: the same query returns the same entities through each page's entry point; the existing
  search tests pass.
