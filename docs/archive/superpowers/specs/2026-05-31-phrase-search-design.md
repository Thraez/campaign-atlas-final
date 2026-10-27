# Phrase search (`"exact phrase"`) in the player search — design

**Date:** 2026-05-31
**Status:** blessed → queued as WANT **E5** (`docs/automation/continuous-dev-queue.md`)
**Origin:** dogfooding inbox / N1 ("Phrase search") in `docs/DEVELOPMENT_WANTS.md`; sanctioned in the docs
and explicitly distinct from fuzzy search (which is on the NEVER list).
**Backs queue unit:** E5
**Confidence:** medium — the most feature-shaped item in this batch (easy to defer). The semantics below
are deliberately simple and introduce **no** fuzzy matching.

## The problem

The player search treats the whole query as one blob: `q = query.trim().toLowerCase()`, then a weighted
`score()` over title/aliases/tags/summary/body with a substring `body.includes(q)`. There's no way to force
an **exact contiguous phrase** — searching `iron tower` can't be pinned to that exact wording.

Recon established (verify it still matches on `auto/continuous-dev`):
- The relevant surface is the **`SearchPalette`** component inside `src/pages/AtlasViewer.tsx` (the
  Ctrl+K command palette in `src/atlas/shell/useCommandPalette.ts` is title-only and **not** in scope).
- Matching + `score()` + `snippet()` currently live **inline** in `AtlasViewer.tsx`.
- The search index entries carry a lowercased `body` (for matching) and, since D3, an original-case
  `bodyText` (for display). Confirm both are present on the index entries; if `bodyText` is only on the
  content loader and not the index entry, see the contingency note under Testing.

## The fix

### 1. Parse the query into phrases + remainder
Add a pure `parseSearchQuery(raw: string): { phrases: string[]; rest: string }`:
- Extract every double-quoted span `"…"` as a phrase (lowercased, trimmed, empties dropped).
- The text outside quotes becomes `rest` (the existing single-string query path).
- An **unbalanced** trailing quote degrades gracefully: treat the dangling `"` as a literal character in
  `rest`, never throw.

### 2. Hard AND-filter on phrases
Build a per-entry lowercased haystack once — union of `title`, `aliases`, `summary`, and `body` — and keep
an entry **only if every** parsed phrase appears as an exact contiguous substring of that haystack. This is
an additional gate on top of the existing scoring: an entry that fails the phrase filter is excluded even
if its title would otherwise score.

### 3. Score / rank
- If `rest` is non-empty, run the **existing** `score()` over `rest` unchanged (so `"iron tower" guard`
  phrase-filters on `iron tower` **and** scores on `guard`).
- If the query is **only** phrases (empty `rest`), rank the surviving entries by reusing the existing weight
  ladder with the first phrase as the query term (title hit > summary > body), so order stays sensible.

### 4. Snippet
Pass the **first matched phrase** to `snippet()` so the preview window anchors on the phrase and highlights
it as one unit (the snippet function already treats its query arg as a single contiguous string). Use the
original-case `bodyText` for the displayed snippet where available (matching D3's behaviour).

### Refactor for testability
The matching currently lives inline in `AtlasViewer.tsx`. Extract `parseSearchQuery` and the phrase-match
predicate into `src/atlas/search/` (next to the existing `snippet.ts`) as small pure functions, and call
them from `SearchPalette`. Keep the refactor minimal — move logic, don't redesign the component.

> **Semantics, stated plainly:** quoted = exact, contiguous, case-insensitive substring; multiple quoted
> phrases are **AND**-combined; unquoted words behave exactly as today. No fuzzy/edit-distance matching is
> added — that remains a non-goal.

## Testing

There are currently no `SearchPalette` matching tests. Add tests for the extracted pure functions:
- `parseSearchQuery`: splits `"iron tower" guard` → `{ phrases: ["iron tower"], rest: "guard" }`; handles
  multiple phrases; an unbalanced `"` degrades to literal `rest` without throwing.
- phrase predicate: an entry whose text contains the exact contiguous phrase matches; one where the same
  words appear **non-contiguously** does **not** match; multi-phrase requires **all** present.
- a mixed query AND-combines phrase filter + token score.
- (snippet) the matched phrase is highlighted as a single span.

Full gate: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` green. This is query-path only and needs no
build/scan changes — **unless** the contingency below applies.

**Contingency:** if `bodyText` turns out **not** to be present on the search-index entries (only lowercased
`body`), phrase matching still works on `body`, but snippets would render lowercase. In that case add the
original-case `bodyText` to the index entry in `scripts/build-atlas.ts` (a one-field addition mirroring
`body` without `.toLowerCase()`). Because that touches the build pipeline, the gate then **also** requires
`npm run atlas:publish:integrity-smoke` and `npm run atlas:publish` green (`bodyText` is the same redacted
text as `body`, so no new secret surface).

## Acceptance criteria

- A quoted query (`"exact phrase"`) returns only entries containing that contiguous phrase.
- Unquoted terms still match as they do today; a mixed query AND-combines correctly.
- The matched phrase is highlighted in the result snippet.
- No fuzzy matching is introduced.
- Parse + match logic lives in tested pure functions under `src/atlas/search/`.
- Full gate green (plus integrity-smoke only if the `bodyText` contingency is hit).

## Out of scope

- Field-scoped search (`title:foo`), boolean OR/NOT operators, regex — only quoted exact phrases.
- The Ctrl+K command palette (title-only).
- Any change to ranking weights for unquoted search.
