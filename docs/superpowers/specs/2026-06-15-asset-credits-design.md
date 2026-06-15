# Spec — Asset credits (license/credit field + auto-generated credits page)

**Created:** 2026-06-15 · **Status:** NICE-TO-HAVE (queue N3) · **Gate:** build-pipeline (changes
`schema.ts` + `parseFrontmatter.ts` + `build-atlas.ts` → gate ALSO requires
`npm run atlas:publish:integrity-smoke` AND `npm run atlas:publish` green).

> **HUMAN-BLESS-REQUIRED / design-gated — do NOT auto-build.**
> This spec contains design decisions that need human sign-off before execution.
> The design questions are called out explicitly in the Open Questions section below.
> Build only after the human confirms the choices marked [DECIDE].

---

## Problem

The atlas has no mechanism to record where images came from. A DM using CC-licensed or commissioned
art has no way to capture `"Portrait by Evelyn K, CC BY 4.0"` in the vault, and there is no
player-facing page to display attributions. As the atlas grows, the absence becomes a legal and
courtesy gap. Adding credit metadata now — before images proliferate — is far cheaper than
retrofitting later.

---

## Design decisions (locked for human sign-off)

### [DECIDE] Field name and shape

**Chosen design: `credit` string on `AtlasFrontmatter` (and on `Entity`), one credit per
image-bearing entity.**

Rationale for the candidates:

| Candidate | Verdict |
|---|---|
| `license` | Too narrow — implies a specific SPDX license identifier; DMs want free-text attribution ("Portrait by Evelyn K, used with permission"). |
| `source` | Already common frontmatter field in other tooling; could conflict. |
| `credit` | Plain language; matches what a DM would write ("credit: Portrait by Evelyn K, CC BY 4.0"); the noun the player page would use. **Chosen.** |

Shape: `atlas.credit: "..."` in YAML frontmatter — a single optional string per note. If a note
carries multiple images from different sources the DM combines them in one credit line
(e.g. `"Map by A; portrait by B"`). A per-image credit array is a scope escalation deferred to v2.

### [DECIDE] Credits page location

**Chosen design: a new static route `/atlas/credits` — a dedicated page in the player viewer,
not an inline section on each entity.**

Rationale:

- Inline credit on every entity card is visual noise for the 95% of entities with no credit.
- A dedicated page matches the publishing-world convention (colophon/credits page at the end).
- It reuses the `AtlasBrowse` / `AtlasTimeline` page pattern (load atlas, render list) — no new
  architectural surface.
- The route is player-only and requires no editor gate; it is pure `AtlasProject` data.

The Credits page aggregates every player-visible entity that carries a non-empty `credit` field and
lists them in alphabetical order: entity title, credit string. No map tiles or images are
re-rendered on the page — just the text attribution list.

Navigation entry: added to `AtlasNavMenu.tsx` and the `AtlasViewer` inline nav bar alongside
Browse and Timeline.

### [DECIDE] Aggregate page only, no per-entity inline display

Inline credit under each entity portrait is deferred to v2. v1 ships the aggregate page only. This
matches the "ship the safe core" autonomy-guard rule and keeps the change bounded.

---

## Approach

Four parts, all tightly scoped:

**1. Schema — add `credit?` to `Entity` in `src/atlas/content/schema.ts`.**
One optional string field on `Entity`. The `AssetRef` type (`id / src / type`) is a build
artifact already in the schema but currently unused by runtime code (the `assets: []` array is
always empty — see build-atlas line ~915). Credits are attached to entities, not to `AssetRef`
entries, so `AssetRef` is unchanged.

**2. Frontmatter parser — add `credit` to `AtlasFrontmatter` in
`scripts/atlas/parseFrontmatter.ts`.**
Parse `atlasRaw.credit` as an optional string (same pattern as `summary`, `race`). Add to the
`AtlasFrontmatter` interface. No validation beyond type coercion — any non-empty string is valid.

**3. Build pipeline — thread `credit` through `build-atlas.ts`.**
In the entity construction block (~line 453), pick up `parsed.atlas.credit` and set
`entity.credit`. No stripping needed: credits are benign world-level metadata carrying no DM
content by design (if a DM puts a DM secret in a credit string, that is user error, not a
structural leak channel — the field is intended for attribution text only and has no `%%...%%`
convention). Player builds include `credit` unmodified, exactly like `oceanColor` is included
in map data without stripping.

**4. Player page — new `src/pages/AtlasCredits.tsx`.**
Follows the `AtlasBrowse` / `AtlasTimeline` pattern:
- Load `AtlasProject` via `loadAtlasContent(true)` (`true` bypasses the in-memory cache so
  the page always fetches fresh data; player-safety comes entirely from the build-time gate —
  the player `atlas.json` only contains player-visible entities, so no runtime filtering is needed).
- Filter to entities where `credit` is a non-empty string.
- Render an alphabetically sorted list: entity title + credit string. No images, no bodyHtml,
  no DM fields.
- If no entities have credits, show a short empty-state message ("No image credits recorded yet").
- Wired as `/atlas/credits` in `src/App.tsx` (lazy import, same pattern as `AtlasTimeline`).
- Navigation entry added in `src/atlas/AtlasNavMenu.tsx` (hamburger nav) and in the
  `AtlasViewer.tsx` inline toolbar alongside the existing Browse / Timeline links.

---

## Secrecy / player-safety notes

Credits are benign world-level data (same category as `oceanColor`, `importFolders` name strings).
The secrecy edge case specific to this feature:

**A DM must not be able to accidentally reveal that a DM-only entity exists via the credits
page.**

Mitigation: the credits page filters entities via `loadAtlasContent(true)` — the same path that
produces the player atlas. Only entities with `visibility: player` or `visibility: rumor` survive
into `AtlasProject.entities` in a player build. DM-only and hidden entities are excluded at
build time by `filterEntitiesForLens` / the `PLAYER_VISIBLE` gate in `build-atlas.ts`. A
DM-only entity's `credit` field is therefore never shipped to the player build at all.

**No new redaction logic is introduced.** The existing build-time entity visibility gate is the
sole mechanism. No call to `projectEntityForPlayer`, `stripDmBlocks`, or `filterEntitiesForLens`
is needed at the credits-page level because the data arriving in `AtlasProject.entities` is
already player-safe.

**Mandatory leak-regression test:** construct a DM-only entity (`visibility: dm`) with a
non-empty `credit` field and assert that (a) the entity does NOT appear in the player build's
`atlas.json`, and (b) no entry for it appears on the credits page. A player-visible entity with
a credit should appear. This test must live alongside the build-atlas tests.

**Gate adds:** `npm run atlas:publish:integrity-smoke` AND `npm run atlas:publish` must be green
(this change touches the build pipeline — `credit` is a new field in the player `atlas.json`).

---

## Autonomy Guard

Ship the four parts above. **Do not expand to:**
- Per-entity inline credit display in the reading pane.
- Per-image credit (changing `images: string[]` to an array of objects).
- A bulk-edit UI for credits in the DM editor.
- Structured license identifiers or SPDX validation.

If wiring the `/atlas/credits` route exposes unexpected complexity in `App.tsx` (e.g. a
type-safety issue with the lazy-load pattern), ship everything except the route and hand back
that slice with a note.

---

## Files

- `src/atlas/content/schema.ts` — add `credit?: string` to `Entity`
- `scripts/atlas/parseFrontmatter.ts` — add `credit?: string` to `AtlasFrontmatter`; parse
  `atlasRaw.credit`
- `scripts/build-atlas.ts` — pick up `parsed.atlas.credit` in the entity construction block
- `src/pages/AtlasCredits.tsx` — new player-side credits page (follows `AtlasBrowse` pattern)
- `src/App.tsx` — lazy-import `AtlasCredits`; add `/atlas/credits` route
- `src/atlas/AtlasNavMenu.tsx` — add "Credits" nav item
- `src/pages/AtlasViewer.tsx` — add Credits link to the inline toolbar nav
- Tests:
  - Extend build-atlas / parseFrontmatter tests: `credit` parses and round-trips into
    `atlas.json`; DM-only entity with credit is absent from player build (the mandatory
    secrecy regression).
  - `src/test/atlas-credits-page.test.tsx` — credits page renders credited player-visible
    entities; empty state when none; no DM-only entity appears.

---

## Done when

- `atlas.credit: "Portrait by X, CC BY 4.0"` in a note's YAML frontmatter appears as
  `entity.credit` in the player `atlas.json`.
- The `/atlas/credits` page lists every player-visible entity that has a credit string,
  alphabetically, showing entity title + credit text.
- A DM-only entity with a `credit` field does **not** appear on the credits page or in the
  player `atlas.json` (mandatory secrecy regression test asserts this).
- The Credits link appears in `AtlasNavMenu` (hamburger) and in the `AtlasViewer` inline toolbar.
- If no entities have credits the page shows a graceful empty state.
- Gate green: TypeScript clean, ESLint clean, all tests green (sharded vitest), atlas
  integrity-smoke green (5/5), `npm run atlas:publish` green (10/10). ~1–2 runs.
