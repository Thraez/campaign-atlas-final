# Spec — Honest player preview (faithful "as players see it" view)

**Created:** 2026-06-14 · **Status:** blessed WANT (queue G1) · **Gate:** standard (pure client-side reuse —
no build-pipeline change). **Security-relevant** (the feature's whole point is proving no DM content leaks) —
a redaction-leak regression test is mandatory.

> Blessed by the human 2026-06-14 ("continue with your recommendations" — this was the earmarked high-value
> next feature). Investigation 2026-06-14 confirmed it is **bounded / reuse, no design fork.**

## Problem

The editor's "player" view mode only filters **which entities** appear (`filterEntitiesForLens`). It does
**not** consistently redact content **within** an entity in the reading pane — so `%%dm%%` / `:::dm:::`
blocks, DM-only profile fields (wants/fears/secret/…), secret/DM relationships, and links to DM entities can
still be visible while "player" mode is on. The DM therefore has **no faithful "exactly what players see"
preview** and cannot verify nothing leaks before publishing.

## Key finding (verified 2026-06-14) — it's all reuse

The full player redaction pipeline already exists as **pure, client-reusable** functions; the master is
`projectEntityForPlayer()` (`src/atlas/content/projectEntityForPlayer.ts`), which orchestrates:
`stripDmBlocks` / `stripDmFromShippingString` (`src/atlas/content/stripDmBlocks.ts`), wikilink cross-ref
redaction (DM-target links → `…`/broken), `stripDmProfile` + `filterRelationshipsForPlayer`
(`src/atlas/profiles/profileBuild.ts`), meta-tag scrub, and `sanitizeAtlasHtml`. `EntityReadingView` /
`EntityPanes` already call `projectEntityForPlayer()` in player mode — but only in some (modal / opt-in
side-by-side) contexts, not as the primary, consistent reading experience. **The gap is exposure +
consistency, not new redaction.**

## Goal

When the DM switches to **Player view** (the existing `ViewMode` toggle), the *entire* editor reading
experience becomes a faithful player projection: entity content redacted via `projectEntityForPlayer()`,
entity/map lists filtered via `filterEntitiesForLens`, with a clear **"Previewing exactly what players see"**
indicator. The DM can confirm nothing DM-only leaks, without publishing.

## Approach (bounded — reuse only)

- Make the **player** `ViewMode` drive the **primary** reading pane through `projectEntityForPlayer()`
  consistently (today it's inconsistent — only some surfaces redact). DM view stays full-content.
- Add a persistent, unmistakable **"Player preview — as players see it"** indicator when player mode is on.
- Coverage to verify in the preview: `%%dm%%`/`:::dm:::` body blocks gone; DM-only profile fields gone;
  secret/DM relationships gone; links to dm/hidden entities shown in the redacted/broken form; rumor
  entities shown with their existing "rumored" treatment; hidden/dm entities absent from lists.
- **Reuse the existing pure functions. Write NO new redaction logic. Do NOT rebuild a player atlas** — live
  projection via the same functions the build uses is faithful and sufficient.

**UX latitude (build the default; do not expand):** the existing DM/Player toggle is the single control —
flipping to Player makes the whole reading experience faithful (content redaction + entity filtering +
indicator). A separate dedicated full-screen "preview" route/modal is **out of scope for v1.**

## Mandatory leak-regression test

Construct an entity carrying every DM channel — a `%%secret%%` body block, a DM-only profile field, a
`visibility: dm` relationship, and a `[[DM-only entity]]` link — and assert the **player-preview render
contains none of them** (and the DM render still does). This is the security contract; it must be a test,
not a manual check.

## Files (expect)

- `src/atlas/view/ViewModeProvider.tsx` + consumers — player mode drives content redaction everywhere.
- `src/atlas/entity/EntityReadingView.tsx`, `EntityPanes.tsx`, `EntityPanel.tsx` — honor player mode via
  `projectEntityForPlayer()` in the **primary** reading pane (not just opt-in side-by-side).
- `src/pages/AtlasPlacementEditor.tsx` — the view toggle + the "previewing as players" indicator.
- Tests: the mandatory leak-regression test + an indicator/visibility test.

## Done when

- Flipping to **Player view** shows entities fully redacted (no `%%dm%%` text, no DM profile fields, no
  secret/DM relationships, DM-entity links redacted) AND only player-visible entities/maps appear AND a clear
  "as players see it" indicator shows. DM view unchanged (full content).
- The leak-regression test proves a planted DM secret is **absent** from the player preview.
- Gate green (sharded vitest; tsc; eslint). No build-pipeline change. ~1–2 runs.
