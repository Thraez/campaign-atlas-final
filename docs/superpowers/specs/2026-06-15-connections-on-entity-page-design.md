# Spec — Show authored Connections on the entity page (I1)

**Created:** 2026-06-15 · **Status:** blessed WANT (queue I1) · **Gate:** standard (pure
client-side display — no build-pipeline change). **Security-relevant** (per-link visibility
must be honoured in the reading pane) — a leak-regression test is mandatory.

## Problem

Authored `entity.relationships[]` entries are saved by the editor (each with a
`visibility: "player" | "dm"` tag and an optional `label`) but are **never displayed
anywhere in the reading pane** — player or DM view. The DM has no way to see, at a
glance, what connections an entity has without opening the Entities tab. Players can't
see the connections the DM intentionally marked as player-visible at all.

The data is fully in place: `EntityRelationship` in `src/atlas/profiles/profileTypes.ts`,
parsed by `parseRelationships` in `scripts/atlas/parseFrontmatter.ts`, stored on
`Entity.relationships[]` (schema: `src/atlas/content/schema.ts:180`), and already
filtered by `filterRelationshipsForPlayer` inside `projectEntityForPlayer`
(`src/atlas/content/projectEntityForPlayer.ts`). Nothing is rendered from it in the
reading view today.

## Key finding (verified 2026-06-15) — no duplication risk

No component in the reading panel (`EntityPanel`, `EntityReadingView`, `EntityPanes`)
currently renders `entity.relationships`. The only rendering of relationships today is
in the **editor's Entities tab** (`src/atlas/tabs/EntitiesTab.tsx` — `RelationshipSection`
component), which is an authoring form with dropdowns and delete buttons. This is the
authoring surface, not the reading surface. There is zero overlap.

The `"Mentioned in"` backlinks block already exists at the bottom of `EntityPanel`
(`src/atlas/entity/EntityPanel.tsx:337–352`). "Connections" goes directly beneath it.

## Goal

Surface `entity.relationships[]` as a compact **"Connections"** list at the bottom of
`EntityPanel`, directly beneath the existing "Mentioned in" backlinks, with:

- **DM view:** all relationships, both `player` and `dm` visibility. DM-only ones show
  a small lock icon or `(DM)` label so the DM knows players won't see them.
- **Player view / player build:** only `visibility: "player"` relationships whose target
  entity is also player-visible. The `projectEntityForPlayer` projection already strips
  the rest — `EntityPanel` simply renders what it receives; no new redaction logic is
  needed or permitted.

## Approach (bounded — display only, reuse only)

`EntityPanel` already receives the fully-projected entity (DM or player, depending on
caller). The projected entity's `relationships` array is already correct for the lens:
in player mode `projectEntityForPlayer` has already called `filterRelationshipsForPlayer`
and removed `visibility: "dm"` entries and entries pointing at DM-only targets.

The only change is **rendering** what `entity.relationships` already contains:

1. In `EntityPanel`, beneath the "Mentioned in" block, add a "Connections" block
   (same styling convention — `text-[10px] uppercase tracking-wider text-muted-foreground`
   label, same border-top separator). Only rendered when `relationships` is non-empty
   after the applicable filtering.

2. Each row shows:
   - The relationship `type` (verb, e.g. "allied_with") and `label` (human label, when
     present — prefer label over type when both exist).
   - A clickable name for the target entity — resolved via the `entityById` prop that
     `EntityPanel` already receives. If the target id is not in the map (unresolved),
     show the raw `entity` id in a muted style (no crash).
   - In **DM view only**, a `(DM)` muted badge on `visibility: "dm"` rows so the DM
     sees at a glance which connections are invisible to players. `EntityPanel` does not
     currently know whether it is in player mode; the caller already projects the correct
     entity, so rows that survived are player-visible and need no badge. The DM-badge is
     only needed when the full unfiltered `relationships` array is passed (DM view). The
     simplest correct implementation: render a DM badge if `r.visibility === "dm"`.
     In player mode the projected entity has no `visibility: "dm"` rows, so the badge
     will never appear in the player view — no special guard needed beyond what
     `projectEntityForPlayer` already does.

3. Clicking a target name calls `onOpenEntity(id)`, matching the "Mentioned in"
   backlinks pattern.

**No new files needed.** The sole change is inside `EntityPanel`.

**Out of scope for v1:** a full relationship graph, reciprocal-link computation
(showing this entity on the other entity's Connections), or relationship `description`
field rendering. Surface the authored list first.

## Autonomy Guard

"Connections" is display of data that exists. If any of the following arise, ship what
is working and hand back:
- Styling that requires a new shared component (use inline Tailwind, matching the
  "Mentioned in" block).
- A target-resolution gap that would require fetching outside `entityById` (use the
  fallback to the raw id).
- Test complexity that would push the build past 2 routine runs.

## Secrecy notes

Two distinct secrecy channels:

1. **`visibility: dm` relationships in the player view.** The projected entity passed to
   `EntityPanel` in player mode has already had `filterRelationshipsForPlayer` applied
   inside `projectEntityForPlayer`. `EntityPanel` renders what it receives. Adding no new
   redaction logic is correct and sufficient — the existing pipeline handles it.

2. **Relationships pointing at DM-only target entities.** Also handled by
   `filterRelationshipsForPlayer` (the `droppedByLeak` bucket). These are stripped
   before the entity reaches `EntityPanel` in player mode.

**Mandatory leak-regression test:** extend `src/test/entity/player-preview-leak-regression.test.tsx`
(or add a focused test in `src/test/entity/EntityPanel.test.tsx`) to assert that, given
an entity with a `visibility: dm` relationship and a relationship pointing at a DM-only
target, neither appears in the rendered Connections section when the entity has been
projected through `projectEntityForPlayer`. The DM-view render must show both. This must
be a test, not a manual check.

## Files

- `src/atlas/entity/EntityPanel.tsx` — add the "Connections" block beneath "Mentioned in".
- `src/atlas/profiles/profileTypes.ts` — `EntityRelationship` (read only, no change).
- `src/atlas/content/projectEntityForPlayer.ts` — no change (already filters `relationships`).
- `src/atlas/profiles/profileBuild.ts` — no change (already provides `filterRelationshipsForPlayer`).
- Tests: `src/test/entity/EntityPanel.test.tsx` (render + DM-badge present/absent) and extend
  `src/test/entity/player-preview-leak-regression.test.tsx` with a Connections-specific DOM
  assertion (the mandatory leak-regression test for this feature).

## Done when

- `EntityPanel` renders a **"Connections"** section beneath "Mentioned in" when the entity
  has relationships.
- DM view: all relationships (player and dm) are listed; `visibility: dm` rows carry a
  visible `(DM)` badge.
- Player view (via `EntityReadingView` and `EntityPanes` in player mode): only
  player-visible, player-target relationships appear — no DM-badge visible.
- Clicking a target name opens that entity via `onOpenEntity`.
- Unresolved target ids (not in `entityById`) degrade gracefully (raw id shown, no crash).
- Entities with no relationships show no "Connections" section (no empty placeholder).
- The mandatory leak-regression test asserts a `visibility: dm` relationship and a
  relationship to a DM-only entity are **absent** from the player-projected Connections
  DOM, and **present** in the DM-view DOM.
- Gate green: sharded vitest, tsc clean, eslint clean. No build-pipeline change. ~1–2 runs.
