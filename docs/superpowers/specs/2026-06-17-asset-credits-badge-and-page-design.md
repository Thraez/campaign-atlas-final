# Spec — Asset credits: corner badge + credits page (DM-toggled)

**Created:** 2026-06-17 · **Status:** BLESSED by the human (queue L1) · **Gate:** build-pipeline
(changes `schema.ts` + `parseFrontmatter.ts` + `build-atlas.ts` + world-config flow → gate ALSO requires
`npm run atlas:publish:integrity-smoke` AND `npm run atlas:publish` green).

> **Supersedes** `docs/superpowers/specs/2026-06-15-asset-credits-design.md` (which shipped the aggregate
> page only and deferred inline display to v2). This spec is the human-blessed full design: it keeps the
> credits page, **adds** the in-image corner credit badge, and makes **both surfaces DM-toggleable at build
> time**. The 2026-06-15 spec's data model and secrecy analysis are reused unchanged where noted.

---

## Problem

The atlas has no way to record or display where images came from. A DM using CC-licensed or commissioned
art (`"Portrait by Evelyn K, CC BY 4.0"`) can neither store the attribution in the vault nor show it to
players. As the atlas grows this becomes a courtesy and licensing gap, and retrofitting later is far more
expensive than adding the field now.

The DM wants two complementary ways to surface a credit, and wants to **decide which to use before
publishing** (no player-facing settings panel — the choice is baked into the published site):

1. A **subtle in-image badge** so the credit travels with the art wherever it is shown.
2. An **aggregate credits page** that gathers every attribution in one place (the publishing-world
   "colophon" convention).

---

## Design decisions (locked — blessed by the human)

### D1. Who controls it, and when

**The DM decides at build time.** Two toggles live in the editor; their state is baked into the published
`atlas.json`. Players see whatever the DM chose — there is **no viewer-side settings panel**. This matches
every other publish decision in the app and keeps the player site a static artifact.

### D2. Credit data shape — one `credit` string per entity

`atlas.credit: "..."` in a note's YAML frontmatter — a single optional string per note (reused unchanged
from the 2026-06-15 spec). `images` is `string[]` on `Entity`; a note's `credit` applies to that note's
image(s) collectively. A per-image credit array is a **v2 escalation, explicitly out of scope** — if a note
mixes sources the DM combines them in one line (`"Map by A; portrait by B"`).

### D3. Two site-wide toggles in a `credits` world-config block

A new world-level block in `world.yaml` (NOT per-map — a credits page is inherently site-wide):

```yaml
credits:
  badges: true   # show the corner credit badge on entity images
  page: true     # publish the aggregate /atlas/credits page + its nav link
```

Both default **`true`**: setting a `credit` on a note should "just show" without extra steps; the toggles
exist to turn a surface **off**. Because no existing note carries a credit today, defaulting on changes
nothing for current sites. The block threads through the existing world-config pipeline exactly as the
"living water" feature (`water`) did: `loadWorldConfig` (parse + sanitize) → `buildFullWorldYaml`
(serialize) → `scripts/build-atlas.ts` (into `World.credits` in the player `atlas.json`). Missing/partial
block → both default `true` via a pure `resolveCredits()` helper (mirrors `resolveWater()`).

### D4. Corner badge — placement and behavior

When `credits.badges` is on and an entity has a non-empty `credit`, render a credit badge over each of that
entity's images in `EntityPanel` (the `ImageThumb` row at `EntityPanel.tsx:293-304` and the lightbox view at
`~386`):

- **Position:** absolute, **bottom-right corner of the image, ~5px inset** (`bottom: 5px; right: 5px`).
- **Resting state:** **low opacity** (≈ `0.45`), small text on a faint rounded backdrop for legibility;
  long credits are truncated with an ellipsis so the badge stays small.
- **Hover / keyboard-focus:** transitions to **full opacity** and reveals the **complete** credit text
  (expanded, and mirrored in a native `title`/`aria-label` for tooltip + screen-reader access).
- **Non-interactive otherwise:** `pointer-events` limited to the badge; it must not block the existing
  thumb-click-to-lightbox interaction (badge sits above the image but the thumb click still opens the
  lightbox — verify in the test).
- Pure client-side rendering from already-player-safe `atlas.json` data. No new network or build asset
  pipeline.

### D5. Credits page — reused from the 2026-06-15 spec, now gated

When `credits.page` is on: a new static route `/atlas/credits` (`src/pages/AtlasCredits.tsx`, following the
`AtlasBrowse`/`AtlasTimeline` pattern) lists every **player-visible** entity with a non-empty `credit`,
alphabetically, showing entity title + credit string (text only — no images re-rendered). Empty state when
none. Nav entry in `AtlasNavMenu.tsx` and the `AtlasViewer` inline toolbar.

When `credits.page` is **off**, the route renders nothing meaningful and **the nav link is not shown** (the
DM chose not to publish it). The nav link is also hidden when the page is on but no credited entity exists,
to avoid a link to an empty page — equivalently, show the link only when `page` is on AND ≥1 credit exists.

### D6. Toggle UI — a "Credits (site-wide)" section in Map Settings

The two switches live in a clearly-labeled **"Credits (site-wide)"** section in `MapSettingsPanel.tsx`,
below the existing ocean/water controls. This reuses the existing settings surface and Save plumbing — the
"settings panel with toggles" shape the DM asked for — with **no new rail item or navigation**. The section
is explicitly labeled *site-wide* so the DM understands these apply to the whole atlas, not the current map
(unlike the per-map ocean/water controls directly above).

The toggles patch the world-level `credits` block and persist via the existing Save flow
(`buildFullWorldYaml` → `/__atlas/save`); undo is automatic. **Note for the plan:** `water`/`oceanColor` are
per-map (`patchMap`); `credits` is world-level, so the plan must use (or add, if absent) a world-level patch
path analogous to `patchMap` — `defaultMapId` is an existing world-level field whose edit path can be
followed.

---

## Approach (two increments — ship the core first)

### Increment 1 — data model + rendering + page, driven by `world.yaml`

End-to-end functional via the `credits` block (a DM could hand-edit `world.yaml` and it works), so the core
ships even if the toggle UI proves fiddly.

1. **Schema** (`src/atlas/content/schema.ts`): add `credit?: string` to `Entity`; add
   `credits?: CreditsConfig` to `World` with `interface CreditsConfig { badges?: boolean; page?: boolean }`.
2. **Frontmatter parser** (`scripts/atlas/parseFrontmatter.ts`): parse `atlasRaw.credit` as an optional
   string (same pattern as `summary`); add to `AtlasFrontmatter`.
3. **World config** (`scripts/atlas/loadWorldConfig.ts`): parse + sanitize the `credits` block; new pure
   `resolveCredits(raw)` (defaults both `true`, coerces non-booleans). `src/atlas/yaml/buildFullWorldYaml.ts`:
   serialize the `credits` block back to `world.yaml`.
4. **Build pipeline** (`scripts/build-atlas.ts`): set `entity.credit` from `parsed.atlas.credit`; set
   `world.credits` from the resolved config. No stripping — credits are benign world-level data, same
   category as `oceanColor` (a DM secret typed into a credit string is user error, not a structural leak
   channel).
5. **Corner badge** (`src/atlas/entity/EntityPanel.tsx` + a small `CreditBadge` component, e.g.
   `src/atlas/entity/CreditBadge.tsx`): render per D4 over each image, gated on `world.credits.badges !==
   false` AND `entity.credit` non-empty. CSS in `src/index.css` or component-scoped (resting opacity →
   hover/focus full opacity transition).
6. **Credits page** (`src/pages/AtlasCredits.tsx`, `src/App.tsx` route, `src/atlas/AtlasNavMenu.tsx`,
   `src/pages/AtlasViewer.tsx` toolbar): per D5, gated on `world.credits.page`.

### Increment 2 — the in-editor toggle UI

"Credits (site-wide)" section in `MapSettingsPanel.tsx` per D6: a toggle for badges and a toggle for the
page, patching the world-level `credits` block through Save. UI test asserts both toggles round-trip and
that flipping them changes the live preview (badge appears/disappears; nav link appears/disappears).

---

## Secrecy / player-safety

Reused unchanged from the 2026-06-15 spec: credits are benign world-level data; the **build-time entity
visibility gate is the sole mechanism**. DM-only/hidden entities never reach the player `atlas.json`, so
their `credit` is never shipped, never badged, never listed. No new redaction logic; no call to
`projectEntityForPlayer`/`stripDmBlocks` is needed at the credit layer.

**Mandatory leak-regression test:** a `visibility: dm` entity with a non-empty `credit` must be absent from
(a) the player build's `atlas.json`, (b) the credits page, and (c) any rendered badge. A player-visible
credited entity must appear in all three (when toggles on). This lives alongside the build-atlas tests +
the EntityPanel tests.

---

## Autonomy guard

Ship Increments 1 then 2. **Do not expand to:**

- Per-image credit (changing `images: string[]` to objects) — v2.
- Badges on inline `![[image.png]]` body embeds — v1 badges cover the entity `images[]` gallery + lightbox
  only (body embeds carry no per-image credit).
- A bulk credit-editing UI, SPDX/license validation, or structured license identifiers.
- Any viewer-side (player) settings panel — the toggles are DM-only, build-time.

If the **world-level patch path** for the toggle UI (Increment 2) turns out to be a large new surface, ship
Increment 1 fully (credits driven by `world.yaml`, hand-editable) and hand back Increment 2 with a note —
the feature still works end-to-end via the config file.

---

## Files

**Increment 1**
- `src/atlas/content/schema.ts` — `Entity.credit?`, `World.credits?`, `CreditsConfig`
- `scripts/atlas/parseFrontmatter.ts` — parse `atlas.credit`
- `scripts/atlas/loadWorldConfig.ts` — parse/sanitize `credits` + `resolveCredits()`
- `src/atlas/yaml/buildFullWorldYaml.ts` — serialize `credits`
- `scripts/build-atlas.ts` — thread `entity.credit` + `world.credits`
- `src/atlas/entity/CreditBadge.tsx` (new) + `src/atlas/entity/EntityPanel.tsx` — render badge
- `src/pages/AtlasCredits.tsx` (new), `src/App.tsx`, `src/atlas/AtlasNavMenu.tsx`,
  `src/pages/AtlasViewer.tsx` — page + nav (gated)
- `src/index.css` — badge resting/hover styling (if not component-scoped)

**Increment 2**
- `src/atlas/MapSettingsPanel.tsx` — "Credits (site-wide)" toggle section
- world-level patch path (reuse/extend the `defaultMapId` edit path)

**Tests**
- `resolveCredits` unit tests (defaults, partial block, non-boolean coercion)
- build-atlas / parseFrontmatter: `credit` + `world.credits` round-trip into `atlas.json`; **DM-only
  credited entity absent from player build** (mandatory secrecy regression)
- `src/test/entity/` EntityPanel: badge renders at low opacity when `badges` on + credit present; hidden
  when `badges` off or credit empty; thumb-click still opens lightbox; full credit in `title`/`aria-label`;
  **no badge for a DM-only entity in a player render**
- `src/test/atlas-credits-page.test.tsx`: lists credited player-visible entities alphabetically; empty
  state; gated off when `page` false; no DM-only entity appears
- `MapSettingsPanel` test (Increment 2): both toggles round-trip via Save; live preview reflects state

---

## Done when

- `atlas.credit` in a note's frontmatter appears as `entity.credit` in the player `atlas.json`; the
  `credits` block appears as `world.credits`.
- With `badges` on, each image of a credited entity shows a faint bottom-right corner badge (~5px inset)
  that reveals the full credit at full opacity on hover/focus; thumb-click still opens the lightbox.
- With `page` on, `/atlas/credits` lists every player-visible credited entity alphabetically, with a nav
  link (link hidden when no credits exist); empty state otherwise.
- Both surfaces hide when their toggle is off; the DM can flip both from the "Credits (site-wide)" section
  in Map Settings and see the change live, with Save persisting it to `world.yaml`.
- A DM-only credited entity is absent from the player `atlas.json`, the credits page, and any badge
  (mandatory secrecy regression asserts this).
- Gate green: TypeScript clean, ESLint clean, all tests green (sharded vitest), atlas integrity-smoke 5/5,
  `npm run atlas:publish` 10/10. ~2–4 runs across the two increments.
