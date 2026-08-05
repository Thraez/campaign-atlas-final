# Development wants — ranked backlog

**Last updated:** 2026-08-06
**What this is:** the master, human-facing list of everything we want to do to the atlas — bugs, daily-friction fixes, polish, bigger features, and known non-goals. It is broader than the hourly routine's backlog: `docs/automation/continuous-dev-queue.md` (operational, auto-built) and `docs/automation/continuous-dev-roadmap.md` (policy) are the *blessed subset* the routine works from. This doc is where ideas land first; blessed items graduate into the queue.

> **📍 Reality update — 2026-08-06.** **Tiers 1–4 are empty: every item in them shipped.** They had been
> sitting here fully drained since roughly 2026-06-15, which made this doc read as a live backlog when it
> was really an archive. They have been collapsed into the "Shipped" record below. What genuinely remains
> is the **Big bets** section (all human-first, all on the routine's HAND-BACK list) and the **2026-06-17
> idea inbox**, which is now marked up with what has since been built.

## How to read the ranking

- **Impact** = how much it improves the experience of building or sharing a world. High / Med / Low.
- **Effort** = rough build size. **S** ≈ one sitting · **M** ≈ a focused day or two · **L** ≈ multi-session, needs a design first.

---

## ✅ Shipped — the drained tiers (kept as a record only)

Everything below is done. Nothing here is promotable.

**Tier 1 (dogfooding, 2026-05-30):** crash guard + React error boundary · proper-case entity names ·
original casing in search snippets · CSS `@import` order fix.

**Tier 2 (dogfooding, 2026-05-30):** editor works on first run · imported notes get categorized · inline
Obsidian image embeds render · honest "what will players see" preview · planned/broken wikilinks are
visible.

**Tier 3 (the founding queue items):** faster publishing (parallel scan pass) · import folder-mapping
fixes + tests · richer markdown (highlights, footnotes, task-lists).

**Tier 4 (design-gated nice-to-haves):** phrase search · pin de-cluttering · asset credits · clearer
import report · accessibility labels · docs-drift cleanup.

**2026-06-15 brainstorm:** Connections list on the entity page · one-click Publish from the editor ·
live shareable links · map distance ruler.

*(The old "Proposed placement into the build queue" table went with them — every row had graduated.)*

---

## 🎯 Big bets — need your direction; design before any code

Each is a real architecture or surface decision, handled human-first and **never auto-built**. These are
the routine's HAND-BACK list, and they are the only substantial open work left in the project.

- **DM-editor overhaul, Parts 2–4** — state safety, information architecture, polish. The panel structure
  shifted under the original plans, so it needs a re-strategy call before any code.
- **Vault as the live source** — edit in Obsidian, atlas follows. Highest upside *and* highest risk to your
  own files. The *bounded* slices shipped in Aug 2026 (change detection, image embeds, folder-scoped
  browsing); the architecture fork itself is still open and still human-only.
- **Map tiling / per-map chunking** — for very large or numerous maps. All six map images still load
  eagerly up front.
- **Relationship graph view** — a visual web of who connects to whom. (Distinct from the shipped
  Connections *list*, which is plain display of `entity.relationships[]`.)
- **Published progressive fog** — fog that reveals as the campaign advances, in the player build.

---

## 💡 Idea inbox — 2026-06-17 "make it a great website" panel

A human-directed divergent ideation pass, grounded against `NON_GOALS.md` and static-site-safe (works on
GitHub Pages, no backend). **Annotated 2026-08-06 with what has since shipped.**

**Already built out of this panel:** player secrets (sealed reveals + per-character keys —
`src/atlas/secrets/`) · ambient soundscape with a mute and a calm-mode switch (`src/atlas/sound/`) ·
hover-peek cards (`src/atlas/peek/HoverPeekCard.tsx`) · wander button + discovery meter
(`src/atlas/wander/`).

**Still open (nothing below is in any build queue):**

**A world you step into (atmosphere)** — 🌟 per-map weather (mist/snow/heat-shimmer, reuses the ocean
engine, M) · time-of-day mood wash (M) · living map flourishes (drifting clouds, inked sea-serpent, M) ·
in-world cover page (S).

**Lore reads like a found artifact** — illuminated-manuscript reading pane (drop caps, parchment, S) ·
🌟 in-world document props (letters/ledgers/songs as aged props with wax seals, M) · quill reveal on open (S).

**Joyful wayfinding** — region doorways (shimmer + zoom-through to the next map, M) · footprints /
what's-new (M) · search that flies the map to a place (M) · 🌟 constellation view (star-chart of
connections — sharpens the relationship-graph big bet, L).

**World reveals itself as the campaign moves** — ⭐ reveal beats (tag content with a story beat, flip to
revealed at publish, build-time gated, M) · living rumor board (rumors → proven false / confirmed, M) ·
factions standings board (allied/wary/at-war grid with dates, M) · player codex (auto "what you've
uncovered," M) · timeline eras + known-so-far cutoff (S).

**At the table & sharing** — present mode (full-screen reveal for the table, M) · ⭐ QR + share card for
any view (S) · auto social-share cards (Discord link unfurls, M) · mobile player viewer (view-only, L) ·
session recap pages (DM-written, L) · printable table pack / bound gazetteer (M).

**Premium polish** — 🌟 per-region theming (site recolors as you travel, M) · cinematic first-load (M) ·
one shared motion language (M) · large-world performance pass (M).

*(⭐ = best impact-per-effort · 🌟 = highest wow · S = one sitting · M = a day or two · L = multi-session, design-first)*

### Gaps the panel flagged (worth a future idea)

- No **entity media richness** — image galleries, captioned art, name-pronunciation audio, hero-art lightbox.
- No lightweight **player-side private bookmarks / "my places"** shortlist (local-only, distinct from the server-notes non-goal).
- No **reading ergonomics** for long lore — dyslexia-friendly font toggle, reading-width control.
- No DM **"health check"** surface — pre-publish view of broken links, art-less entities, orphaned notes.

*(The "calm / plain mode" master switch the panel flagged has since shipped as calm mode in the sound
controls, though it currently governs audio rather than every atmosphere effect at once.)*

### Cut for collision (recorded so we don't re-pitch)

Diegetic login screen (folded into Sealed Letter theater) · Konami-code easter egg (flavor footnote only) · blacklight hidden-ink map layer (overlaps reveal-beats / secrets crypto) · Loremaster's cipher ARG (far-future extension of the secrets crypto) · breadcrumb chip row (redundant with deep-links + footprints) · pinned "open tonight" tray (folded into Present Mode).

---

## ⚠️ How this doc goes stale, and how to stop it

Tiers 1–4 stayed here as an apparently-live backlog for ~7 weeks after the last of them shipped. The fix
is a habit, not a process: **when a unit lands in `continuous-dev-done.md`, strike it from this doc in the
same pass.** If a whole section empties, collapse it into the Shipped record rather than leaving the
headings behind.

The deeper gap this doc reveals: **almost everything here dated 2026-05-30 came from actually using the
app, and nothing since has.** Every backlog refuel after that date was produced by reading code. That is
why the reserve drained into micro-polish. The most valuable thing that can be added to this file is
another dogfooding pass, not another ideation sweep.

---

## Off the table (non-goals — for reference)

Combat tracker / initiative · AI-generated lore · multi-user or real-time collaboration · light/parchment theme toggle · mobile or touch editor · per-party fog variants · fuzzy search. See `docs/NON_GOALS.md`.
