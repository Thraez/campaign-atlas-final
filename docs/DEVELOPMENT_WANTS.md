# Development wants — ranked backlog

**Last updated:** 2026-06-15
**What this is:** the master, human-facing list of everything we want to do to the atlas — bugs, daily-friction fixes, polish, bigger features, and known non-goals — ranked by impact against effort. It is broader than the hourly routine's backlog: `docs/automation/continuous-dev-queue.md` (operational, auto-built) and `docs/automation/continuous-dev-roadmap.md` (policy) are the *blessed subset* the routine works from. This doc is where ideas land first; blessed items graduate into the queue.

Many items below came from a live dogfooding pass on 2026-05-30 (walking the player viewer and the DM editor end to end). Those are marked **🆕 dogfooding**.

> **📍 Reality update — 2026-06-15.** Most of Tiers 1–3 below have **shipped** (v0.1.0 → v0.3.0): the crash
> guard + error boundary, proper-case names, snippet casing, accessibility labels, editor-works-on-first-run,
> categorize-imports, the import report, honest player preview, phrase search, pin de-cluttering, richer
> markdown, and the dropped-image / broken-link *flags*. The genuinely-open work has been sequenced into a real
> plan — see **`docs/superpowers/specs/2026-06-15-atlas-roadmap-design.md`**. The blessed, build-ready subset is
> queued in `docs/automation/continuous-dev-queue.md` (section **I** = I1–I4 Connections · ruler · deep-links ·
> README; design-gated **N3 / N25 / N26** = asset credits · render image embeds · render planned-links). The
> three lead big-bets now have briefs: Obsidian read-only merge, one-click Publish, relationship graph. Treat
> the tiers below as the idea inbox; the roadmap doc is the current source of sequencing.

## How to read the ranking

- **Impact** = how much it improves the experience of building or sharing a world. High / Med / Low.
- **Effort** = rough build size. **S** ≈ one sitting · **M** ≈ a focused day or two · **L** ≈ multi-session, needs a design first.
- Tiers are ordered for *sequencing*, not importance alone: Tier 1 is "do these first because they're cheap and clearly right."

---

## Tier 1 — Now (high impact, low effort)

These are clearly right, bounded, and low-risk. Best first picks.

1. **Stop the app from blank-screening.** *(🆕 dogfooding · Impact: High · Effort: S)*
   Selecting an **Event** (or any entry with no map location) in search crashes the *entire* app to a white page — the map tries to fly to a location that doesn't exist and throws, and there's no safety net to contain it. Two parts:
   - Guard the "fly to" so a location-less entry just opens its lore (no map move) instead of throwing.
   - Add a **React error boundary** so that *no* single component error can ever blank the whole site — players see a graceful "couldn't load that" instead of nothing.
   - *Where it maps:* new WANT (correctness/safety — top of the list).

2. **Proper-case entity names.** *(🆕 dogfooding · Impact: Med · Effort: S)*
   Names display as lowercase file-slugs — "corven", "edric", "soreth" — in search results, the reading-panel title, and likely pins. It looks unfinished, especially to players. Derive the display title from the page's own H1, an explicit title field, or a title-cased slug.
   - *Where it maps:* new WANT (display polish).

3. **Show original casing in search snippets.** *(🆕 dogfooding · Impact: Low · Effort: S)*
   Result snippets render all-lowercase ("survivors founded the great cities of thornhold…") because the normalized search index is being shown directly. Keep a parallel original-case copy for display.
   - *Where it maps:* new WANT (display polish) — natural sibling of #2.

4. **Fix the CSS import-order warning.** *(🆕 dogfooding · Impact: Low · Effort: S)*
   `leaflet.css` is `@import`ed after the Tailwind directives in `src/index.css`, which the build warns about on every start. Move the import above the directives.
   - *Where it maps:* hygiene nibble.

---

## Tier 2 — Next (high impact, medium effort)

The biggest wins for your day-to-day, each needing a small design choice.

5. **The editor should just work on first run.** *(🆕 dogfooding · Impact: High · Effort: M)*
   On a fresh checkout the dev server serves the *player* atlas, so the editor opens degraded: a scary "**Save won't work — run `npm run atlas:build` in your terminal**" banner, and the content tabs look empty. A DM shouldn't have to touch the terminal. Options: a `predev` step that builds the DM atlas automatically, or the editor detecting the player atlas and offering a one-click "Build DM data now."
   - *Where it maps:* WANT, but it touches the dev/build wiring — write a short spec first.

6. **Imported notes shouldn't go invisible.** *(🆕 dogfooding · Impact: High · Effort: M)*
   NPCs imported from the vault (corven, edric, soreth) sit in an `imports/` folder and don't appear under **Characters** — or any type tab — so the editor looks empty even when you have content. Either the import flow assigns a type as it brings notes in, or the type tabs surface an "Uncategorized / Imported" group with a one-click "file this as a Character / Location / …". Closely related to the queued import folder-mapping work (item B in the queue).
   - *Where it maps:* NICE-TO-HAVE (needs a small design) — sequence near queue item B.

7. **Stop dropping inline portraits.** *(🆕 dogfooding · Impact: Med · Effort: M)*
   Obsidian image embeds (`![[Corven.png]]`) silently vanish in the reading view — no picture, no warning — so corven shows no portrait at all. Either render `![[image]]` embeds from the vault, or, at minimum, flag every dropped embed in Publish Check so you know to add it as an explicit image instead.
   - *Where it maps:* NICE-TO-HAVE (render) or WANT (the cheaper "flag it in Publish Check" half).

8. **An honest "what will players see" preview.** *(🆕 dogfooding · Impact: Med · Effort: M)*
   The local viewer shows your secret DM Notes (because dev serves the DM data), so you can't actually preview the redacted player experience before sharing. A one-click "Preview as player" that applies the *real* redaction (strips `%%…%%` notes, DM-only entities, hidden pins) would let you trust what you publish. Verify first whether the editor's existing "Player view" toggle already redacts bodies or only hides pins.
   - *Where it maps:* NICE-TO-HAVE (design-check first).

9. **Make planned/broken wikilinks visible.** *(🆕 dogfooding · Impact: Med · Effort: M)*
   Wikilinks to not-yet-written or path-style targets (`[[02_Regions/Tidemarrow]]`, `[[Note#Heading]]`) render as plain text with no hint they were ever links. Style them as "planned link" and list them in Publish Check so you can see your world's loose threads. Overlaps the already-identified heading-anchor gap (the highest-value remaining markdown gap per the parity audit).
   - *Where it maps:* fold into the queued markdown work (item C) + Publish Check.

---

## Tier 3 — Already blessed and queued (build subset)

These are already sequenced in `docs/automation/continuous-dev-queue.md`. Listed here for one complete picture.

- **Faster publishing** — collapse the build-time safety scans into one parallel pass (scan phase ~6.5s → ~1s). *(Queue item A)*
- **Import folder-mapping fixes + tests** — a real bug in the import "select-all overwrites" control, type list derived from config, plus missing tests. *(Queue item B — pairs with #6 above)*
- **Richer markdown** — highlights (`==text==`), footnotes, read-only task-lists, at full player/DM parity. *(Queue item C — pairs with #9 above)*

---

## Tier 4 — Nice-to-haves (bounded, design-check first)

- **Phrase search** (`"exact phrase"`) in the player search. *(Impact: Med · Effort: S–M)*
- **Pin de-cluttering** on crowded maps, using the existing pin-priority field to thin labels. *(Impact: Med · Effort: M)*
- **Asset credits** — a license field on images plus an auto-generated credits page. *(Impact: Low · Effort: M)*
- **Clearer import report** — a readable "what came in / what was skipped" summary after an import. *(Impact: Med · Effort: S)*
- **Accessibility labels** *(🆕 dogfooding)* — the map-layer-switcher and pin buttons have icons but no accessible names. *(Impact: Low · Effort: S)*
- **Docs drift cleanup** *(🆕 dogfooding)* — the README describes editor tabs (Maps/Import) that don't match the live rail (Characters/Locations/Factions/Events/Items/Lore/Pins/Regions/Routes/Fog/Save/Publish). *(Impact: Low · Effort: S)*

---

## Tier 5 — Big bets (need your direction; design before any code)

Each is a real architecture or surface decision — handled human-first, never auto-built.

- **DM-editor overhaul, Parts 2–4** — state safety, information architecture, polish. The panel structure shifted under the original plans, so it needs a re-strategy call.
- **Vault as the live source** — edit in Obsidian, atlas follows. Highest upside *and* highest risk to your own files; its own brainstorm.
- **Map tiling / per-map chunking** — for very large or numerous maps. *(🆕 dogfooding corroboration: all six map images currently load eagerly up front — same root cause.)*
- **Relationship graph view** — a visual web of who connects to whom.
- **Published progressive fog** — fog that reveals as the campaign advances, in the player build.

---

## Added 2026-06-15 — from a feature brainstorm

A human-directed feature ideation pass. Four openings surfaced (verified against the live code, so each is a
real gap, not something already shipped). **#1 is in progress now** (spec being written); #2–#4 are parked
here so they aren't lost.

- **Show authored relationships on the entity page** *(added 2026-06-15 · Impact: High · Effort: S)* —
  **in progress.** `entity.relationships[]` is authored + saved in the editor (and even visibility-tagged per
  link), but is **never displayed** in the reading panel — player or DM. Surface it as a small "Connections"
  list beneath the existing "Mentioned in" backlinks, honoring each relationship's own visibility. Distinct
  from the Tier-5 relationship-graph view — this is pure display of data that already exists.

- **One-click Publish from the editor** *(added 2026-06-15 · Impact: High · Effort: M–L, design-first)* —
  Today, getting changes onto the player site means a terminal command (`npm run atlas:publish`) and/or a push
  in GitHub Desktop. A single **Publish** button in the editor that runs the build + safety scans + push, then
  confirms "your players can see it now." Best fit for the sleek / hide-the-internals preference. Needs a short
  design first (likely a local editor endpoint, same channel as Save) — do not auto-build.

- **Live shareable links** *(added 2026-06-15 · Impact: Med · Effort: S)* — the URL should follow the player
  as they pan and open places (not just the first entry opened), so a shared link lands on the exact spot and
  browser Back works. **GitHub Pages confirmed fine:** the existing `?entity=` share link already proves
  query-param state works on the static site; we keep using query params, which avoid the SPA-refresh 404 that
  only affects path-style routes.

- **Map distance ruler** *(added 2026-06-15 · Impact: Med · Effort: S–M)* — click two points on a map to
  measure distance in world units via the existing `MapScale`. A tape measure for players; explicitly **not**
  the "travel-time crunch beyond route speed" non-goal (no weather/mount calculators — just distance).

---

## Off the table (non-goals — for reference)

Combat tracker / initiative · AI-generated lore · multi-user or real-time collaboration · light/parchment theme toggle · mobile or touch editor · per-party fog variants · fuzzy search. See `docs/NON_GOALS.md`.

---

## Proposed placement into the build queue

A compact summary of where the **🆕 new** items should graduate, once blessed:

| Item | Proposed queue home | Gate |
|------|--------------------|------|
| #1 Crash guard + error boundary | WANT (top) | none — clear correctness fix |
| #2 Proper-case names | WANT | none |
| #3 Search snippet casing | WANT | none |
| #4 CSS import order | Hygiene nibble | none |
| #5 Editor works on first run | WANT | short spec (touches build wiring) |
| #6 Categorize imported notes | NICE-TO-HAVE | design-check (pairs with B) |
| #7 Image embeds | NICE-TO-HAVE / WANT | render = design; "flag only" = WANT |
| #8 Honest player preview | NICE-TO-HAVE | design-check |
| #9 Planned/broken wikilinks | fold into C + Publish Check | design slice |

Until you've reviewed this, the new items are parked in the queue's **Inbox** section (not the auto-built WANTS).

---

## Added 2026-06-17 — "make it a great website" idea panel

A human-directed divergent ideation pass (6 lenses + a dedicated player-secrets design pass, synthesized).
Grounded against shipped reality and `NON_GOALS.md`, so each item is genuinely new and **static-site-safe**
(works on GitHub Pages, no backend). Source: this session's idea panel.

**▶ Selected to design next (DM's pick, in order):**
1. **Player secrets** — Whisper → Sealed Letter (the flagship; see design below). *Brainstorm started 2026-06-17.*
2. **Atmosphere** — per-map weather + ambient soundscape.
3. **Browsing feel** — hover-peek cards + wander button.

The rest below are the captured idea inbox (not yet sequenced).

### 🔐 Player secrets — "content meant for your character" (FLAGSHIP, design in progress)

Four flavors, split by *hidden* vs *truly locked*. **Honest rule:** anything that would ruin the campaign if
peeked early MUST use the locked kind (real encryption); the hidden kind is for delight, not real spoilers.

| Flavor | Effort | What it is | Real security? |
|---|---|---|---|
| **Whisper Cards** | S | Player types their character's name on a page → a card unfurls a line meant for them. Wrong words shimmer & refuse. | ❌ Hidden only (readable in the page source) |
| **Character Dossier links** | M | Each player gets a private bookmark (`?as=vesper`); personal "for your eyes" lines appear woven into pages, no typing. | ❌ Hidden only |
| **Sealed Letter** | M | Wax-sealed passphrase box; secret ships as scrambled gibberish, passphrase unscrambles it in-browser (Web Crypto AES-GCM). Wrong phrase reveals *nothing*. | ✅ Genuinely locked |
| **Per-Character Keys** | L | Same real encryption, one key per player → unlocks *their own* secrets across the whole atlas. The full "password for your character" dream. | ✅ Genuinely locked, per-player |

**Recommended build order:** Whisper Cards (wow, fast) → Sealed Letter (real security; lays the crypto plumbing) → Per-Character Keys (full realization).

**DM's refinements (2026-06-17):** secrets should weave *inline into prose* and attach to *pins* (not just standalone cards); the trigger is a **❓/question box you click to open a password field**; and there should be a **per-character "everything your character knows" tab** collecting that player's secrets. → points at the locked / Per-Character-Keys end, scoped carefully. *This is the active brainstorm.*

### 🗺️ Other themes (idea inbox)

**A world you step into (atmosphere)** — 🌟 per-map weather (mist/snow/heat-shimmer, reuses ocean engine, M) · time-of-day mood wash (M) · 🌟 ambient soundscape w/ one mute (M) · living map flourishes (drifting clouds, inked sea-serpent, M) · in-world cover page (S).

> **DM requirement for the soundscape (2026-06-17):** sound must be **zoom- and location-aware** — a sound bed activates only when zoomed deep into a *specific* area, and changes behavior across zoom levels (overview = quiet/none; harbor at high zoom = gulls; caverns = drips). NOT one flat loop per map. Treat browser autoplay policy + performance as first-class design risks.

**Lore reads like a found artifact** — illuminated-manuscript reading pane (drop caps, parchment, S) · 🌟 in-world document props (letters/ledgers/songs as aged props w/ wax seals, M) · quill reveal on open (S).

**Joyful wayfinding** — ⭐ hover-peek cards (preview before clicking, M) · region doorways (shimmer + zoom-through to next map, M) · ⭐ wander button (random unseen place + discovery meter, S) · footprints / what's-new (M) · search that flies the map to a place (M) · 🌟 constellation view (star-chart of connections; sharpens roadmap graph, L).

**World reveals itself as the campaign moves** — ⭐ reveal beats (tag content w/ a story beat, flip to revealed at publish, build-time gated, M) · living rumor board (rumors → proven false / confirmed, M) · factions standings board (allied/wary/at-war grid w/ dates, M) · player codex (auto "what you've uncovered," M) · timeline eras + known-so-far cutoff (S).

**At the table & sharing** — present mode (full-screen reveal for the table, M) · ⭐ QR + share card for any view (S) · auto social-share cards (Discord link unfurls, M) · mobile player viewer (view-only, L) · session recap pages (DM-written, L) · printable table pack / bound gazetteer (M).

**Premium polish** — 🌟 per-region theming (site recolors as you travel, M) · cinematic first-load (M) · one shared motion language (M) · large-world performance pass (M).

*(⭐ = best impact-per-effort · 🌟 = highest wow · S = one sitting · M = a day or two · L = multi-session, design-first)*

### Gaps the panel flagged (worth a future idea)

- No single **"calm / plain mode"** master switch to strip weather + sound + motion + washes at once (matters once atmosphere lands; beyond per-feature reduced-motion).
- No **entity media richness** — image galleries, captioned art, name-pronunciation audio, hero-art lightbox.
- No lightweight **player-side private bookmarks / "my places"** shortlist (local-only, distinct from the server-notes non-goal).
- No **reading ergonomics** for long lore — dyslexia-friendly font toggle, reading-width control.
- No DM **"health check"** surface — pre-publish view of broken links, art-less entities, orphaned notes.

### Cut for collision (recorded so we don't re-pitch)

Diegetic login screen (folded into Sealed Letter theater) · Konami-code easter egg (flavor footnote only) · blacklight hidden-ink map layer (overlaps reveal-beats / secrets crypto) · Loremaster's cipher ARG (far-future extension of the secrets crypto) · breadcrumb chip row (redundant with deep-links + footprints) · pinned "open tonight" tray (folded into Present Mode).
