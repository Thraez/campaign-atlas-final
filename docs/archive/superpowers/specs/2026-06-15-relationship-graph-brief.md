# Design brief — Relationship graph view (who-connects-to-whom)

**Date:** 2026-06-15
**Status:** Brainstorm/design-only; no edits, no plan yet
**Category:** BIG-BET — needs a human design session, NOT an auto-build unit
**Recommended model:** Opus 4.7
**Recommended skill:** `/ce-brainstorm` or `/product-management:brainstorm`
**Estimated session:** 60–90 minutes
**Depends on:** the "Connections on the entity page" WANT (I1) is the natural first step; this graph builds on the same `relationships[]` data, but does not strictly require I1 to ship first.
**Caution:** A player-facing graph is a NEW secrecy surface. Do not let the visual polish pull focus from the leak test — that is the load-bearing part of this feature.

## What we're deciding (plain language)

Today every entry can already declare *who it's connected to* — the schema has a
`relationships[]` field (Sir Aldric → **sworn to** → House Vale; the Thieves' Guild
→ **rivals** → the City Watch). The DM authors these in frontmatter, the build
pipeline already carries them through, and it already strips the secret ones out of
player builds. But there is **nowhere in the app that draws the web.** A player (or
the DM) can read one entry and see its links as text, but can't stand back and *see
the shape of the world* — the factions, the feuds, the family trees, the patronage
chains.

**The question for this session:** *What does the graph actually show, who is it for
in v1, and how does someone move through it?* A relationship graph is one of those
features that looks obvious and turns out to have three or four very different
shapes, each with a different cost and a different payoff.

This is a richer-world payoff: the map shows *where* things are; the graph would show
*how they relate*. It's the second axis of the atlas.

## Why this matters for the DM

- **For the DM at the table:** "Wait, who does this NPC answer to again?" is a
  constant question. A graph answers it in one glance instead of three clicks
  through wiki entries.
- **For players:** a connection web makes the world feel *alive and political*
  rather than a list of place names. It's the kind of thing that makes a campaign
  wiki feel like a real setting bible.
- **For authoring discipline:** a graph makes *gaps* visible. An NPC floating with no
  edges is an NPC the DM hasn't tied into anything yet. The graph is a to-do list in
  disguise.

## Why a brief, not a plan

This feature has several plausible shapes, and they don't cost the same. The session's
job is to pick the shape, not to start drawing.

### Axis 1 — Scope: whole-world vs per-entity neighborhood

- **(A) Whole-world graph.** One big web of every entity and every relationship.
  Maximum "wow," but the hardest to make legible — at even ~150 entities a naive
  force-directed blob is an unreadable hairball, and it's the most expensive to make
  perform and the most expensive to make *safe* (every node is a potential leak).
- **(B) Per-entity neighborhood ("ego graph").** Open an entry, see *its* connections
  one or two hops out. Small, always legible, cheap to render, and the secrecy story
  is trivial (you only ever draw the relationships that already survived the player
  filter for entities the player can already see). This is essentially I1
  ("Connections on the entity page") rendered as a small graph instead of a list.
- **(C) Both, phased.** Ship (B) first as a panel on the entry, then add (A) later as
  a standalone "Connections" page once the interaction model is proven.

### Axis 2 — Layout

- **Force-directed** (nodes repel, edges pull). Best for organic whole-world webs;
  worst for legibility at scale and for stable, reproducible screenshots (it jitters,
  and the layout changes every load unless you seed it).
- **Radial / ego-centric** (the focused entity in the center, neighbors on rings by
  hop distance). Ideal for the per-entity neighborhood (B) — predictable, readable,
  and it reads like a relationship *diagram* rather than a physics toy.
- **Simple adjacency / columns** (grouped by type or relationship verb, straight
  connectors). The least flashy, the most legible, the cheapest, and the most
  accessible (works without animation, easy to make keyboard-navigable). A strong
  default for v1.

### Axis 3 — Build it ourselves vs pull in a library

- **Hand-rolled SVG.** The codebase already hand-rolls SVG-ish rendering (pin SVGs in
  `src/atlas/pins/presets.ts`, the Leaflet polygon/polyline layers). For the
  per-entity radial/adjacency case (B), a few hundred lines of SVG with no dependency
  is very achievable and keeps the player bundle small.
- **A small graph library** (e.g. a lightweight force layout). Buys whole-world (A)
  layout quality but adds a dependency to the *player* bundle, which today is kept
  deliberately lean (routes are lazy-loaded, the editor is tree-shaken out entirely).
  A heavy graph lib on the player path is a real cost to weigh.

## Recommendation

**Ship (B) + radial/adjacency + hand-rolled SVG as v1, player-facing, mounted as a
panel on the entry — then revisit whole-world (A) as a separate decision.**

Reasoning:

1. **It rides the secrecy seam we already trust.** The per-entity neighborhood only
   ever draws relationships that already passed `filterRelationshipsForPlayer`, to
   entities the player can already open. No new filtering logic — the same projection
   that protects the text protects the graph.
2. **It's the smallest thing that delivers the payoff** and it *is* the I1
   "Connections" feature, just drawn instead of listed. One feature, two birds.
3. **No new dependency, no bundle hit, stable screenshots.** A radial ego-layout is
   deterministic, so it prints cleanly into the existing PDF handout path and doesn't
   jitter on reload.
4. **Whole-world (A) is a genuinely good idea but a different feature** — different
   legibility problem, different performance ceiling, different (much larger) leak
   surface. Decide it once (B) has proven the interaction model and we know how the
   DM actually uses it.

The one thing to decide deliberately in the session is **player-facing vs DM-only for
v1.** Recommendation: **player-facing**, because the secrecy story for (B) is clean
and the player payoff is the whole point — but only if the leak test (below) is part
of the same change, not a follow-up.

## The real risks — especially secrecy

This is the part that must not be hand-waved. **A relationship graph is a brand-new
way for DM-only information to escape into a player build.** The good news: the
pipeline already does the hard filtering. The risk is that a new *rendering* surface
draws something the filter would have removed.

What protects us today (verified in the code):

- The player `atlas.json` is built with relationships already filtered at build time —
  `scripts/build-atlas.ts` (~line 836) runs `filterRelationshipsForPlayer`, drops
  `visibility: dm` relationships, drops relationships pointing at DM-only entities as
  **spoiler leaks**, and warns/fails strict-player builds on each leak.
- The client-side DM preview mirrors this exactly via
  `src/atlas/content/projectEntityForPlayer.ts` (step 6), so the "what a player sees"
  dry-run and the shipped build can't disagree.
- The shared rule lives in one place: `filterRelationshipsForPlayer` in
  `src/atlas/profiles/profileBuild.ts`.

The graph **must consume the already-projected data and nothing else.** Concretely,
the failure mode to guard against:

1. The graph builds its adjacency from a *different* source than the projected
   entity list (e.g. re-reading raw `relationships[]` instead of the filtered set, or
   resolving a node to an entity that isn't in the player set). Either reintroduces a
   leak the pipeline already closed.
2. An edge whose **target** is a DM-only entity gets drawn as a stub/"unknown" node —
   that node's mere *existence and degree* is a spoiler ("this public NPC is connected
   to something hidden"). The graph must not render dangling edges to filtered-out
   targets at all, not even as anonymous nodes.
3. Relationship `label`/`description` strings ride along into tooltips. Those are
   scrubbed for inline DM blocks by the build (`stripDmFromShippingString`), but the
   graph's hover/label rendering must use the **projected** strings, never re-derive
   from raw frontmatter.

**Required:** a leak-regression test in the spirit of the existing one
(`src/test/entity/player-preview-leak-regression.test.tsx`, the G1 "honest player
preview"). It should construct an entity with a `visibility: dm` relationship and a
relationship to a DM-only entity, render the **graph** in player projection, and
assert that neither the DM edge, the DM target node, nor the DM label appears in the
output — while the DM-mode render still shows them. No graph ships without this test.

**Obsidian-file risk:** essentially none for v1. The graph is **read-only** over
`relationships[]`. It does not write back to the vault, does not touch frontmatter,
does not run during import. If a later version adds "edit relationships from the
graph," that crosses into the save seam and becomes a different, heavier risk
conversation — explicitly out of scope here.

## Surfaces / files this would touch (grounded in real code)

Data model (read-only — do **not** change the schema for v1):
- `src/atlas/content/schema.ts` — `Entity.relationships?: EntityRelationship[]`
  (lines ~179–181) is the source data.
- `src/atlas/profiles/profileTypes.ts` — `EntityRelationship` (`entity`, `type`,
  `label?`, `description?`, `visibility`).

The secrecy seam to reuse (do **not** reimplement):
- `src/atlas/profiles/profileBuild.ts` — `filterRelationshipsForPlayer` (the one true
  rule).
- `src/atlas/content/projectEntityForPlayer.ts` — `buildProjectionContext` +
  `projectEntityForPlayer`; the graph should be fed from projected entities, using the
  same `ProjectionContext` (it already exposes `entityVisibility` and `secretIds`).
- `scripts/build-atlas.ts` (~830–851) and `scripts/check-artifact-shape.ts` (~104–109)
  — the build-time strip + artifact scan that already cover relationships; confirm the
  graph adds no new shipped field that escapes these scans.

Where the graph would mount (new code):
- A new graph component under `src/atlas/` (e.g. `src/atlas/graph/`), hand-rolled SVG.
- **For (B):** rendered inside the entry panel — `src/atlas/entity/EntityPanel.tsx`
  (which today renders backlinks as "Mentioned in" but does **not** yet render
  `relationships[]` at all — confirming I1 is unbuilt and this is greenfield).
- **If (A) is ever chosen:** a new lazy route in `src/pages/` registered in
  `src/App.tsx` (alongside `/atlas/browse`, `/atlas/timeline`), plus nav entries in
  `src/atlas/AtlasNavMenu.tsx` and the `AtlasViewer` toolbar. Follow the existing
  lazy-load pattern so it stays off the landing bundle.

Data access:
- `src/atlas/content/loader.ts` — the player runtime already loads a single,
  pre-filtered `atlas.json`; the graph reads from that in-memory project, no new fetch.

Build gates (required — any implementation touching `scripts/` or adding a shipped field):
- `npm run atlas:publish:integrity-smoke` — confirms the artifact shape passes all existing scans.
- `npm run atlas:publish` — full player build + leak scans; must exit clean.

Test (required):
- New leak-regression test alongside
  `src/test/entity/player-preview-leak-regression.test.tsx`.

## Open questions the human must decide

1. **Scope:** whole-world (A), per-entity neighborhood (B), or phased (C)?
   *(Recommendation: B first, A as a separate later decision.)*
2. **Audience for v1:** player-facing or DM-only? *(Recommendation: player-facing —
   but only bundled with the leak test.)*
3. **Layout:** radial ego-graph vs simple grouped-adjacency vs force-directed?
   *(Recommendation: radial or adjacency for B; force-directed only if A is chosen.)*
4. **Library vs hand-rolled** — and is any dependency on the *player* bundle path
   acceptable given how lean it's deliberately kept?
5. **Edge semantics:** are relationships directional and shown as arrows
   (A *sworn to* B ≠ B *sworn to* A), or symmetric? Do we de-duplicate reciprocal
   edges, and do we draw an edge if only *one* side declared it?
6. **Interaction model:** click a node to open its entry? Click to *re-center* the
   graph on it? Both (click opens, double-click re-centers)? How does it behave on
   mobile / the bottom-sheet panel?
7. **Legibility ceiling:** what's the entity count at which a whole-world view stops
   being readable, and what's the fallback (cluster by type? by world? cap hop
   distance)? Only relevant if (A) is on the table.
8. **Accessibility:** a pure SVG web is invisible to a screen reader. What's the
   text-equivalent — does the graph degrade to the I1 connections *list* for
   keyboard/AT users? *(This should probably be a hard requirement, mirroring the
   project's existing WCAG care: tooltips, hit-areas, skip links.)*

## Non-goals

- Editing relationships from the graph (writes back to the vault) — separate, heavier
  feature.
- Any change to the `relationships[]` schema or the build-time filter.
- Whole-world layout performance work, unless the session explicitly chooses (A).
- A new graph dependency on the landing/critical bundle path.

## Why this is its own brief, not part of I1

I1 ("Connections on the entity page") is the table-stakes version: show an entry's
relationships as a readable list. This brief is the *next* step — drawing the web —
and it carries a decision I1 doesn't: **whole-world scope and a new player-facing
secrecy surface.** Recommendation is that v1 of this graph and I1 are effectively the
same change at the per-entity scale; the brief exists to force the scope/audience/
secrecy decision before anyone draws a node.
