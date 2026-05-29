# Original-case display: entity names + search snippets — design

**Date:** 2026-05-30
**Status:** blessed → queued as WANTs **D2** (Part 1) and **D3** (Part 2) (`docs/automation/continuous-dev-queue.md`)
**Origin:** live dogfooding pass, 2026-05-30 (items #2 and #3 in `docs/DEVELOPMENT_WANTS.md`)
**Backs queue units:** D2 (Part 1), D3 (Part 2)

Two independent fixes that both make the player UI read as finished instead of like a draft. They share a
theme (showing original case) but touch different code, so they're separate queue units and can ship
independently.

---

## Part 1 — Proper-case display names (queue unit D2)

### The problem

Entity names render as lowercase file-slugs — "corven", "edric", "soreth" — in search results, the
reading-panel title, and pin labels. It looks unfinished, especially to players.

### Root cause

The `title` field is **already case-preserved** everywhere it is rendered:

- `scripts/build-atlas.ts` builds the entity with `title: stripField(title) ?? title` (case kept).
- The search index stores `title: entity.title`; the player renders `r.title` (search rows),
  `entity.title` (`EntityPanel` `<h2>`), and `p.label ?? ent.title` (pin labels) — all verbatim.

So the lowercase is **baked into the data**, from `deriveTitle()` (`scripts/build-atlas.ts` ~line 162):

```ts
function deriveTitle(file: string, fmTitle?: unknown): string {
  if (typeof fmTitle === "string" && fmTitle.trim()) return fmTitle.trim();
  return path.basename(file, ".md").replace(/[-_]+/g, " ").trim();   // ← "corven", no casing
}
```

Notes **without** an explicit `title:` frontmatter (e.g. imported vault NPCs like `corven.md`) fall back
to the raw filename slug with no capitalization. Fixing the derivation fixes every surface at once.

### The fix

Title-case the **derived fallback only** — leave an explicit `fmTitle` untouched. Capitalize the first
letter of each whitespace-separated word; do not alter the remaining characters (so any embedded caps
survive). Unicode-aware first-letter capitalization, e.g.:

```ts
return path.basename(file, ".md")
  .replace(/[-_]+/g, " ")
  .trim()
  .replace(/(^|\s)(\p{L})/gu, (_m, sp, ch) => sp + ch.toUpperCase());
```

Results: `corven` → `Corven`, `great-hall` → `Great Hall`, `edric` → `Edric`.

**Accepted edge cases (document, don't over-engineer):** this is Title Case, so small words ("of", "the")
are also capitalized — fine for fantasy names. Acronyms encoded in slugs are rare and out of scope.
Explicit frontmatter titles are the escape hatch for anything the DM wants spelled a specific way.

### Testing & files

- Export `deriveTitle` (it's a small pure function) and unit-test it: no `fmTitle` → title-cased;
  multi-word slug → each word capitalized; explicit `fmTitle` → returned trimmed and unchanged.
- Optionally a build assertion: an entity whose source lacks a `title:` gets a capitalized title in
  `atlas.json`.
- Files: `scripts/build-atlas.ts`; a test under `src/test/` (e.g. extend `src/test/atlas-build.test.ts`).

### Acceptance (D2)

Slug-derived titles are title-cased; explicit titles unchanged; unit test covers both; full gate green.

---

## Part 2 — Original-case search snippets (queue unit D3)

### The problem

Search result snippets render all-lowercase ("survivors founded the great cities of thornhold…") even
though the source prose is mixed-case.

### Root cause

The search index `body` field is lowercased at **build** time, and the viewer renders the snippet
**straight from that lowercased field**:

- `scripts/build-atlas.ts` (~lines 944–963): `stripMd()` ends with `.toLowerCase()`, and the index entry
  sets `body: stripMd(entity.body).slice(0, 4000)`.
- `src/pages/AtlasViewer.tsx` `snippet()` (~line 718) slices and highlights directly from that `body`
  (the call site ~line 780 passes `e.body`).

The lowercasing is needed for case-insensitive **matching**, but it must not drive **display**.

### The fix

Keep a lowercased field for matching **and** ship a parallel original-case field for display:

1. `scripts/build-atlas.ts`: compute the stripped body **once without** lowercasing, then derive both
   fields from it:
   ```ts
   const stripped = stripMdNoLower(entity.body).slice(0, 4000); // existing cleanup, minus toLowerCase
   // index entry:
   body: stripped.toLowerCase(),   // matching (unchanged behavior)
   bodyText: stripped,             // NEW — original case, for display
   ```
   (Refactor `stripMd` so the lowercase is a final, separable step.)
2. `src/atlas/content/loader.ts`: add `bodyText?: string;` to `SearchIndexEntry` (comment it as the
   original-case display body).
3. `src/pages/AtlasViewer.tsx` `snippet()`: take both a **display** string and a **lower** string. Find
   the match index in `lower` (the query is already lowercased upstream, ~line 755), then slice the **same**
   `[start, end]` range from `display`. Keep the existing `gi` highlight regex (it already matches
   case-insensitively). Update the call site to `snippet(e.bodyText ?? e.body, e.body, q)` (the `?? e.body`
   keeps old indexes working). Scoring (~line 772) keeps using the lowercased `e.body`.

**Offset alignment:** `toLowerCase()` preserves length for this app's Latin content, so indices computed
on `lower` map 1:1 onto `display`. Guard defensively by clamping `end` to `display.length`; a
hypothetical length divergence then yields a slightly shifted slice, never a crash. Note this in a code
comment.

### Secrecy note (this touches the build pipeline)

`bodyText` is derived from the **same** `entity.body` as `body` — which is already redacted before the
search index is built — so it ships no new information (the body text is already in the player index,
just lowercased). Because this changes the build output, the gate for D3 **must** include
`npm run atlas:publish:integrity-smoke` **and** `npm run atlas:publish` staying green.

### Testing & files

- Unit-test `snippet()`: given a display string like `"…the Great Cities of Thornhold…"`, its lowercased
  twin, and `q = "thornhold"`, the result contains original-case `Thornhold` wrapped in `<mark>`.
- Build assertion: search-index entries carry a `bodyText` that is **not** all-lowercase (contains an
  uppercase letter present in the source).
- Files: `scripts/build-atlas.ts`, `src/atlas/content/loader.ts`, `src/pages/AtlasViewer.tsx`; tests under
  `src/test/`.

### Acceptance (D3)

A snippet renders original-case text with the match highlighted; a build test shows entries carry a
non-lowercased `bodyText`; full gate **plus** integrity-smoke + `atlas:publish` green.

---

## Out of scope (both parts)

Changing how titles are authored in frontmatter; fuzzy/phrase search (separate items); any change to what
content is included in the player build. These fixes only change **casing shown to the reader**, not which
data ships.
