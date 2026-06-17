# Brief — "Joyful wayfinding": hover-peek cards & the wander button

**Created:** 2026-06-17 · **Status:** ready-to-run design brief (own session) · **Owner:** the DM
**Run this in its own fresh session** (recommended on Opus — open-ended UI/UX design). Paste the kickoff prompt
at the bottom. This brief is self-contained; you do not need the chat it came from.

---

## What this session is for

Design the **browsing-feel** upgrades that make poking around the world joyful — specifically the two the DM
picked from the 2026-06-17 idea panel: **hover-peek cards** and the **wander button**. This is one of three
selected features (the others — player secrets, and atmosphere/sound — are separate sessions). Produce a
written, code-grounded, adversarially-reviewed spec, then an implementation plan. **Do not write feature code
in this session** until a spec is approved (use the brainstorming skill first).

## The two features

1. **Hover-peek cards.** Hovering (or press-and-hold on mobile) any wikilink, pin, or "Connections" entry pops
   a small card — portrait/first image, a one-line summary, a type badge — **without navigating away**, so the
   player chooses their next click on purpose. The player view shows only the **player-safe** summary; the DM
   view can show the full one. Removes the "click-tax" on curiosity, the biggest friction in browsing a dense
   lore web.
2. **Wander button.** A dice-like button drops the player at a **random unseen place** near where they've been,
   with a quiet **"X of Y places discovered"** meter that fills as they roam. Manufactures serendipity from the
   entity graph the build already ships — **zero new authoring** for the DM.

Nearby ideas from the same theme (fold in only if cheap and coherent; otherwise leave for later): region
"doorways" that shimmer toward the next map, a "footprints / what's-new" visited-trail, and search that flies
the map to a place. The **constellation view** is explicitly **out** here — it depends on the separate
relationship-graph roadmap item.

## Project context (everything you need)

- **What it is:** a D&D world atlas. Obsidian markdown notes → build (`scripts/build-atlas.ts`) →
  `atlas.json` + `search-index.json` → **dual publish**: a player-safe **static site on GitHub Pages** (no
  backend, no accounts) + a **local-only DM editor** (React + Leaflet). Audience: one **non-technical DM** and
  their players.
- **North star:** "effortless for me to build, rock-solid and rich for my players to explore." Tie-breaker:
  build smoother → share safer → explore richer.
- **The DM is not a developer.** Plain language, sleek one-button UX, hide internals. Claude owns code
  correctness.
- **Secrecy model:** the player build never contains DM content; `%%…%%` / `:::dm` stripped; DM-only entities
  excluded; build-time scans enforce it. **Good news for this feature:** both hover-peek and wander operate
  purely over **already-published, already-redacted player data**, so they add **no new secrecy surface** — far
  lower risk than the secrets feature. Still: make sure a hover card or the wander pool never surfaces a
  DM-only entity (it shouldn't, since the player build excludes them — verify, don't assume).
- **Relevant non-goals** (`docs/NON_GOALS.md`): no VTT; no multi-user; no hosted auth; no server-backed player
  state (so "discovered/visited" lives in **localStorage only**); **no fuzzy search** (keep exact-substring);
  no per-party variants. A mobile **player** viewer is wanted.
- **Already shipped — build on, don't repeat:** Leaflet maps with pins/regions/routes/fog; rich entity reading
  pane; "Connections" + "Mentioned in" backlinks; phrase search over a prebuilt index; deep-link share URLs
  that already follow pan/open; honest player preview.

## Grounded starting points (verified file pointers)

- **Wikilink rendering** (where hover-peek hooks in): wikilinks are tokenized via `tokenizeWikilinks` and
  rendered via `renderLinkTokens` under `src/atlas/content/`; the entity body HTML is injected in
  `src/atlas/entity/EntityPanel.tsx`. Note: components are **not** mounted inside that injected HTML — a
  `useEffect` that finds the rendered link nodes and attaches behavior is the working pattern (the secrets
  session confirmed this). Hover-peek for **pins** hooks the Leaflet pin layer instead (`src/pages/AtlasViewer.tsx`).
- **Player-safe summary data** already exists per entity (the redaction in `projectEntityForPlayer.ts`); the
  hover card should read the same summary/type/image already in `atlas.json` — **no network fetch needed**.
- **Search index** (for "fly to / discovery"): `public/atlas/search-index.json`.
- **Persistence pattern** (for wander's "unseen/visited" set + the discovery meter): mirror
  `src/atlas/notes/playerNotes.ts` (localStorage key like `atlas-player-notes-v1`, `getStorage()` probe,
  try/catch). A "visited places" store would use the same shape.
- **Deep-links** already encode pan/open in query params and survive the static host — wander can reuse them to
  "land" the player on a place with working Back.
- **Pins / placements** are typed in `src/atlas/content/schema.ts` (`MapPlacement`).
- **Tests:** Vitest; shard to avoid OOM (`--shard=N/4 --poolOptions.forks.maxForks=3`).

## Design questions to resolve in the session (with the DM)

**Hover-peek:**
1. **What the card shows** — portrait/first image? one-line summary? type badge? a connection count? Keep it
   small and instant.
2. **Interaction** — hover delay before it appears; how it dismisses; **mobile press-and-hold**; avoid covering
   the text you're reading; what happens on nested links; keyboard/focus accessibility.
3. **Where it applies** — wikilinks in prose, "Connections" entries, **and pins on the map**? Decide the
   surfaces for v1.
4. **Performance** — data is already in `atlas.json`; no fetch. Confirm no jank on dense pages.

**Wander:**
5. **What counts as "discovered"** — opened the entity? visited its pin? Define it, and store it in
   localStorage (same pattern as a footprints trail).
6. **"Near where they've been"** — graph distance from the visited set? same map/region? purely random among
   unseen? Pick a model that feels like exploration, not teleporting.
7. **The discovery meter** — "X of Y" over which Y (all player-visible places? a chosen type)? Where does the
   button live? What's the landing animation (reuse the existing fly-to)?
8. **Edge cases** — everything already discovered; brand-new player with empty history; a world with very few
   places.

**Both:** decide whether hover-peek + wander (+ optionally footprints/what's-new) form **one** coherent
"navigation" spec or stay separate. Keep scope tight — the DM picked these two; only fold in neighbours if the
synergy is cheap.

## Process to follow (this worked well for the secrets feature)

1. Use the **brainstorming skill**; one question at a time; offer mockups for the card/meter visuals.
2. **Ground every claim in the real code** before committing the spec — dispatch an Explore agent over the
   wikilink render path, the Leaflet pin layer, the player-summary projection, the search index, and the
   localStorage pattern.
3. Write the spec to `docs/superpowers/specs/2026-06-17-browsing-feel-design.md`; commit.
4. Run an **adversarial review** (a Workflow / parallel subagents reading the real code) focused on: the
   hover-card mount mechanism actually working in the static build, mobile interaction, accessibility, the
   wander "unseen" model, and that no DM-only entity can surface. Fix blockers.
5. Hand the spec to the DM to review, then invoke **writing-plans** for the implementation plan.

## Pointers

- Full idea menu (this theme + the others): `docs/DEVELOPMENT_WANTS.md` (2026-06-17 section).
- North star + what's shipped: `docs/superpowers/specs/2026-06-15-atlas-roadmap-design.md`.
- Sibling feature specced this session (quality bar only, don't rebuild):
  `docs/superpowers/specs/2026-06-17-player-secrets-design.md`.

## Kickoff prompt to paste into the fresh session

> Read `docs/superpowers/specs/2026-06-17-browsing-feel-brief.md` and run it. Design the browsing-feel
> upgrades — **hover-peek cards** and the **wander button** — for the player site. Brainstorm with me first
> (I'm the DM — plain language, sleek UX), ground the design in the real code before committing, write the
> spec, run an adversarial review, then a plan. Don't write feature code until I approve the spec.
