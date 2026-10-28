# One search for the palette, Browse and Timeline

Status: done (PR #63, merged 2026-10-28)
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

## Comments

2026-10-27 (agent, Opus): Built on branch `eval-14-one-search`. `src/atlas/search/search.ts` is
now the one search module: `parseSearchQuery`, `compileQuery`, `searchMatches` (the shared match
rule), `searchEntries` (palette ranking), `entityMatchesQuery` (Browse and Timeline) and
`searchBodyText`, the markdown-to-plain-text step the build already used for `bodyText`, now
imported by `scripts/build-atlas.ts` so Browse and Timeline search exactly the text the palette
does (search-index output unchanged). `parseSearchQuery.ts` and `entityMatchesQuery.ts` are gone.
Player safety: Browse and Timeline read only atlas.json entity fields (`body` is already
DM-stripped by the player build); no editor imports. Test:
`src/test/search/one-search-across-pages.test.tsx` renders the palette, Browse and Timeline with
the same entities and checks four queries return the same ids; three of the four failed on the old
code (Browse found nothing for note-text and phrase queries). Visible change on player pages:
Browse and Timeline now find notes by their text and honour `"quoted phrases"`; a query made only
of empty quotes (`""`) now shows everything in the palette instead of nothing. Needs Isak's look on
Browse and Timeline before done.

2026-10-27 (agent, Opus): The two-axis review (standards, spec) ran on bc0bb43: spec met, player
safety confirmed, no blockers. Tidied on the same branch: Browse and Timeline compile the query
once per filter pass; `searchEntries` scores each entry once; `toSearchText` in `search.ts` is the
one place the lowercased search body is made (loader and Browse/Timeline both use it); the
lowercased field is now `searchText` (was `body`, easy to confuse with markdown `Entity.body`);
`CompiledQuery` shrank to phrases, term and isEmpty; a query of only `""` now behaves like a blank
query in the palette (recently viewed); `SEARCH_BODY_MAX_CHARS` is private; CODEBASE_MAP lists the
search tests. Still `ready-for-human`.
