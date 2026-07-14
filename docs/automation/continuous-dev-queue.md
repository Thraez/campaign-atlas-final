# Continuous-development task queue

**Created:** 2026-05-29
**Read by:** the hourly routine (`continuous-dev-routine.md`) — this is the sequenced backlog.
**Policy lives elsewhere:** `continuous-dev-roadmap.md` holds the guardrails (HAND-BACK / NEVER lists,
the design-check). This file holds the *poppable, ordered units* the routine works through.

## How the routine uses this queue

1. Take the **top unit not marked `✅ DONE`** in the WANTS section.
2. Confirm it's still valid (the spec it cites hasn't been overtaken). For a NICE-TO-HAVE, run the
   design-check first.
3. Build it, pass the full gate, merge into `auto/continuous-dev`.
4. **Mark the unit `✅ DONE`** here — append the date + commit hash — and include that edit in the merge,
   so the next run sees accurate progress.
5. When **every WANT unit is `✅ DONE`** → you've hit the **REFUEL POINT** (below). Do not invent new
   wants. Either take a design-passed nice-to-have or hand back to the human.

Each WANT unit cites its authoritative spec/plan — **read that in full** before building; the summary here
is for sequencing, not the whole spec.

**Honest ceiling:** this queue specifies ~7–8 certain WANT runs + ~6 design-gated nice-to-have runs.
Beyond that the routine asks the human to bless more work. That is by design — see "After the queue empties."

---

## ✅ WANTS — sequenced, blessed (build in this order)

> **Refueled 2026-07-14** — section **Q** below (100-task QoL / feature / infra / refactor backlog,
> Q1–Q100) blessed by the DM: this is the **current priority** — build **Q1 first, then in order**.
> Each unit is self-contained and independently shippable; all prior sections (P, M, J, K, L, I, H, G,
> F, E, D, A, B, C) are ✅ DONE. See section **Q**'s own banner for the guardrail recap.
>
> **Refueled 2026-06-20** — section **P** below blessed by the DM: **P1 Player Secrets** is the
> **current priority** (M-series and all prior sections are ✅ DONE). Design:
> `docs/superpowers/specs/2026-06-17-player-secrets-design.md`; Plan:
> `docs/superpowers/plans/2026-06-17-player-secrets.md` — **read both in full before each phase.**
>
> **Refueled 2026-06-18** — section **M** below blessed by the DM from a design session
> (brainstorm → spec → adversarial review → plan): **M1 Joyful wayfinding** (hover-peek cards + wander
> button) is the **current priority** (L-series remains queued below it). Design:
> `docs/superpowers/specs/2026-06-17-browsing-feel-design.md`; Plan:
> `docs/superpowers/plans/2026-06-17-wayfinding.md` — **read both in full before each phase.** Wander
> (plan Tasks 1–8) is independently shippable and ships first; hover-peek follows.
>
> **Refueled 2026-06-17** — section **L** below blessed by the human: **L1 Asset credits — corner badge +
> credits page (DM-toggled)**. This is the **current priority** (K-series is ✅ DONE). Design:
> `docs/superpowers/specs/2026-06-17-asset-credits-badge-and-page-design.md` — **read in full first.** It
> supersedes the page-only N3 spec and folds N3 in. Two increments: ship Increment 1 (data + badge + page,
> driven by `world.yaml`) before Increment 2 (the in-editor toggle UI).
>
> **Refueled 2026-06-16 (round 2)** — section **K** below blessed by the human: **K1 Sync from Obsidian**
> (read-only merge, 5 phases). Design: `docs/superpowers/specs/2026-06-16-obsidian-readonly-merge-design.md`;
> Plan: `docs/superpowers/plans/2026-06-16-obsidian-readonly-merge.md` — **read both in full before each phase.**
> Phase 1 (merge engine + secrecy core) is ✅ DONE. Phases 2–5 follow in subsequent runs. J-series is ✅ DONE.
>
> **Refueled 2026-06-16** — section **J** below blessed by the human: **J1 One-click Publish** is the
> current priority. Design: `docs/superpowers/specs/2026-06-16-one-click-publish-design.md`; Plan:
> `docs/superpowers/plans/2026-06-16-one-click-publish.md` — **read both in full before starting.**
> I-series (I1–I4) and N25–N26 are ✅ DONE.
>
> **Refueled 2026-06-15 (round 2)** — section **I** below blessed by the human from a roadmap brainstorm:
> build **I1 → I4** in order (Connections · distance ruler · shareable deep-links · README-rail fix). Each
> cites its own spec under `docs/superpowers/specs/2026-06-15-*-design.md` — **read in full first.** H-series
> and all prior sections are ✅ DONE. After I1–I4, the design-gated nice-to-haves **N3 / N25 / N26** (asset
> credits · render image embeds · render planned-links) each need the design-check before building.
>
> **Refueled 2026-06-15** — section **H** below (animated ocean / "living water") blessed by the human:
> build **H1 → H2**. Spec: `docs/superpowers/specs/2026-06-15-animated-ocean-background-design.md`. This is
> the **current priority** (G-series is ✅ DONE).
>
> **Refueled 2026-06-14 (round 2)** — section **G** below blessed by the human: **G1 Honest player preview**
> is the current priority — build it next. Spec:
> `docs/superpowers/specs/2026-06-14-honest-player-preview-design.md` (**read in full first**). Section **F**
> (F1–F3) is ✅ DONE and consolidated to `main` as **v0.2.0** (merge `258027b3`, tag `v0.2.0`).
> F1 categorize-imports · F2 distinct-entity publish counts · F3 pin label de-cluttering.
>
> **Refueled 2026-05-31** — section **E** (6 units) was blessed from the ranked inbox in
> `docs/DEVELOPMENT_WANTS.md`. **E is now ✅ DONE** (E1 merged to main `a7f22fbc`; E2–E6 on
> `auto/continuous-dev`, then consolidated to main in the v0.1.0 merge 2026-06-14). Sections D, A, B, C are
> all ✅ DONE.

### Q — Refuel 2026-07-14 (100-task QoL / feature / infra / refactor backlog — blessed by the DM)

> DM-directed refuel: a broad, grounded backlog of **100 bite-sized units** (Q1–Q100), each
> self-contained and independently shippable, grouped into 13 themes (Q-A…Q-M). Every unit was
> derived from a read of the real code (file/line grounding preserved) and checked against the
> NEVER / HAND-BACK / non-goal lists, so each has already passed the design-check — **build them in
> order, one per run.** They are independent: if a unit turns out stale (the cited code moved) or
> its premise is false, skip it, mark it `~ SKIPPED (reason)`, and take the next. Most are 1 run;
> some are 2–3. Nothing here is a multi-phase feature. When Q1–Q100 are all `✅ DONE`, hand back.
>
> Guardrails still bind (`continuous-dev-roadmap.md` + `docs/NON_GOALS.md` + `docs/MARKDOWN_PARITY.md`):
> no combat/rules, AI lore, multi-user/auth, theme toggle, mobile editor, per-party fog, fuzzy
> search, map tiling, GIS canvas, relationship-graph, progressive-fog, math/mermaid/#tag-pills/
> transclusion/block-ref. Player-facing units must stay DM-secret-free (operate on already-projected
> player data only). Units touching the build pipeline / scans / fog / artifacts carry an explicit
> `atlas:publish` (+ `integrity-smoke` for fog/scan) gate in their entry — honor it.


#### Q-A — Player map & wayfinding

- [ ] **Q1. Highlight the currently-open entity's pin on the map.**
  Thread the open entity's id (`openId` state, `AtlasViewer.tsx:152`) down through `WrappedWorld` (rendered at ~`:669`) into `PlacementMarkers` (`:997`), and when `p.entityId === openId` pass an `"atlas-viewer-pin--active"` extraClass into `pinIconForStyle` (`:83`, which merges extraClass into the DivIcon className). Add an `.atlas-viewer-pin--active` ring/glow rule in `src/index.css` next to the `.atlas-viewer-pin` block (`:69`). Do NOT reuse `pinSvg`'s `pulse` option (`src/atlas/pins/presets.ts:311`): its `atlas-pulse` keyframe is defined only inside `AtlasPlacementEditor.tsx:1971` and is tree-shaken out of player builds, so it would be inert for players — define the ring (and any keyframe) in `index.css`, which ships to players.
  - **Done when:** opening a place via search/wander/deep-link visibly rings that entity's marker(s) on the active map, clearing selection removes the ring, and it renders in the player build (no reliance on editor-only CSS).
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing: operate only on already-projected player data; ring must not rely on `__INCLUDE_EDITOR__`-gated CSS.
  ~2–3 runs.

- [ ] **Q2. Fit map to bounds on load + on map switch, plus a Reset-view button.**
  `MapContainer`'s `center`/`zoom` (`AtlasViewer.tsx:635-636`, `zoom={-2}` hardcoded) apply only at mount, so switching maps via the header `Select` (`:538`) keeps the previous viewport — often off-screen for a differently-sized map. Add a small `useMap` controller (mirroring `MapController` at `:100`) with an effect keyed on `activeMap.id` that calls `map.fitBounds([[0,0],[activeMap.height, activeMap.width]])`, plus a map-corner "Reset view" button that re-fits on demand. The mount effect (`:246-267`) sets `flyTarget` from a `?center`/`?entity` deep link — skip the auto-fit while a deep-link/`flyTarget` is pending for that map so shared views still land; only auto-fit on genuine map switches (and manual reset).
  - **Done when:** switching between differently-sized maps reframes to fit each map's extent, a Reset-view button re-fits on click, and deep-linked shared viewports still open where shared.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Bounds cross into Leaflet, so preserve lat = height − y, lng = x (full extent = `[[0,0],[height,width]]`). Uses stock Leaflet `fitBounds` only (no tiling/chunking).
  ~2–3 runs.

- [ ] **Q3. Add a dynamic scale bar overlay driven by `map.scale`.**
  `MapScale` (`unitsPerPixel` + `unitLabel`, `src/atlas/content/schema.ts:133`) is today consumed only by the ruler (`measureDistance`) and route tooltips (`AtlasViewer.tsx:927-930`). Add a persistent bottom-corner scale bar (Leaflet-`L.control.scale`-style) that recomputes on `zoomend`: measure a fixed screen-pixel span via `map.containerPointToLatLng` on two horizontally-separated container points, multiply the resulting map-pixel delta by `scale.unitsPerPixel`, snap to a nice round number (1/2/5 × 10^n), and render `──── 10 mi` using `scale.unitLabel`. Render nothing when `activeMap.scale` is absent.
  - **Done when:** maps with a `scale` show a live scale bar that updates on zoom and reads a round number + unit label; maps without `scale` render nothing; a unit test covers the 1/2/5×10^n round-number snapping.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Read-only overlay; coords cross into Leaflet so keep lat = height − y, lng = x.
  ~2–3 runs.

- [ ] **Q4. Add a collapsible pin legend for the active map.**
  There is no legend explaining pin shapes/colors. Derive the distinct pin presets present among `placementsOnMap` (`AtlasViewer.tsx:277`) by mapping each placement to `resolvePinStyle(entity.type, p.pin)` (`src/atlas/pins/presets.ts:265`) and deduping by preset `id`; render a small collapsible map-corner legend (default collapsed) listing each present type's `pinSvg` swatch (`presets.ts:304`) + `preset.label`. Reuse `pinSvg` for the swatches so legend and map stay in sync. Pure derivation from existing placements + presets — no new data model, no persisted config.
  - **Done when:** the legend lists exactly the pin types present on the active map with matching glyph + label, defaults to collapsed, and re-derives when the active map changes.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Legend is a named in-scope affordance; keep it a single small toggle with no config and no DM-secret surface (reads only already-projected player placements).
  ~2–3 runs.

- [ ] **Q5. Use the real world name instead of hardcoded "Astrath Atlas".**
  The atlas title is hardcoded as `Astrath Atlas` in `AtlasViewer.tsx:534` and `AtlasNavMenu.tsx:57`, so any DM with a differently-named world sees the wrong header and mobile-nav title. Render `data.project.worlds[0]?.name` instead: add a `worldName` prop to `AtlasNavMenu` (props today are `{ publishedAt, footer, showCredits }` at `:40`) and pass it from every call site that embeds it — `AtlasViewer`, plus `AtlasBrowse` and `AtlasTimeline` (both embed `AtlasNavMenu` per its docstring) — falling back to a generic `"Atlas"` when the name is absent.
  - **Done when:** a world named e.g. "Astrath Deeprealm" shows that name in the header and the mobile nav sheet, a nameless world shows "Atlas", and no "Astrath Atlas" literal remains in the player surfaces.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.

- [ ] **Q6. Constrain panning with `maxBounds` so players can't get lost in the void.**
  `MapContainer` (`AtlasViewer.tsx:633-651`) sets no `maxBounds`, so a player can pan far into empty ocean with no easy way back. Add a `useMap` controller effect keyed on `activeMap.id` that calls `map.setMaxBounds` on the map extent `[[0,0],[activeMap.height, activeMap.width]]` plus a modest padding, with a gentle `maxBoundsViscosity`. Skip the horizontal clamp when `activeMap.wrapX` is true (the world wraps). Ensure deep-link/`flyTo` targets (set via `flyTarget`/`MapController` at `:100-116`) inside the bounds still resolve.
  - **Done when:** players can't pan far past the map edge (bounds gently resist and snap back), `wrapX` maps still scroll horizontally, and deep-linked jumps within the map still land.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Stock Leaflet `maxBounds` (no tiling); bounds cross into Leaflet so preserve lat = height − y, lng = x. Complements Q2 (both add `useMap` controllers keyed on `activeMap.id`).
  ~1 run.

- [ ] **Q7. Fix ruler so a third click starts a fresh measurement (plus active-mode hint).**
  In `src/atlas/ruler/RulerLayer.tsx` the click handler (`:50-57`) returns `prev` unchanged once both `p1` and `p2` exist (`:56`), so measuring a second distance forces the player to toggle the ruler off and back on. Make the third click reset to a fresh `{ p1 }`. While bundling: show a small on-screen hint ("Click two points to measure") while the ruler is active and fewer than two points are placed, and let `Escape` clear the current measurement (the module already has an `onClear` prop and an active→inactive reset effect at `:28-40`).
  - **Done when:** with the ruler active, click→click measures, a third click begins a new measurement without toggling the tool, a hint shows until two points are placed, and Escape clears the current measurement.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Pure ruler-module state (coords already flow through `mapClickToAtlasCoord`, which owns the lat=height−y flip).
  ~1 run.

- [ ] **Q8. Bring hovered pins to the front so they don't hide behind neighbors.**
  Markers in `PlacementMarkers` (`AtlasViewer.tsx:1066-1090`) set `key`/`position`/`icon`/`eventHandlers` but not Leaflet's `riseOnHover`, so in dense clusters a hovered pin and its label can be occluded by adjacent pins/labels. Add `riseOnHover` (and a suitable `riseOffset`) to each `<Marker>` so the pin under the pointer lifts to the top of the marker pane.
  - **Done when:** hovering a pin in a crowded area raises it (and its label) above adjacent markers, with no other behavior change.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.


#### Q-B — Player entity & reading experience

- [ ] **Q9. Surface the player profile block (known_for / visible_traits / rumors) in the reading panel.**
  In `src/atlas/entity/EntityPanel.tsx`, render `entity.profile?.player` as a compact block in the scroll body (near the summary `<p>` around line 386): a "Known for" line (`known_for`), a bulleted "Visible traits" list (`visible_traits`), and a "Rumors" list (`rumors`) — the `PlayerProfile` shape in `src/atlas/profiles/profileTypes.ts`. Render nothing when `profile.player` is absent/empty. Read `profile.player` ONLY; never reference `profile.dm`. Add light styling in `src/index.css` if needed and a unit test in `src/test/entity/EntityPanel.test.tsx` asserting the three fields render and that no `profile.dm` value appears in output.
  - **Done when:** an entity with a populated `profile.player` shows all three sub-sections; an empty/absent profile renders nothing; a test asserts render plus that `profile.dm` data never surfaces.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing: `EntityPanel` always receives an already-projected entity (`projectEntityForPlayer` runs `stripDmProfile`), so operate only on `profile.player` — no DM-secret surface.
  ~2–3 runs.

- [ ] **Q10. Prev/next + keyboard nav + image counter in the entity lightbox.**
  In `src/atlas/entity/EntityPanel.tsx`, change the lightbox state from `{ src, url } | null` (line ~290) to an index into `entity.images` (`number | null`). Add left/right buttons, ArrowLeft/ArrowRight key handling (clamp or wrap), and an "n / total" counter overlay inside the Radix `DialogContent`. Recompute `resolveImageCredit(entity.images[index], assetCredits, entity.credit)` per index so the `CreditBadge` follows the current image. Preserve the existing Escape / click-to-close from the Radix `Dialog`.
  - **Done when:** opening any thumbnail lets the player page through all `entity.images` via buttons and arrow keys, the counter shows position/total, the credit badge tracks the shown image, and Escape still closes; covered by a test in `src/test/entity/EntityPanel.test.tsx`.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.

- [ ] **Q11. Reset the reading-panel scroll to top when the open entity changes.**
  The `ScrollArea` in `src/atlas/entity/EntityPanel.tsx` (line ~384) wraps a Radix viewport that is a persistent DOM node, so navigating from a deep scroll in entity A into entity B (via a Connection, backlink, or wikilink) leaves B scrolled partway down. Add a `useEffect` keyed on `entity.id` that finds the panel's viewport (`[data-radix-scroll-area-viewport]`) and sets `scrollTop = 0` on entity change. `src/components/ui/scroll-area.tsx` confirms the Radix `Viewport` emits that data-attribute.
  - **Done when:** opening a different entity resets the reader to the top; a test in `src/test/entity/EntityPanel.test.tsx` asserts the viewport `scrollTop` is reset on `entity.id` change.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.

- [ ] **Q12. Style GFM tables, ordered lists, inline code/pre, hr, and h4–h6 in entity prose.**
  `@tailwindcss/typography` is not installed (no entry in `package.json`/tailwind config), so the `prose prose-sm dark:prose-invert` classes on the body div in `src/atlas/entity/EntityPanel.tsx` (line ~428) are inert — only `.atlas-prose` rules in `src/index.css` apply, and those omit tables, `ol`, `code`/`pre`, `hr`, and `h4`–`h6`. `markdownCore.ts` runs marked with `gfm:true`, so those elements ARE emitted but unstyled. Add `.atlas-prose` rules: bordered/striped tables with padded `th/td`, decimal `ol` with padding, styled inline `<code>` and `<pre>` blocks, a themed `<hr>`, and `h4`–`h6` sizing. Optionally drop the dead `prose prose-sm dark:prose-invert` classes.
  - **Done when:** a lore entry containing a markdown table, ordered list, inline/fenced code, a `---` rule, and an h4 all render with visible, theme-consistent (dark) styling, with no reliance on the typography plugin.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.

- [ ] **Q13. "On this page" section-jump list for long entity entries.**
  In `src/atlas/entity/EntityPanel.tsx`, call `buildAnchors(entity.body)` (from `src/atlas/entity/paneScrollSync.ts`, already tested) and render a small collapsible "On this page" list at the top of the reading panel, shown only when there are 2+ headings. Inject `data-anchor-id` onto the rendered body headings after mount — mirror the exact pattern in `src/atlas/entity/EntityPanes.tsx` lines 124–131 (`querySelectorAll("h1,h2,h3,h4,h5,h6")` → `setAttribute("data-anchor-id", anchor.id)`). Clicking a list item scrolls the Radix viewport so the matching `[data-anchor-id]` heading is at the top (as `scrollToAnchor` does in EntityPanes).
  - **Done when:** an entity body with ≥2 headings shows a collapsible jump list whose items scroll the reader to the corresponding heading; bodies with <2 headings show no list; covered by a test in `src/test/entity/EntityPanel.test.tsx`.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~2–3 runs.

- [ ] **Q14. Include a Connections section in the printable handout.**
  `renderEntitySection` in `src/atlas/printHandout.ts` renders kicker/title/aliases/hero/summary/body/gallery/tags but drops `entity.relationships`. Add a "Connections" block listing each relationship's label (`r.label ?? r.type`) and target title, resolving the target from an `entitiesById: Map<string, Entity>` threaded through `buildHandoutHtml` (add it as a second param defaulting to an empty map so existing tests and `printEntityBundle` keep compiling). Update `printEntityHandout` and its call site in `EntityPanel.tsx` (line ~370) to pass the panel's `entityById`. Escape all inserted text via the existing `escapeHtml`.
  - **Done when:** a handout for an entity with relationships shows a Connections block (label + resolved target title, falling back to the raw id when unresolved); entities without relationships omit the block; `src/test/printHandout.test.ts` covers presence/absence and HTML-escaping.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing: `printEntityHandout` receives the already-player-projected entity (relationships pre-filtered by `projectEntityForPlayer`); pass only the projected entity/ids, never raw DM relationships.
  ~2–3 runs.

- [ ] **Q15. De-duplicate and group Connections vs "Mentioned in".**
  In `src/atlas/entity/EntityPanel.tsx`, the "Mentioned in" backlink chips (lines ~446–467, from `entity.backlinks`) and the "Connections" list (lines ~469–505, from `entity.relationships`) can both show the same related entity. Group the Connections rows by relationship type/label for readability, and filter the backlink chips to drop any whose `id` already appears as a Connection target (`r.entity`), so each related entity surfaces once.
  - **Done when:** an entity that is both a relationship target and a backlink appears only under Connections; Connections are grouped by type/label; a test in `src/test/entity/EntityPanel.test.tsx` asserts the dedup and grouping.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.

- [ ] **Q16. Replace the handout pop-up-blocked `alert()` with an app toast + pre-flight guard.**
  `openPrintWindow` in `src/atlas/printHandout.ts` (line ~149) calls raw `window.alert("Pop-up blocked…")` when `window.open` returns null. Route this through the app's sonner toast — `import { toast } from "sonner"` (already used in `EntityPanel.tsx`) and call `toast.error(...)` with a clear "allow pop-ups to download the handout" hint. Keep the pure `buildHandoutHtml` unchanged. Optionally have `printEntityHandout`/`printEntityBundle` return a boolean so callers can react.
  - **Done when:** a blocked pop-up shows a non-blocking sonner toast (no `window.alert`); `buildHandoutHtml` stays untouched; `src/test/printHandout.test.ts` still passes and, if a return value is added, a test asserts the blocked path.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.


#### Q-C — Player search, timeline & browse

- [ ] **Q17. Fix Timeline zero-results empty state (filter vs. no-dates).**
  In `src/pages/AtlasTimeline.tsx`, the `groups.length === 0` branch (line ~170) always renders the onboarding copy "No dated entries yet. Add `atlas.date`…" even when dated entries exist (`dated`, line ~31) and the query/type filter simply excluded them all. Split the empty state: when `dated.length > 0` but filtered `groups` is empty, show "No events match your filter" plus a clear-filter action (reset `query` and `activeType`); keep the current onboarding copy only when `dated.length === 0`.
  - **Done when:** with dated entries present and a non-matching filter, the panel shows the "no match" message + a working clear action; with genuinely zero dated entries the onboarding copy still shows; a render test covers both branches.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing browse copy only; no data-model or visibility change.
  ~1 run.

- [ ] **Q18. Unify entity text-match across Search, Timeline, and Browse filters.**
  The three player-search surfaces match inconsistent fields: `AtlasTimeline.tsx` (lines ~44-52) matches title/summary/tags but NOT aliases; `AtlasBrowse.tsx` (lines ~37-45) matches title/summary/aliases but NOT tags; SearchPalette scores all. Extract a pure `entityMatchesQuery(entity, q)` helper (matching title + aliases + summary + tags, case-insensitive) into a new `src/atlas/search/entityMatchesQuery.ts`, unit-test it, and route the Timeline and Browse simple-filter paths through it so all surfaces search the same fields. Leave SearchPalette's richer phrase/scoring ranking untouched.
  - **Done when:** Timeline and Browse both call `entityMatchesQuery`; a search term that hits on one page hits on all; the helper has direct unit tests covering each field.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Operates on already-player-projected entities; no DM-secret surface added.
  ~2-3 runs.

- [ ] **Q19. Show a result count in the search palette.**
  `src/atlas/search/SearchPalette.tsx` caps results with `.slice(0, 40)` (lines ~112 and ~143) with no indication, so a player can't tell whether the list is complete. Capture the pre-slice filtered length and render a small count line (palette header or footer): total matches, plus a "(showing first 40)" note only when the pool exceeds the 40 cap.
  - **Done when:** the palette shows the true match count; when >40 match, the "showing first 40" note appears; when ≤40 it does not; a render test asserts both.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Compute from the pre-slice length; do not change ranking or the cap value.
  ~1 run.

- [ ] **Q20. Search palette empty state surfaces 'Recently viewed'.**
  When the query is empty and no filters are active, `SearchPalette.tsx` lists the first 40 index entries in arbitrary index order (line ~112). Add `loadVisitedOrdered()` to `src/atlas/visited/visitedPlaces.ts` returning ids newest-first from the stored `visitedAt` timestamps (line ~62), and use it in the empty-query path to surface recently-viewed entities first under a small "Recently viewed" label; fall back to the current index order when nothing has been visited. Filter to ids present in the current index so stale ids are dropped.
  - **Done when:** with visited history, the empty-query palette lists those entities newest-first under a "Recently viewed" heading; with none visited it matches today's order; `loadVisitedOrdered` has a unit test.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Reuses the existing browser-local visited store — no new persistence, no server.
  ~2-3 runs.

- [ ] **Q21. Persist Browse/Timeline filter state in the URL.**
  `AtlasBrowse.tsx` and `AtlasTimeline.tsx` hold `query` and `activeType` only in local `useState` (lines ~22-23 in each), so a shared/bookmarked link and the Back button lose the filter. Sync `q` and `type` to the URL via `URLSearchParams` — read on mount, `replaceState` (or `useSearchParams` with `{replace:true}`) on change — mirroring the map viewer's deep-link ergonomics in `src/atlas/deepLink.ts`. Add a small pure parse/serialize helper (e.g. `browseFilterParams.ts`) with unit tests; leave the map-mode `tag`/`type` route params unchanged.
  - **Done when:** changing a Browse/Timeline filter updates the URL without a history entry per keystroke; loading that URL restores the filter; Back restores the prior filter; the helper has round-trip unit tests.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Purely client-side URL state; no new persistent surface.
  ~2-3 runs.

- [ ] **Q22. Sticky A–Z jump rail on the Browse page.**
  `AtlasBrowse.tsx` already groups entries into A–Z sections with a `#` bucket for non-letters (`grouped`, lines ~59-69). Add a compact sticky vertical alphabet rail listing only the letters that have entries; clicking a letter scroll-jumps to that section via a section `id`/ref + `scrollIntoView`. Letters (and `#`) with no entries render as disabled/non-clickable.
  - **Done when:** the rail shows on Browse, disables empty letters, and clicking an active letter scrolls to its section; a render test asserts present-vs-absent letter states.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Builds on the existing grouping; no new data or persistence.
  ~2-3 runs.

- [ ] **Q23. Highlight the matched substring in search result titles.**
  `snippet()` marks the matched term inside the body snippet, but in `SearchPalette.tsx` a title/alias match renders the plain title (line ~282) with no highlight, so it's unclear why a result matched. Add a small pure `highlightMatch(text, q)` in `src/atlas/search/snippet.ts` that reuses its existing HTML-escape + `<mark class="bg-primary/30…">` styling (export the currently-private `escapeHtml`, or factor a shared internal), and apply it to the result title (via `sanitizeAtlasHtml`, as the snippet already is) when the query hits the title. Unit-test the helper (match, no-match, HTML-escaping of special chars).
  - **Done when:** a title-matching query renders the matched span wrapped in `<mark>`; non-title matches render the plain title; the helper escapes HTML and has unit tests.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Reuse existing escape/`<mark>` styling — no new sanitize surface.
  ~1 run.

- [ ] **Q24. Add a discoverable tag-facet row to the Browse page.**
  Tag pages exist at `/atlas/tag/:tag` (`AtlasBrowse.tsx` `mode="tag"`), but nothing lets a player discover which tags exist. In Browse `mode === "browse"` only, add a top-N tag chip row computed like SearchPalette's `allTags` (lines ~96-102: tally across `playerTypeLabel`-visible entities, sort by count, slice to a cap), each chip a `<Link to={"/atlas/tag/"+encodeURIComponent(t)}>`. Keep it collapsible / capped so it stays compact.
  - **Done when:** Browse mode shows a capped, sorted tag-chip row that links into `/atlas/tag/:tag`; tag/type modes do not show it; a render test asserts the top tags and links.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Flat clickable tag list into existing tag routes — NOT a relationship-graph surface.
  ~2-3 runs.


#### Q-D — Player accessibility

- [ ] **Q25. Give the mobile entity bottom sheet an accessible name (SheetTitle/Description).**
  In `src/pages/AtlasViewer.tsx` the entity `<Sheet><SheetContent side="bottom" className="h-[80vh] p-0">` (lines ~762-785) wraps `<EntityPanel>` directly with no title, so Radix (react-dialog) logs an a11y warning and the sheet has no accessible name for screen readers. Import `SheetTitle`/`SheetDescription` (already exported from `src/components/ui/sheet.tsx`) and add a visually-hidden `SheetTitle` bound to the open entity's title (`openEntity_.title`) plus an `sr-only` `SheetDescription` — mirror the pattern already used in `src/atlas/AtlasNavMenu.tsx:56-59`. Use the existing `sr-only`/visually-hidden approach (no new util).
  - **Done when:** the bottom entity sheet has an accessible name equal to the open entity's title, the Radix missing-`Title` console warning is gone, and no visible layout change occurs.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player mobile viewer only; reads the already-projected `openEntity_` — no DM-secret surface.
  ~1 run.

- [ ] **Q26. Give map pins accessible names for keyboard and screen-reader users.**
  Leaflet markers are keyboard-focusable by default, but the `<Marker>` in `PlacementMarkers` (`src/pages/AtlasViewer.tsx:1066-1090`) passes no accessible name, so tabbing to a pin announces nothing. Pass `title={ent.title}` (append `playerTypeLabel(ent.type)` when present) to each `<Marker>` — Leaflet applies `title` to the DivIcon element as an accessible name; for stronger SR coverage also inject an `aria-label` into the div-icon root produced by `pinIconForStyle` (line 83). Add a `:focus-visible` outline ring to `.atlas-viewer-pin` in `src/index.css` (line ~69) so focused pins are visible. Extend `src/test/accessibility-labels.test.tsx` with a guard asserting the accessible name resolves to the entity title.
  - **Done when:** each rendered pin exposes its entity title (+ player type label) as an accessible name, a focus ring shows on keyboard focus, and the new guard test passes.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Visibility vocab stays sourced from `visibility.ts` (do not hardcode); use `playerTypeLabel` for the type text. Player-facing only.
  ~2–3 runs.

- [ ] **Q27. Restore a visible keyboard-focus outline on the map container and controls.**
  `src/index.css` sets `.leaflet-container { outline: none }` (lines 83-86), which strips the WCAG 2.4.7 focus ring from the focusable map, its zoom controls, and markers — keyboard users can't tell what's focused. Replace the blanket `outline: none` with a `:focus-visible`-scoped outline (e.g. `.leaflet-container:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: -2px; }` and `.leaflet-container:focus:not(:focus-visible) { outline: none; }`) so the ring shows on keyboard focus but not during mouse drag. Keep it themed with the existing `--ring`/`--primary` tokens.
  - **Done when:** keyboard-focusing the map (and its controls) shows a visible outline, a mouse drag does not, and no dashed-outline regressions appear elsewhere.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing map only; pure CSS, no new surface.
  ~1 run.

- [ ] **Q28. Make map fly animations respect prefers-reduced-motion.**
  `MapController` in `src/pages/AtlasViewer.tsx:100-114` uses `map.flyTo([lat, lng], targetZoom, { duration: 0.6 })`; Leaflet's fly is requestAnimationFrame-driven, so the global reduced-motion CSS (`src/index.css:409,494`) does not disable it for motion-sensitive players. Create `src/hooks/use-prefers-reduced-motion.ts` (a small `matchMedia('(prefers-reduced-motion: reduce)')` hook modeled on `src/hooks/use-has-desktop-aside.tsx`), and in `MapController` switch to `map.setView([lat, lng], targetZoom, { animate: false })` when reduce is preferred, keeping `flyTo` otherwise. Preserve the existing coordinate flip (`lat = flyTo.height - flyTo.y`, `lng = flyTo.x`, lines 108-109).
  - **Done when:** with `prefers-reduced-motion: reduce`, deep-link/wander/`onShowOnMap` jumps snap without animation (via `setView`), otherwise animate as before; a unit test covers both branches using the react-leaflet mock (`setView`/`flyTo` are stubbed in `src/test/helpers/reactLeafletMock.tsx`).
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Scope to the player viewer's `MapController` only (leave the editor's `flyTo` untouched). Player-facing.
  ~2–3 runs.

- [ ] **Q29. Add dialog semantics and a focus trap to the search palette.**
  `src/atlas/search/SearchPalette.tsx` is a plain `<div>` overlay (line ~178): no `role="dialog"`, no `aria-modal`, the input (lines ~189-195) is placeholder-only with no accessible label, Tab escapes to the page behind it, and focus is not returned to the trigger on close. Add `role="dialog"` + `aria-modal="true"` + an `aria-label` (e.g. "Search the atlas") to the inner palette container, an `aria-label` on the `<Input>`, focus trapping so Tab/Shift+Tab cycle within the palette, and restore focus to the Search button (in `src/pages/AtlasViewer.tsx`) when the palette closes.
  - **Done when:** the palette exposes dialog semantics with an accessible name, the input is labelled, Tab stays trapped inside while open, and closing returns focus to the Search trigger; a unit test asserts the roles/label and focus restore.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing search overlay; no ranking/behavior change.
  ~2–3 runs.

- [ ] **Q30. Announce search palette results with listbox / aria-activedescendant.**
  In `src/atlas/search/SearchPalette.tsx`, arrow-key navigation (`handleKeyDown`, lines 161-175) only moves a visual highlight (`active` → `bg-accent`); screen readers hear nothing as selection changes and the match count is never announced. Give the results container (`listRef` div, line ~264) `role="listbox"`, give each result row (lines ~272-303) `role="option"`, a stable `id`, and `aria-selected={i === activeIndex}`, point `aria-activedescendant` on the input at the active row's id, and add a polite `aria-live` region announcing the match count (compute from the pre-`.slice(0,40)` filtered length if surfacing a total).
  - **Done when:** moving the selection updates `aria-activedescendant`/`aria-selected`, the results container is a labelled listbox, and a polite live region announces the count; a unit test asserts the roles and activedescendant wiring.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing search overlay; presentation/semantics only, no ranking change.
  ~2–3 runs.

- [ ] **Q31. Enforce a 24px minimum tap target on filter chips.**
  The type/tag filter chip buttons (`text-[10px] … px-2 py-0.5 rounded`, ~18px tall) in `src/atlas/search/SearchPalette.tsx` (lines ~208,221,233,244,255), `src/pages/AtlasBrowse.tsx` (~152,163), and `src/pages/AtlasTimeline.tsx` (~141,152) fall below the WCAG 2.5.8 (AA) 24px minimum target size and are fiddly on phones. Add one shared chip utility class in `src/index.css` (`min-height: 24px`, adequate horizontal padding, inline-flex centered) and apply it to those filter-chip buttons across the three surfaces.
  - **Done when:** every filter chip on Search/Browse/Timeline is ≥24px tall via the shared class, the three surfaces reference one class (no per-file magic numbers), and existing chip tests still pass.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Scope to the interactive filter chip buttons only — leave the inline `<code>` `px-1 py-0.5` spans (Browse:179/184, Timeline:173) untouched. Player-facing.
  ~1 run.

- [ ] **Q32. Add skip-links and <main> landmarks to Browse, Timeline, Secrets, Credits.**
  Only `src/pages/AtlasViewer.tsx` has a bypass-block skip link (`<a href="#atlas-main" className="skip-to-main">`, line 524) and a labelled `<main id="atlas-main">` landmark (lines 627-631); `src/pages/AtlasBrowse.tsx`, `src/pages/AtlasTimeline.tsx`, `src/atlas/secrets/CharacterSecretsPage.tsx`, and `src/pages/AtlasCredits.tsx` render their scroll region with neither, forcing keyboard/SR users through the repeated toolbar each visit. Add a `skip-to-main` link (reusing the existing `.skip-to-main` class in `src/index.css:424`) targeting a page-unique id and wrap each page's primary content in a labelled `<main id="…">` landmark, matching AtlasViewer's pattern.
  - **Done when:** each of the four pages has a keyboard-reachable skip link that jumps to a single labelled `<main>` landmark, ids are unique per page, and a test asserts the landmark + skip target exist.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing pages; reuse the existing `.skip-to-main` style (no new CSS surface).
  ~2–3 runs.


#### Q-E — Player soundscape polish

- [ ] **Q33. Add a persisted player volume slider.**
  Add a `volume: number` (0..1, default ~0.8) field to `SoundPrefs` in `src/atlas/sound/soundPrefs.ts`, validated on load exactly like the existing booleans (loadSoundPrefs) and written by saveSoundPrefs. Render a compact slider in `src/atlas/sound/SoundControl.tsx` that calls a new `setVolume` on `SoundSettingsProvider.tsx`. The provider must own the effective master gain = `playerVolume × map masterGain` and push it to `engine.setMasterGain`; today `SoundscapeLayer.tsx:30` calls `engine.setMasterGain(mapDoc.soundscape?.masterGain ?? 0.6)` directly, so change SoundscapeLayer to report the map's masterGain up to the provider (e.g. a `setMapMasterGain` in context) and let the provider compute+apply the combined value instead of stomping the raw map gain.
  - **Done when:** dragging the slider changes loudness live, the value persists across reload, and SoundscapeLayer no longer sets raw master gain (effective master = volume × map gain); a unit test asserts persistence and the combined-gain math.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing only; no DM-secret surface. ~2–3 runs.

- [ ] **Q34. Suspend the AudioContext when muted, calm, or hidden.**
  The provider's mute/calm effect in `src/atlas/sound/SoundSettingsProvider.tsx:54-57` only calls `engine.setMuted(muted||calmMode)`, which ramps master gain to 0 but leaves the AudioContext and its looping source running. After the 0.2s mute ramp settles, call `engine.suspend()` (already defined at `AudioEngine.ts:51`) whenever muted or calm; call `engine.resume()` before the next unmute/crossfade. Keep the existing `visibilitychange` suspend/resume (SoundSettingsProvider.tsx:60-67) intact and ensure the unmute-resume path does not fight the hide-suspend.
  - **Done when:** enabling mute or calm suspends the context after the ramp and unmuting resumes it; a unit test with the stub AudioContext (src/test/sound/SoundControl.test.tsx style deps) asserts `engine.suspend`/`engine.resume` are invoked on mute/unmute.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Battery/CPU health only; player-facing, no DM-secret surface. ~1 run.

- [ ] **Q35. Add a player-safe 'ambience playing' now-playing affordance.**
  RESCOPED — the original seed assumed `SoundArea.name` ships to players, but `scripts/atlas/filterSoundscape.ts:19-24` deliberately STRIPS `name` and rewrites area ids to `area-N` so DM labels never reach the player artifact; a name-based label would render nothing in player builds and re-shipping the name would reopen a closed leak. Instead surface a generic indicator: have `src/atlas/sound/SoundscapeLayer.tsx` report whether a bed is currently active (its `activeId.current !== null` after `crossfadeTo`) up to `SoundSettingsProvider.tsx` via a new context flag (e.g. `ambiencePlaying`), and show a subtle 'Ambience playing' label near `SoundControl.tsx` inside an `aria-live="polite"` region, hidden when silent or muted.
  - **Done when:** the indicator shows only while a bed is actually playing (sound enabled, not muted/calm, a live area selected) and clears on silence/mute; no player-facing string is derived from `SoundArea.name`; a unit test asserts the indicator toggles with active state and that no area name is read.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-secret guardrail: do NOT carry `SoundArea.name` into the player build or touch `filterSoundscape.ts` — area names stay stripped/anonymized. ~2–3 runs.

- [ ] **Q36. Hide sound controls when the active map has no soundscape.**
  `src/atlas/sound/SoundControl.tsx` always renders the invite + mute + calm buttons even when the active map has `soundscape.enabled === false` or zero areas, promising ambience that never plays. Plumb a `hasSoundscape` boolean from `AtlasViewer.tsx` (which holds `activeMap` and renders SoundControl at line 695; compute `activeMap.soundscape?.enabled !== false && (activeMap.soundscape?.areas?.length ?? 0) > 0`) into SoundControl and suppress the invite + mute button when it is false. Keep the Calm-mode toggle rendered (it also governs ocean motion), or gate only the audio controls.
  - **Done when:** on a map with no/disabled soundscape the invite + mute controls are hidden while Calm mode stays available; on a sound-bearing map all controls render as today; a unit test covers both branches.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing conditional render only. ~1 run.

- [ ] **Q37. Graceful fallback when Web Audio is unavailable.**
  `realAudioDeps.createContext` (`src/atlas/sound/realAudioDeps.ts:4`) throws when neither `window.AudioContext` nor `webkitAudioContext` exists, and `enableSound` in `SoundSettingsProvider.tsx:69-72` does `void engine.unlock()` with no `.catch`, so tapping the invite floats an unhandled rejection and leaves a dead mute button. Add a capability probe (a small helper returning whether an AudioContext constructor is present), wrap `engine.unlock()` in try/catch inside `enableSound`, and expose an `audioAvailable` flag so `SoundControl.tsx` suppresses the invite/mute (or marks them unavailable) when Web Audio can't run. The rest of the viewer must keep working.
  - **Done when:** with no AudioContext available the invite/controls are suppressed and no unhandled rejection occurs (unlock failure caught); a unit test using deps whose `createContext` throws asserts the controls hide and `enableSound` does not reject.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing hardening only. ~1 run.

- [ ] **Q38. Honor prefers-reduced-motion for calm-mode motion without silencing sound.**
  Today `calmMode` is one toggle that both stills the ocean (via `data-calm` in `SoundSettingsProvider.tsx:48-52`) AND mutes the engine (`engine.setMuted(muted||calmMode)` at line 56), and nothing reads `matchMedia`. Introduce a distinct motion-only flag: set `data-calm` on `<html>` when EITHER `calmMode` OR the reduced-motion flag is on, but keep `engine.setMuted` driven by `muted || calmMode` only (never the motion flag). Initialize the motion flag once from `matchMedia('(prefers-reduced-motion: reduce)')` when no stored pref exists (guard for SSR / missing matchMedia); leave the explicit Calm-mode master toggle and its persisted pref unchanged. No shared hook exists (`src/hooks/use-prefers-reduced-motion.ts` is absent) — read matchMedia directly in the provider.
  - **Done when:** a first-time visitor with prefers-reduced-motion gets a still ocean (`data-calm` set) while sound still plays (engine NOT muted); toggling Calm mode still mutes audio; a unit test asserts reduced-motion sets the motion flag without muting the engine.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Guardrail: keep strictly to decoupling motion from audio and defaulting motion only — do NOT auto-silence audio for reduced-motion, and do NOT add a single calm/plain master switch or any weather/time-of-day surface. ~2–3 runs.

- [ ] **Q39. Fix AudioEngine buffer-cache leak and add engine unit tests.**
  In `src/atlas/sound/AudioEngine.ts` `touch()` (lines 155-163), when the LRU would evict the currently-active source's buffer it `continue`s AFTER already `shift()`-ing that src off `lru` (line 159), so the active buffer stays in the `buffers` map but is no longer tracked and is never re-added when it stops being active — `buffers` grows past `BUFFER_CAP` over a long session. Fix by re-pushing the skipped active src back onto `lru` (keeping it tracked at the tail) so the loop evicts a genuinely-inactive entry and terminates. Add direct `AudioEngine` tests with a stubbed AudioContext covering: a crossfade superseded while decoding (newer target wins), `canPlay` Ogg→fallback src selection, and the LRU cap holding steady across many loads including the active-buffer case.
  - **Done when:** after loading more than BUFFER_CAP distinct beds with one kept active, `buffers.size` stays ≤ BUFFER_CAP and the active buffer is retained; the new AudioEngine tests pass.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Codebase-health, self-contained to AudioEngine. ~2–3 runs.


#### Q-F — DM editor ergonomics

- [ ] **Q40. Add Cmd/Ctrl+S keyboard shortcut to save.**
  In `useEditorKeyboardShortcuts` (src/atlas/shell/useEditorKeyboardShortcuts.ts) add a third global `keydown` effect that intercepts Cmd/Ctrl+S: call `e.preventDefault()` (suppresses the browser Save dialog) then invoke a new `onSave` callback. Thread `onSave` through `UseEditorKeyboardShortcutsArgs` and wire it from AtlasPlacementEditor.tsx at the existing hook call (line ~990) as `onSave={onSaveClick}` — `onSaveClick` is defined at line 797. No-op when the session is clean or already saving (guard inside `onSaveClick`, or pass a `canSave` flag). Unlike the undo/redo effect, Save must fire even when focus is in an input/textarea, so do NOT gate it on the `isEditableTarget` check.
  - **Done when:** pressing Cmd/Ctrl+S in the editor triggers a save and never opens the browser Save dialog; a hook unit test asserts preventDefault + onSave fired, and that it no-ops when clean/saving.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only (`__INCLUDE_EDITOR__`-gated); no player surface.
  ~1 run.

- [ ] **Q41. Wire Cmd+B / Cmd+I / Cmd+K formatting shortcuts in the body editor.**
  In `EntityEditPanel.handleBodyKeyDown` (src/atlas/categories/EntityEditPanel.tsx:332) the first line `if (!acCtx) return;` bails when the autocomplete popover is closed. BEFORE that guard, when `(e.metaKey||e.ctrlKey)` and the popover is closed, map `b→"bold"`, `i→"italic"`, `k→"wikilink"` (real `ToolbarActionId`s in src/atlas/editor/toolbarActions.ts), `e.preventDefault()`, and route through the existing `handleToolbarAction(id)` (lines 215-231, which calls `applyToolbarAction` against the live selection). Also add `title` tooltips ("Bold (Ctrl+B)" / "Italic (Ctrl+I)" / "Wikilink (Ctrl+K)") to the matching `ALWAYS` buttons in FormatToolbar.tsx (lines 80-84).
  - **Done when:** with the popover closed, Cmd/Ctrl+B/I/K apply bold/italic/wikilink to the selection via the toolbar pipeline; the toolbar buttons show the shortcut in their tooltip; a test asserts the keydown → applyToolbarAction wiring.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only; reuses the already-tested pure `applyToolbarAction` transforms, no new logic invented.
  ~2–3 runs.

- [ ] **Q42. Replace native confirm() dialogs with an in-app confirm.**
  Extract a reusable `ConfirmDialog` (model it on `DiscardConfirmModal`, src/atlas/session/DiscardConfirmModal.tsx — safe/cancel action default-focused, Esc dismisses) and swap it in for the four browser `confirm()` guards on destructive actions: delete region (RegionsTab.tsx:241), delete route (RoutesTab.tsx:294), clear all reveals (FogTab.tsx:463), clear all fog shapes (FogTab.tsx:505). Each action must run only after in-app confirmation.
  - **Done when:** none of those four sites call `window.confirm`; each shows the in-app `ConfirmDialog` and only deletes/clears on confirm; a render test covers confirm + cancel for at least one site.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only; the FogTab swap is pure confirmation UI — no fog redaction logic or shipped artifact changes, so no atlas:publish needed.
  ~2–3 runs.

- [ ] **Q43. Replace placeholder Help link with an in-editor shortcuts panel.**
  The Help menu currently does `window.open("https://github.com","_blank")` (AtlasPlacementEditor.tsx:1297). Change the `onHelp` handler to `setActivePanel("help")`, add a `"help"` key to the `panels` record (src/pages/AtlasPlacementEditor.tsx:1347) rendering a small Help panel node, and a title in `menuPanelTitle` (:1791, e.g. `help: "Keyboard shortcuts"`). EditorMenu already exposes the `help` id wired to `onHelp` (EditorMenu.tsx:16,37) and `EditorPanelHost` already renders `panels[activePanel]`. The panel lists the editor shortcuts (Cmd+K palette, Cmd+Z / Shift+Cmd+Z / Ctrl+Y undo/redo, Esc cancel placement, plus any new Save/format shortcuts) and a few quick-start tips.
  - **Done when:** clicking Help opens an in-editor panel (no external browser tab); the panel lists the current shortcuts; `window.open` is removed from `onHelp`.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only; reuses the existing menu + panel-host seam. Best sequenced after Q40/Q41 so the new shortcuts appear in the list.
  ~2–3 runs.

- [ ] **Q44. Surface an undo/redo toast with the action label.**
  `useUndoStack` records an optional per-action `label` (src/atlas/useUndoStack.ts:23-24, comment says "surfaced in tooltips") but `undo()`/`redo()` (lines 65-89) return `void` and never expose it. Change `undo()`/`redo()` to return the acted action's `label` (or undefined), and at the call sites — the undo/redo button handlers in AtlasPlacementEditor.tsx and the Ctrl+Z / Shift+Z path in useEditorKeyboardShortcuts.ts — show a brief sonner toast ("Undid: moved pin" / "Redid: draw region") when a label is present. Audit the existing `undoStack.push` sites and add a human `label` where missing.
  - **Done when:** undoing/redoing a labelled action (button or keyboard) shows a toast with the label; unlabelled actions show a generic toast or none; a unit test asserts `undo()`/`redo()` return the acted label.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only; leverages the existing unused `label` field, low-risk.
  ~2–3 runs.

- [ ] **Q45. Add Shift-coarse / default-fine nudge with a visible step.**
  The pin-popover nudge arrows hardcode a 100-unit step via `onNudge?.(dx,dy)` (AtlasPlacementEditor.tsx:2462,2471,2479,2487) and RegionsTab.tsx has an equivalent region-translate control. Introduce a shared step constant (e.g. `NUDGE_FINE=100`, `NUDGE_COARSE=500`) and read `e.shiftKey` in each arrow's `onClick` so Shift nudges by the coarse step and a plain click stays fine — scale the existing direction vectors (up=(0,+step), left=(−step,0), etc.) so signs are preserved. Show the active step next to the "Nudge" label (:2455), e.g. a static "Shift = 500" hint or a live "Nudge (100/500)" indicator.
  - **Done when:** Shift+click on a nudge arrow moves by the coarse step and plain click by the fine step in both the pin popover and RegionsTab; the step size is visible in the UI; a test covers the fine-vs-coarse branch.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only; refines existing controls. Coordinates stay in raw map units — the Leaflet flip (lat = mapHeight − y) is not in this path and stays untouched.
  ~2–3 runs.

- [ ] **Q46. Show a '+N more' overflow indicator on validation chips.**
  `ValidationChips` (src/atlas/tabs/ValidationChips.tsx) does `issues.slice(0, limit)` (default 5) and silently drops the rest, so a DM with 8 blocking issues sees only 5. When `issues.length > limit`, append a muted "+N more" row after the sliced chips (N = `issues.length - limit`), styled to sit under the blocking/warning chips (e.g. `text-muted-foreground text-[11px]`), non-interactive.
  - **Done when:** rendering more than `limit` issues shows exactly `limit` chips plus a "+N more" row with the correct N; at or below the limit shows no extra row; a render test covers both cases.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only; single shared component used by the Regions/Routes/Fog tabs.
  ~1 run.

- [ ] **Q47. Add a 'No matches' empty state to the command palette.**
  `CommandPalette` (src/atlas/shell/CommandPalette.tsx) renders an empty `<ul>` (lines 61-78) when `results.length === 0`, leaving a blank void under the input. When `results.length === 0`, render a single muted row instead — e.g. `No matches for "{q}"` using `text-muted-foreground`, non-selectable — so the DM knows the search ran and found nothing. Keep the normal result list when there are matches.
  - **Done when:** typing a query with no matches shows the "No matches for …" row (query echoed) instead of an empty list; a render test asserts it appears only at zero results.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only; one-component change on the command palette.
  ~1 run.


#### Q-G — DM import & Obsidian fidelity

- [ ] **Q48. Resolve heading-anchor wikilinks in the navigable path (heading anchors only).**
  In `tokenizeWikilinks` (`src/atlas/content/parseWikilinks.ts:20-33`) compute `filePart` = the target text before the first `#` and resolve via `ctx.resolveByName(filePart)` instead of the full target, so `[[Note#Heading]]` renders a navigable `<a data-entity-id>` to Note in both player and DM builds. Set display = alias ?? filePart. When `filePart` is empty (`[[#Heading]]`, same-note) render an inert `<span class="atlas-wikilink-anchor">` in `renderLinkTokens` rather than the dead planned-link span. CRITICAL for safety: keep `link.target` = the full original trimmed string (e.g. `SecretNote#Heading`) so the existing player leak-scan redaction regexes at `build-atlas.ts:553-559` and `projectEntityForPlayer.ts:104-107` (both built from `l.target`) still match and redact `[[SecretNote#Heading]]` in body + search index — do NOT overwrite `l.target` with the file part.
  - **Done when:** `[[Note#Heading]]` resolves to a navigable link to Note; `[[#Heading]]` renders an inert `atlas-wikilink-anchor` span (not a broken link); a new player-projection regression test proves `[[SecretNote#Heading]]` (SecretNote = dm-only) is redacted from `body`, `bodyHtml`, `links`, and the search index; `parseWikilinks-parity.test.ts` + `projectEntityForPlayer-build-parity.test.ts` stay green.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) + `npm run atlas:publish` + `atlas:publish:integrity-smoke` (touches shipped artifacts and the player-safety cross-ref leak scan).
  EXPLICITLY EXCLUDE block-reference resolution: `[[Note#^blockid]]` must NOT resolve/scroll to a block (stated non-goal) — the `#^…` anchor is ignored for resolution, never block-anchored. Visibility vocab untouched (from `visibility.ts`). Shares the resolver seam with Q49 — land consistently.
  ~2–3 runs.

- [ ] **Q49. Resolve folder-path wikilinks [[Folder/Note]] by basename.**
  When `ctx.resolveByName(filePart)` is undefined and `filePart` contains `/`, fall back to resolving the trailing path segment (basename) against the title/alias index in `tokenizeWikilinks` (`src/atlas/content/parseWikilinks.ts`), so `[[02_Regions/Tidemarrow]]` rescues to the Tidemarrow entity. Guard against ambiguity: build a Set of names mapped by >1 distinct entity id alongside `crossRefNameIndex` (`scripts/build-atlas.ts:530`) and `nameIndex` (`projectEntityForPlayer.ts:62-70`), extend `ResolveContext` with a basename-safe resolve that returns undefined for ambiguous basenames, and construct it identically in both builders (parity tests lock them). Keep `link.target` = the full original string so the leak-scan redaction regex still matches `[[Folder/SecretNote]]` verbatim.
  - **Done when:** an unresolved `[[Folder/Note]]` rescues to Note only when the basename is unique; ambiguous basenames stay broken (no wrong-note resolution); already-resolving links are unchanged; a regression test proves `[[Folder/SecretNote]]` (dm-only) is redacted in player output; parity tests + `src/test/wayfinding/wikilink-aria.test.ts` stay green.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) + `npm run atlas:publish` + `atlas:publish:integrity-smoke` (shared player-safety leak-scan resolver + shipped artifacts).
  Rule = 'only when the full target is unresolved AND the basename is unique'. Shares the resolver seam with Q48.
  ~2–3 runs.

- [ ] **Q50. Vault scan should only return .md files.**
  `handleVaultScanRequest.processFile` (`scripts/vite-plugin-atlas-save.ts:978-1001`) reads EVERY file as UTF-8 despite its docstring saying '.md files'. In `processFile`, after computing `relPosix`, add a case-insensitive `.md` extension guard (`if (!relPosix.toLowerCase().endsWith('.md')) return null;`) BEFORE the `fs.stat`/size accounting (line 986-991) so binaries/images are skipped, never read as mojibake into staging rows, and never counted against `MAX_VAULT_AGGREGATE_BYTES` (line 992-994). Optionally add `**/*.excalidraw.md` to the built-in ignores in `src/atlas/import/ignoreRules.ts` (`makeIgnore`) since those are base64 JSON, not prose.
  - **Done when:** a vault containing `.png`/`.pdf`/`.canvas` files returns only `.md` entries; large binaries no longer blow the 25 MB aggregate budget; `src/test/import/vaultScanMapping.test.ts` is extended to assert non-`.md` files are excluded.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Read-only dev-server endpoint; this only narrows what is returned. Mirrors the drag/drop importer which already accepts `.md` only.
  ~1 run.

- [ ] **Q51. Stop turning non-image ![[embeds]] into broken images.**
  `resolveImageEmbeds` (`src/atlas/content/renderEntityMarkdown.ts:17-27`) converts ANY `![[...]]` into a markdown `<img>`, so `![[Some Note]]` or `![[doc.pdf]]` render as broken images everywhere. Gate the `EMBED_RE`→img conversion on a recognized image extension (png/jpg/jpeg/gif/webp/svg/avif, case-insensitive) on the resolved filename; for non-image embeds emit an inert placeholder (e.g. `<span class="atlas-embed-missing">embedded note not shown</span>`) instead of a broken image. This single function feeds the build (`build-atlas.ts:536`), the player projection (`projectEntityForPlayer.ts:85`), and the editor preview (`renderEntityMarkdown.ts:37`), so all three fix together.
  - **Done when:** `![[image.png]]` still renders an `<img>`; `![[Some Note]]` / `![[x.pdf]]` render the inert placeholder (no broken img) in DM, player, and build output; `src/test/content/renderEntityMarkdown.test.ts` covers both branches; a regression test proves a `%%`-wrapped `![[Secret Note]]` never surfaces in the player projection (stripDmBlocks runs upstream).
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) + `npm run atlas:publish` + `atlas:publish:integrity-smoke` (runs on the player projection + shipped bodyHtml).
  Does NOT add transclusion (explicit non-goal) — only replaces the broken image with an inert placeholder. Complements the existing image-extension-only dropped-embed publish check.
  ~2–3 runs.

- [ ] **Q52. Expand folder-name to entity-type inference coverage.**
  `FOLDER_TYPE_MAP` (`src/atlas/import/inferType.ts:9-31`) is missing many common vault folder names that `inferTypeFromTags` (`TAG_TYPE_MAP`) and `categoryForType` already understand. Add plural+singular mappings — cities→city, towns→town, villages→village, temples→temple, shops→shop, caves→cave, ports→port, people/persons→person, places/landmarks→location, capitals→capital, guilds/organizations→faction, deities/gods→deity — reusing the SAME type strings `TAG_TYPE_MAP` emits so folder and tag signals stay consistent. (Note: `deity`/`god` resolve to the `lore` category via `categoryForType`, which is acceptable; everything else maps to characters/locations/factions as expected.)
  - **Done when:** a note under `Cities/`, `Temples/`, `Ports/`, `People/`, etc. infers the mapped type instead of falling through to `note`; `src/test/infer-type.test.ts` is extended for the new folders; no change to `categoryForType`/`entityCategory.ts`.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.

- [ ] **Q53. Don't offer a visibility choice on new-import rows that is silently ignored.**
  `buildImportChanges` (`src/atlas/import/buildImportChanges.ts:88-91`) forces create/path-collision rows to visibility `dm` unless `row.needsReview?.reason === 'secrecy-increase'`, but the modal's Visibility `<Select>` (`src/atlas/import/ImportStagingModal.tsx:201-221`) is only disabled for `update` rows (line 204-206) — so a DM who picks `player` on a create row is silently overwritten to `dm`. Extend the `disabled` condition to also disable the Select for `create` AND `path-collision` rows EXCEPT secrecy-increase-review rows, and add a title/tooltip: 'New imports are saved DM-only for safety — publish later in the editor.'
  - **Done when:** the Visibility Select is disabled (with tooltip) on create/path-collision rows and still enabled on secrecy-increase review rows; the write logic in `buildImportChanges` is unchanged; `src/test/import-staging-modal.test.tsx` asserts the disabled state + tooltip.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  UI-only and strictly tightens the player-secrecy line — never lets a create row ship as `player`. Visibility option list stays sourced from `visibility.ts`.
  ~1 run.

- [ ] **Q54. Warn when frontmatter tags/aliases are a comma-jammed scalar string.**
  `toStringArray` (`scripts/atlas/parseFrontmatter.ts:111-116`) turns a scalar like `tags: npc, smuggler` into a single bogus tag `['npc, smuggler']` with no signal, silently corrupting tag-based filtering/inference. In `parseFrontmatter`, when `atlas.tags` / `data.tags` (line 75) or `aliases` (line 71) arrive as a single comma-containing string, push a build warning into the existing `warnings` array (e.g. 'atlas.tags should be a YAML list — treated as one tag'); optionally split on commas, kept behind the warning. Surface the same signal in the import staging extraction (`src/atlas/import/stagingState.ts`).
  - **Done when:** a comma-jammed tags/aliases scalar produces a build warning; already-list tags/aliases are untouched (test); `src/test/atlas-import.test.ts` covers the warning (and the split, if implemented).
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) + `npm run atlas:publish` (`parseFrontmatter` is in the build pipeline and tags ship in atlas.json).
  Additive warning only; if auto-splitting is added, test that already-list tags stay byte-identical.
  ~1 run.

- [ ] **Q55. Tell the DM up front when Sync needs a DM build loaded.**
  `openWithVaultScan` throws `DmBuildRequiredError` only AFTER 'Sync now' is clicked when `existingById` is empty (`src/atlas/import/useMdImportFlow.ts:116-121`), surfacing as a late toast. Add a `hasDmBuild` boolean prop to `SyncPanel` (`src/atlas/sync/SyncPanel.tsx`) and thread it from `AtlasPlacementEditor` (mount at `AtlasPlacementEditor.tsx:1760`, which owns `existingById` → `existingById.size > 0`). When false, render an inline note near the Sync button: 'Rebuild in DM mode first — Sync merges against the full DM atlas.' Optionally disable the Sync button while false so the precondition is actionable before clicking.
  - **Done when:** SyncPanel shows the inline precondition note when no DM build/entities are loaded, before the DM clicks Sync; `src/test/sync-panel.test.tsx` asserts the note renders for `hasDmBuild=false` and is absent for `true`.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only; no new capability — just moves the existing error message to where the DM can act on it.
  ~1 run.


#### Q-H — DM publish, backup & assets

- [ ] **Q56. Fix false-orphan warnings for `![[embed]]` images in the asset auditor.**
  In `scripts/atlas/audit-assets.ts`, `collectReferences` (line 252) harvests only `![alt](path)` (`extractMarkdownImageRefs`, line 163) and frontmatter `atlas.images` refs, so an image referenced solely via an Obsidian `![[image.png|alt]]` embed is reported as an orphan/unused. Add an `extractEmbedImageRefs` helper that applies the same `EMBED_RE = /!\[\[([^[\]\n]+?)\]\]/g` used by `src/atlas/content/renderEntityMarkdown.ts` (line 9), strips any `|alt` suffix, resolves the filename to an asset the way `DEFAULT_RESOLVE_ASSET` does, and pushes the result through `normalizeRefPath` into the reference list. Only count embeds whose target has an image extension.
  - **Done when:** an entity body containing only `![[foo.png]]` no longer lists `foo.png` as an orphan; a new case in `src/test/asset-audit.test.ts` covers pipe-alias and subfolder embeds, and note transclusions (`![[SomeNote]]`) are NOT collected.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) + `npm run atlas:publish` + `npm run atlas:publish:integrity-smoke` (modifies a publish safety scan).
  Scanner logic only, no new surface; keep the extractor image-extension-scoped so it can't sweep up `![[note]]` transclusions.
  ~1 run.

- [ ] **Q57. Correct the audit-assets publish-block message to match its real trigger.**
  In `scripts/atlas/publishScan.ts`, `runPublishScans` calls `runAuditAssets` non-strict (lines 172-176), and `audit-assets.run()` returns the blocking `13` ONLY when an image exceeds the 4 MB hard cap (`sizeErrors.length > 0`, audit-assets.ts line 458) — orphans and broken refs are warn/info in non-strict mode. But `MSG["audit-assets"]` (line 38-39) says "referenced but missing (or an unused image needs cleanup)", which is never the actual block reason. Rewrite it to describe the oversize block (e.g. "An image is larger than the 4 MB limit and must be optimized before publishing."). Optionally add an `audit-assets-oversize` value to the `PublishScanReason["scan"]` union in `src/atlas/publish/publishTypes.ts` (updating the MSG map) so the DM learns which file is too big.
  - **Done when:** the audit-assets block message describes an oversize image, not a missing/unused one; `scripts/atlas/publishScan.test.ts` asserts the new copy.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) + `npm run atlas:publish` + `npm run atlas:publish:integrity-smoke` (touches the publish safety-scan adapter).
  Message stays generated from the static template (D8: never echoes a secret).
  ~1 run.

- [ ] **Q58. Show real file size and an oversize flag per image in the Asset Manager.**
  `src/atlas/assets/AssetManagerPanel.tsx` (editor-only) lists each asset from `collectAssets(project)` but never shows byte size. For each row, fetch the served asset (`fetch(normalizeAtlasAssetUrl(a.src)).then(r=>r.blob()).then(b=>b.size)`), cache the size in local state, render it (e.g. "1.8 MB"), and flag rows over the audit thresholds — import `SIZE_WARN_BYTES` (1 MB) / `SIZE_ERROR_BYTES` (4 MB) from `scripts/atlas/audit-assets.ts` — with an inline "optimize this image" hint. Handle a failed fetch gracefully (render no size, never crash the panel).
  - **Done when:** each asset row shows its size, oversize rows show the warn/error hint, and `src/test/assets/AssetManagerPanel.test.tsx` covers a mocked oversize fetch (size shown + hint) and a fetch failure.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only panel (`__INCLUDE_EDITOR__`-gated, tree-shaken from player builds); no player surface.
  ~2-3 runs.

- [ ] **Q59. Add bulk credit actions to the Asset Manager and fix the uncontrolled credit input.**
  In `src/atlas/assets/AssetManagerPanel.tsx` the credit `<input>` uses `defaultValue={entry.credit}` (line 64), so a programmatic bulk-apply or external `assetCredits` update won't reflect in the field — convert it to a controlled `value={entry.credit}`. Add three bulk controls that call `onPatch` over the whole registry: "apply this credit to all" (copy one row's credit string onto every asset), "enable all badges", and "disable all badges" (flip every entry's `enabled`). Preserve the existing per-asset `setEntry` merge semantics and the `EMPTY` default.
  - **Done when:** typing in one field then "apply to all" fills every row's controlled input; enable/disable-all flip every badge; `src/test/assets/AssetManagerPanel.test.tsx` covers bulk-apply and controlled-value reflection.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only panel; `AssetCredit` shape in `src/atlas/content/schema.ts` is unchanged.
  ~2-3 runs.

- [ ] **Q60. Distinguish a first-ever publish from "no changes" in the diff panel.**
  `computeAtlasDiff(null, current)` returns `EMPTY_DIFF` with `hasChanges:false` (`src/atlas/publish/computeAtlasDiff.ts` lines 130-140), so `PublishedDiffPanel` shows "No changes since last publish." (line 137-138) on a first publish when the whole world is genuinely new. Add a `hadBaseline: boolean` field to `AtlasDiff` (false when `baseline` is null, true otherwise) and, in `PublishedDiffPanel.tsx`, when `!hasChanges && !hadBaseline` render "First publish — your whole world will go live." instead of the no-changes copy. `ReadinessCard.tsx` just forwards `result.diff` to the panel, so no change is needed there.
  - **Done when:** a null baseline renders the first-publish message; a genuine no-op diff still renders "No changes"; `src/atlas/publish/computeAtlasDiff.test.ts` asserts `hadBaseline` for both the null-baseline and populated-baseline cases.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.

- [ ] **Q61. Post-publish confirmation: show what shipped plus the commit id.**
  In `src/atlas/publish/usePublishFlow.ts`, `confirm()` sets state to `"published"` (line 70) but discards `data.pushedAt` and `data.commit`, which the `PublishPushResult` "published" variant carries (`src/atlas/publish/publishTypes.ts` line 39). Capture the push result in a new hook field (e.g. `pushResult`) and, in `src/atlas/tabs/PublishCheckTab.tsx` (the `state === "published"` block, line 157-163 — today only "in a couple of minutes"), render a concrete summary from `checkResult.diff.counts` plus the short commit, e.g. "Published 5 entities and 3 pins (commit a1b2c3d)." (map `counts.placements` to "pins"). Degrade gracefully when counts are zero.
  - **Done when:** after a successful publish the panel shows the entity/pin counts and the short commit sha; `src/atlas/publish/usePublishFlow.test.ts` asserts the captured push result.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only publish UI; reuses data already returned by `/__atlas/publish-push`.
  ~1 run.

- [ ] **Q62. Add backup retention pruning (`--keep N`) to `atlas:backup`.**
  `scripts/atlas/backup.ts` writes `backups/<ISO-timestamp>.zip` on every run (line 24-26/102) with no cleanup, so the folder grows unbounded. Add a `--keep N` flag: after writing the new zip, delete the oldest `.zip` files in `backups/` beyond the newest N (the ISO-timestamp filenames sort lexicographically = chronologically). Extract the selection as a pure `zipsToPrune(filenames: string[], keep: number): string[]` helper (over a filename list) so it is unit-testable, and only ever unlink `.zip` files inside `backups/`. This requires branching `main()` on parsed argv (currently it runs unconditionally on import).
  - **Done when:** `--keep 3` keeps the 3 newest zips and removes older ones; omitting the flag preserves current behavior (no deletion); a new `scripts/atlas/backup.test.ts` covers `zipsToPrune` for keep=0, keep>=count, and ignoring non-`.zip` files.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Deletes only regenerable `.zip` snapshots in `backups/`, never `content/` or `assets/`; pruning is opt-in via the flag.
  ~1 run.

- [ ] **Q63. Add a non-destructive restore that extracts a backup into a fresh folder.**
  `scripts/atlas/backup.ts` has no restore counterpart. Add a `--restore <zip> --out <dir>` mode (branch in `main()` on argv before the current backup path): unzip the chosen backup into `<dir>`, REFUSING if `<dir>` exists and is non-empty (write nothing, exit with a clear message), then verify the extracted file count against the `MANIFEST.md` "Files:" line the backup already writes (line 82-94). Add an `atlas:restore` script to `package.json` (currently only `atlas:backup` at line 33). Keep the manifest count-check as a pure helper so it's testable.
  - **Done when:** `--restore x.zip --out newdir` extracts into an empty `newdir` and reports a verified file count; a non-empty `--out` aborts without writing; `scripts/atlas/backup.test.ts` covers the manifest count-verify helper and the non-empty-dir refusal.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Writes only into a caller-named empty output dir and refuses to overwrite; never restores over `content/`. Depends on / coordinate with Q62 (both add argv parsing to `backup.ts` and share `backup.test.ts`) — land after or bundle with it.
  ~2-3 runs.


#### Q-I — Build & runtime performance

- [ ] **Q64. Minify player atlas.json + search-index.json (keep DM build pretty-printed).**
  In `scripts/build-atlas.ts`, both shipped artifacts are written with `JSON.stringify(project, null, 2)` (line 1004) and `JSON.stringify(searchIndex, null, 2)` (line 1007) for every build. Gate the indent on `flags.player`: write minified (drop the `null, 2`) for player/strict-player output, keep the 2-space pretty form for DM/`.local-atlas` builds so human diffs stay readable. Every consumer parses JSON regardless of whitespace — the client `loader.ts`, `scanArtifactShape`/`scanSearchIndex` in `scripts/check-artifact-shape.ts` (both `JSON.parse` the file at lines 261/271), and the SW cache — so nothing else changes.
  - **Done when:** a player build (`npm run atlas:build:player`) emits single-line `atlas.json` + `search-index.json`, a DM build (`npm run atlas:build`) still emits 2-space-indented files, and all safety scans stay green.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) + `npm run atlas:publish`.
  Touches shipped player artifacts — confirm `atlas:check-shape`/`check-secrets`/`check-derived` all still pass on the minified output.
  ~1 run.

- [ ] **Q65. Stop shipping the duplicated lowercased body in the search index; derive it at load.**
  `buildSearchIndex` in `scripts/build-atlas.ts` (lines 1284-1294) emits both `body: stripped.toLowerCase()` (for matching) and `bodyText: stripped` (for snippets) — the same (≤4000-char) stripped text differing only in case, a redundant copy in every entry. Ship only `bodyText`, and in `src/atlas/content/loader.ts` `loadSearchIndex` derive `body = bodyText.toLowerCase()` after `parseSearchIndex` so `parseSearchQuery.ts:48` and `SearchPalette.tsx` keep reading `e.body` unchanged. CRITICAL: `scanSearchIndex` in `scripts/check-artifact-shape.ts:221` secret-scans the raw `body` field — repoint that field entry to scan `bodyText` (the surviving field) so leak coverage isn't lost. `parseSearchIndex` (atlasGuard.ts:70) only requires id/title/type, so the absent `body` won't fail the guard.
  - **Done when:** shipped `search-index.json` entries carry `bodyText` but no `body`; in-app search still matches body text; `scanSearchIndex` scans `bodyText`; all scans green.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) + `npm run atlas:publish`.
  Touches a shipped artifact + the shape safety scan. Independent of Q64 (minify) — the two compose if both land.
  ~2–3 runs.

- [ ] **Q66. Lazy-load search-index.json on first search instead of at viewer startup.**
  `src/pages/AtlasViewer.tsx:232` eagerly runs `Promise.all([loadAtlasContent(true), loadSearchIndex()])` at mount, so every `/atlas` visit downloads+parses the full search index even for players who never open search. Keep `loadAtlasContent` on the critical path but defer `loadSearchIndex` (`src/atlas/content/loader.ts:34`) until the CommandPalette/SearchPalette first opens; add a lightweight loading state to the palette while the index resolves and memoize so it fetches only once. Behavior once open is identical to today.
  - **Done when:** initial `/atlas` load performs no search-index fetch (assert via test/network); the first search-open triggers the fetch once, shows a loading state, then behaves as before; reopening does not re-fetch.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing runtime only; no shipped-artifact change and no DM-secret surface.
  ~2–3 runs.

- [ ] **Q67. Add a dev `maps:optimize` tool (PNG→WebP source) mirroring `audio:transcode`.**
  Source map PNGs under `public/atlas/assets/maps` are the repo's heaviest files. Add `scripts/dev/optimize-maps.mjs` + a `maps:optimize` npm script mirroring the existing `scripts/dev/transcode-audio.mjs` / `audio:transcode` pattern (package.json:34): for each oversized source PNG, emit a `.webp` twin via `sharp` (already a devDependency) and rewrite the matching `layers[].src` in `public/atlas/assets/maps/world.yaml`. `.webp` is already allowlisted (`ALLOWED_IMAGE_EXTS` in `scripts/atlas/validateAsset.ts:32`). This is a DM-run dev step, explicitly NOT part of the gated build.
  - **Done when:** `npm run maps:optimize` converts oversized map PNGs to `.webp`, updates the matching `world.yaml` srcs, skips already-webp/small sources, and a subsequent `npm run atlas:build:player` still validates (webp allowlisted).
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Dev-only tool outside the gated pipeline; touches no player-build code path.
  ~2–3 runs.

- [ ] **Q68. Configure `manualChunks` so vendor libs get a cache-stable hash.**
  `vite.config.ts` sets no `build.rollupOptions.output.manualChunks`, so React, leaflet/react-leaflet, and the many `@radix-ui/*` packages are code-split only by route and re-hash whenever app code changes. Add `manualChunks` grouping stable vendors (react/react-dom/react-router, leaflet+react-leaflet, radix) into their own chunks so repeat-visit players re-download only changed app/content chunks. Because `__INCLUDE_EDITOR__` is a `define` replaced before tree-shaking, editor-only modules stay out of the player module graph — confirm no vendor chunk pulls `AtlasPlacementEditor`/editor modules into the player build.
  - **Done when:** a player `npm run build` emits distinct react/leaflet/radix vendor chunks; a no-op app-code change leaves vendor chunk hashes stable; the editor is still absent from player output.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) + `npm run atlas:publish`.
  Touches the bundler config that produces the player build — verify the `__INCLUDE_EDITOR__` tree-shake gate still holds.
  ~1 run.

- [ ] **Q69. Bound vitest fork count/memory in `vitest.config.ts` so `npm test` stops OOMing.**
  `vitest.config.ts` sets no `poolOptions`; the whole-suite `npm test` (vitest run) OOMs the 4GB coordinator on ~200 files and currently needs ad-hoc `--shard` / `--poolOptions.forks.maxForks=3` to survive. Bake sane defaults into the `test` block: `pool: 'forks'` with a bounded `poolOptions.forks.maxForks` (plus matching minForks/isolate settings) so the plain `npm test` gate is robust without flags; document the memory rationale inline. Confirm wall-time doesn't regress meaningfully.
  - **Done when:** `npm test` with no extra flags runs the full suite to completion without OOM on a 4GB budget, and total runtime stays within a reasonable margin of the sharded run.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) — this change hardens that gate itself.
  ~1 run.

- [ ] **Q70. Clean up stale `.fog.png` outputs before regenerating redacted maps.**
  `redactMapsForPlayer` in `scripts/build-atlas.ts` writes `${base}.fog.png` (lines 1247-1248) but never removes prior redacted outputs, so renaming/removing a map layer orphans a `.fog.png` in `public/atlas/assets/maps` that vite still copies into `dist` and ships to players forever. Before writing, prune the map's previously-generated `.fog.*` files (or write this build's fog outputs into a tracked set and delete any `.fog.*` not re-emitted). Scope the delete strictly to the `.fog.*` output naming so it can never touch a source map image.
  - **Done when:** a build that drops or renames a fogged layer leaves no orphan `.fog.png` behind; freshly emitted redacted maps are byte-identical to before; `check-fog-safety`/`check-derived` stay green.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) + `npm run atlas:publish` + `npm run atlas:publish:integrity-smoke`.
  Fog redaction path — delete only regenerated `.fog.*` outputs (never source images), and prune before re-emitting.
  ~2–3 runs.

- [ ] **Q71. Enable incremental typecheck (tsBuildInfoFile) for the gate's tsc pass.**
  `tsconfig.app.json` sets `skipLibCheck`/`isolatedModules`/`noEmit` but not `incremental`/`tsBuildInfoFile`, so `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) does a full cold check on every gate run. Add `incremental: true` + an explicit `tsBuildInfoFile` (TypeScript 5.8, per package.json, writes the buildinfo even under `noEmit`) so repeated typechecks in the hourly routine reuse prior results; apply the same to `tsconfig.node.json` if it feeds a checked pass. Gitignore the buildinfo path so it doesn't pollute the tree or perturb CI (which starts cold anyway).
  - **Done when:** a second consecutive `npm run typecheck` reuses the buildinfo and is measurably faster, the `.tsbuildinfo` file is gitignored, `git status` stays clean, and typecheck results are unchanged.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.


#### Q-J — CI/CD & developer experience

- [ ] **Q72. Run the full safety-scan orchestrator on pull requests.**
  `.github/workflows/atlas-pr-check.yml` (the `scan` job, steps at lines 45–56) only runs `atlas:check-secrets`, `atlas:check-shape`, and `atlas:check-derived` — 3 of the 12 scans. Replace those two ad-hoc `run:` steps with a single `npm run atlas:scan` step (the publish-orchestrator at `scripts/atlas/publish-orchestrator.ts`, already used post-merge in `publish-atlas.yml:62`), so fog-safety, image-privacy, player-secrets, and audit-assets leaks are caught pre-merge too. The existing 'Build player-safe atlas' + 'Build site' steps (lines 37–43) already populate `public/atlas` and `dist` before the scan, and the orchestrator resolves `contentRoot` from `atlas.config.json` in the checkout (`resolveContentDir`).
  - **Done when:** the PR scan job invokes `npm run atlas:scan` in place of the individual check-secrets/check-shape/check-derived steps; all 12 orchestrator scans execute against `dist` and `public/atlas`; `npm run atlas:publish` passes locally on a fresh build.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) + npm run atlas:publish.
  Reinforces the safety-scan invariant rather than weakening it; no product surface change. ~1 run.

- [ ] **Q73. Add a sharded vitest job to CI.**
  Neither `.github/workflows/atlas-pr-check.yml` nor `publish-atlas.yml` runs the test suite (~2400 tests across ~150 files), so failing tests can merge. Add a matrix job to `atlas-pr-check.yml` with `strategy.matrix.shard: [1,2,3,4]` running `npx vitest run --pool=forks --poolOptions.forks.maxForks=3 --shard=${{ matrix.shard }}/4` — the exact OOM-avoiding invocation documented in `docs/CODEBASE_MAP.md` (Invariant 7, line 317) — with all four shards required green. Reuse the existing `actions/checkout` + `npm ci` setup.
  - **Done when:** a 4-way shard matrix job runs on every PR; each shard is a required check; a deliberately failing test turns the job red.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  CI-remote result is only partially verifiable locally; if a lone shard exits 1 on a worker↔coordinator RPC timeout (not a real failure), re-run that shard alone to disambiguate, per CODEBASE_MAP. Can call `npm run test:ci` instead if Q76 has landed. ~2–3 runs.

- [ ] **Q74. Add an ESLint step to PR CI.**
  CI never runs ESLint — only the pre-commit hook (`scripts/pre-commit.sh:10`, `npx eslint .`) and the autonomous routine do — so a contributor or merge without hooks installed can land lint errors, including a reintroduced dynamic `require()` that the custom `no-restricted-syntax` rule in `eslint.config.js` (lines 35–42) exists to block. Add a `npm run lint` step to the `scan` job in `.github/workflows/atlas-pr-check.yml`, after the typecheck step.
  - **Done when:** the PR workflow runs `npm run lint`; an introduced lint error fails the job; the 16 known warnings do NOT fail it.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Do not add `--max-warnings 0` — `eslint .` fails only on errors, and the known warnings must stay non-fatal. ~1 run.

- [ ] **Q75. Add .gitattributes to normalize line endings to LF.**
  There is no `.gitattributes`, and `.prettierrc.json` sets no `endOfLine` (prettier defaults to `lf`), so on Windows `core.autocrlf` checks source out as CRLF while the index stores LF and local `npm run format:check` reports ~200 false positives (documented in memory). Add a `.gitattributes` with `* text=auto eol=lf` plus binary rules (`*.png *.jpg *.jpeg *.webp *.ogg *.mp3 *.woff2 *.fog.png` → `binary`) so the working tree matches what CI's `prettier --check` expects.
  - **Done when:** `.gitattributes` exists with `eol=lf` for text and `binary` rules for image/audio/fog asset types; `git add --renormalize .` produces no content diff (the index is already LF).
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Keep it to adding the file — do NOT run `npm run format` or mass-rewrite committed content. ~1 run.

- [ ] **Q76. Codify the sharded test invocation as a `test:ci` npm script.**
  The OOM-avoiding shard command exists only as prose in `docs/CODEBASE_MAP.md` (line 317) and the code-quality routine doc — `scripts/dev/` holds only `generate-starter-ambience.mjs` and `transcode-audio.mjs`, and `package.json` has no `test:ci`. Add a cross-platform runner `scripts/dev/run-sharded-tests.mjs` (Node, spawns the four shards with `npx vitest run --pool=forks --poolOptions.forks.maxForks=3 --shard=N/4`, aggregates pass/fail, exits non-zero if any shard fails) plus a `"test:ci": "node scripts/dev/run-sharded-tests.mjs"` script, so humans, CI, and the routine share one command instead of copy-pasting four.
  - **Done when:** `npm run test:ci` runs all four shards and returns the aggregate exit code; a failing test makes it exit non-zero.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.

- [ ] **Q77. Type-check the `scripts/` build pipeline.**
  No tsconfig includes `scripts/**`: `tsconfig.app.json` covers only `src`, `tsconfig.node.json` only `vite.config.ts`, so `build-atlas.ts`, the `check-*.ts` scanners, `scripts/atlas/*.ts`, and `vite-plugin-atlas-save.ts` are transpile-only via tsx and never type-checked. Add `tsconfig.scripts.json` (`include: ["scripts/**/*.ts"]`, `noEmit`, `strict`, node/bundler settings mirroring `tsconfig.node.json`), register it as a project reference in `tsconfig.json`, add `"typecheck:scripts"` and a `"typecheck:all"` (app + scripts) to `package.json`, and wire `typecheck:all` into `scripts/pre-commit.sh` and the `atlas-pr-check.yml` typecheck step. Fix any latent type errors surfaced.
  - **Done when:** `npm run typecheck:scripts` type-checks all of `scripts/**` and passes; pre-commit and PR CI run it; `noEmit` holds (no JS written).
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Config/typecheck only, no behavior change; if it surfaces many latent errors, fix them in the same task rather than splitting. ~2–3 runs.

- [ ] **Q78. Add a single `verify` script that runs the whole merge gate.**
  There is no one command that runs the full gate; contributors and the routine chain `typecheck` + `lint` + sharded tests by hand. Add `"verify": "npm run typecheck && npm run lint && npm run test:ci"` to `package.json` and document it as the pre-push check in `docs/QUICK_START.md` and `docs/CODEBASE_MAP.md`.
  - **Done when:** `npm run verify` runs typecheck, then lint, then the sharded suite, and fails fast if any stage fails; both docs mention it as the pre-push command.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Depends on Q76 (`test:ci`) — land Q76 first or bundle the two. ~1 run.

- [ ] **Q79. Add an ESLint guard against editor-only imports in player entry files.**
  Rescoped: a FLAT project-wide `no-restricted-imports` ban on `@/atlas/save/*` is unsafe — those modules are legitimately, statically imported by editor-internal code (`src/atlas/categories/EntityEditPanel.tsx`, `src/atlas/import/useMdImportFlow.ts` + `buildImportChanges.ts`, `src/atlas/editor/saveGate.ts`, `src/atlas/tabs/EntitiesTab.tsx`, `src/atlas/secrets/CharacterKeysPanel.tsx`) that all tree-shake together; a flat rule would error on every one. Instead add an `eslint.config.js` override block scoped (`files: [...]`) to the player-graph entry modules — `src/main.tsx`, `src/App.tsx`, and the lazy non-editor routes `src/pages/{Landing,AtlasViewer,AtlasTimeline,AtlasBrowse,AtlasCredits,NotFound}.tsx` plus `src/atlas/secrets/CharacterSecretsPage.tsx` — with `no-restricted-imports` patterns banning `@/pages/AtlasPlacementEditor` and `@/atlas/save/*`. This is a fast lint tripwire in front of the existing `EDITOR_CODE_FINGERPRINTS` build scan in `scripts/check-no-secrets.ts`. `App.tsx` loads the editor via dynamic `import()`, which `no-restricted-imports` does not match, so no false positive.
  - **Done when:** statically importing a banned editor module from any listed entry file is an ESLint error; `npm run lint` still passes on the current tree (none of the entry files import editor code today); test files are unaffected (not in the scoped `files` list).
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-internal static imports of `@/atlas/save/*` stay legal (out of scope of the override); dynamic `import()`/`lazy()` stays exempt by rule design. ~1 run.


#### Q-K — Code health & refactor

- [ ] **Q80. Extract shared browser file/image read helpers.**
  Create `src/atlas/content/browserFile.ts` exporting `fileToDataUrl(file: File): Promise<string>` (FileReader → readAsDataURL) and `readImageSize(src: string): Promise<{w:number;h:number}>` (Image.onload → naturalWidth/Height), then replace the duplicated copies: MapImportWizard's `readDataUrl` (MapImportWizard.tsx:791) and `readImageDimensions` (:800), and useMapLayers' `fileToDataUrl` (useMapLayers.ts:114) + `readImageSize` (:104). Also route EntityEditPanel's inline `handleImageImport` readAsDataURL (EntityEditPanel.tsx:259-267) through `fileToDataUrl`. Two subtleties to preserve: useMapLayers' readImageSize sets `img.crossOrigin = "anonymous"` (line 107) while the wizard copy does not — unify on setting it (harmless for data URLs, required for URL-added layers). EntityPanel.tsx:146-163 `handleImport` uses `readAsText` (notes JSON) — a different read; leave it OUT of scope, do not force it through the dataURL helper.
  - **Done when:** the four dataURL/image-size copies are gone, all call sites import from browserFile.ts, crossOrigin behavior is retained, and tests are green.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Keep browserFile.ts dependency-free (pure DOM) so it pulls in no editor modules and stays player-safe.
  ~1 run.

- [ ] **Q81. Add downloadBlob() and dedupe blob-download call sites.**
  In `src/atlas/tabs/download.ts` add `downloadBlob(filename, blob, opts?: { toast?: boolean })` (createObjectURL → anchor → click → revokeObjectURL; `toast.success` only when `opts.toast`), and refactor the existing `downloadText` (download.ts:4) to build the Blob and delegate to it with `{ toast: true }`. Replace MapImportWizard's private `triggerBlob` (MapImportWizard.tsx:809) and EntityPanel's inline export block (EntityPanel.tsx:135-143) with `downloadBlob(name, blob, { toast: false })` — both currently download silently.
  - **Done when:** `triggerBlob` and the inline anchor block are gone, `downloadText` still toasts, and the MapImportWizard/EntityPanel exports still download without a toast; tests green.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  EntityPanel's handler appends the anchor to `document.body` before click and removes it (Firefox safeguard) — have `downloadBlob` append+remove so that path is preserved.
  ~1 run.

- [ ] **Q82. Extract useExternalRebuildDetector hook from the editor.**
  Move the self-contained rebuild-conflict unit out of `AtlasPlacementEditor.tsx` (lines ~251-297): the `externalRebuildAt` state, the 30s polling `useEffect` that compares `loadAtlasContent(true).publishedAt` against the loaded `project.publishedAt` and toasts "Canon rebuilt externally", and `reloadCanon()`. Create `src/atlas/session/useExternalRebuildDetector.ts` taking the loaded project + a `setProject` callback and returning `{ externalRebuildAt, reloadCanon }`. Preserve the `// eslint-disable-next-line react-hooks/exhaustive-deps` on the `[project?.publishedAt]` dep and the `cancelled` flag + timer cleanup exactly.
  - **Done when:** editor behavior is identical (background rebuild toast + Reload-canon still work), the polling logic lives in the new hook, the editor consumes it, and tests pass.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only: keep the hook under src/atlas/session and import it only from the editor entry so it stays tree-shaken from player builds (invariant 4).
  ~1 run.

- [ ] **Q83. Tighten webkitAudioContext window cast off `any`.**
  In `src/atlas/sound/realAudioDeps.ts:4`, replace `(window as any).webkitAudioContext` with a narrow typed cast: `(window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext`. No runtime change — `createContext` still prefers `window.AudioContext` and falls back to the webkit-prefixed constructor.
  - **Done when:** the module has no non-test `as any`, typecheck + lint pass, and AudioContext creation behavior is unchanged.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.

- [ ] **Q84. Extract shared draft-mutation core from region/route draft hooks.**
  `useRegionDraft.ts` (draftRef + applyDraft :92-100, mutateDraft :107-122, dirty/dirtyCount :143-145) and `useRouteDraft.ts` (:82-90, :92-107) hold near-identical undo-integrated draft machinery over a `{ edits, added, deleted }` shape. Extract a generic `useDraftCore<T extends { edits: Record<string, unknown>; added: unknown[]; deleted: string[] }>(initial, undoStack?)` into `src/atlas/editor/useDraftCore.ts` exposing `{ draft, applyDraft, mutateDraft, dirty, dirtyCount }` (mutateDraft keeps the before/after snapshot + `undoStack.push({ undo, redo, label })` pattern verbatim). Have both hooks consume it; keep collection-specific logic (points vs waypoints, resolveWaypoint, centroid, effective/issues) in the callers.
  - **Done when:** both hooks delegate draftRef/mutateDraft/dirty computation to useDraftCore, the public RegionDraftAPI/RouteDraftAPI are unchanged, and the region/route draft + undo tests stay green.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only hooks — keep useDraftCore under src/atlas/editor; no player-entry import.
  ~2–3 runs.

- [ ] **Q85. Centralize atlas↔latlng flat-CRS coordinate helpers.**
  Add `src/atlas/map/coords.ts` with `atlasToLatLng(x, y, height): [number, number]` (returns `[height - y, x]`) and `latLngToAtlas(lng, lat, height): { x: number; y: number }` (returns `{ x: lng, y: height - lat }`) as the single home of the flat-CRS convention (lng = x, lat = mapHeight − y — invariant 3). Route the three existing sites through it: editor's `mapClickToAtlasCoord` (mapClickCoord.ts:6) delegates to `latLngToAtlas` then rounds; viewer FlyTo `lat = flyTo.height - flyTo.y` (AtlasViewer.tsx:108) uses `atlasToLatLng`; geometry.ts gridLines' hex vertex `[map.height - vy, vx]` (:79) uses `atlasToLatLng`. Pure math, no rendering — keep coords.ts dependency-free so the player viewer imports it safely.
  - **Done when:** all three sites compute their flip via coords.ts, the flip direction is byte-for-byte unchanged, existing geometry/mapClickCoord tests pass, and a small round-trip unit test is added.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Preserve invariant 3 exactly (lat = mapHeight − y, lng = x) — this is a consolidation, not a behavior change.
  ~1 run.

- [ ] **Q86. Split MapImportWizard step components into modules.**
  `src/atlas/import/MapImportWizard.tsx` (815 lines) defines every wizard step inline: `SelectStep` (:312), `ModeStep` (:377), `ConfigureStep` (:443), `SizingStep` (:561), `PreviewStep` (:643), `ExportStep` (:706), plus helpers `IssueList` (:749) and `Field` (:780). Move each into its own file under `src/atlas/import/wizard-steps/`, keeping props and behavior byte-for-byte, and re-import them into the orchestrator. The shared browser helpers (`readDataUrl`/`readImageDimensions`/`triggerBlob`, :791-815) must be imported by the steps that need them, not copied per-file.
  - **Done when:** MapImportWizard.tsx holds only the orchestrator + step wiring, each step lives in its own module, and the import-wizard tests pass unchanged.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only file — keep new modules under src/atlas/import so they stay tree-shaken from player builds (invariant 4). Loosely depends on Q80/Q81 if the shared helpers have been extracted.
  ~2–3 runs.

- [ ] **Q87. Split EntitiesTab section components into modules.**
  `src/atlas/tabs/EntitiesTab.tsx` (762 lines) inlines `EntityForm` (:198), `ProfileSection` (:336), `ListField` (:403), `RelationshipSection` (:454), and `HandoutBundleSection` (:638) alongside the tab shell (`EntitiesTab` :69). Extract each into its own file under `src/atlas/tabs/entities/`, keeping props and behavior byte-for-byte, and import them back into EntitiesTab.
  - **Done when:** EntitiesTab.tsx holds only the tab shell + imports, each section is its own module, and the EntitiesTab / entity-editing tests pass unchanged.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Editor-only file — keep the new modules under src/atlas/tabs so they remain excluded from player builds (invariant 4).
  ~2–3 runs.


#### Q-L — Resilience & error handling

- [ ] **Q88. Shared offline-aware atlas load-state across reader pages.**
  Five reader pages each do `loadAtlasContent(true).then(setProject).catch(e=>setError(e.message))` with a bespoke loading/error render; only `src/pages/AtlasViewer.tsx` (error screen ~lines 440-465) is offline-aware, while `AtlasBrowse.tsx`, `AtlasTimeline.tsx`, `AtlasCredits.tsx` (dumps the raw string in `text-destructive`, line ~86) and `src/atlas/secrets/CharacterSecretsPage.tsx` (line ~130) show inconsistent, non-navigable failures. Extract a presentational `<AtlasLoadState>` (offline-aware copy: "Atlas not available offline yet" vs the error message, plus a Back link and a Loading… branch) under `src/atlas/content/`, and a `useAtlasContent()` hook wrapping the load for the four simple pages. Adopt the shared render in all five (AtlasViewer keeps its own `Promise.all` + deep-link effect but renders `<AtlasLoadState>` for its error/loading branches).
  - **Done when:** all five pages render the same offline-aware loading + error UI via the shared component; the four non-viewer pages load through `useAtlasContent()`; no page dumps a bare error string; a unit test covers the `<AtlasLoadState>` offline-vs-error branch.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing; touches no generated artifacts. May land page-by-page (each adoption independently passes the gate). Coordinate with Q89/Q94, which also touch AtlasViewer's load effect.
  ~2–3 runs.

- [ ] **Q89. Degrade gracefully when search-index.json fails to load.**
  `src/pages/AtlasViewer.tsx:232` loads via `Promise.all([loadAtlasContent(true), loadSearchIndex()])`, so a missing/corrupt `search-index.json` rejects the whole promise and the full map + entities are replaced by the "Atlas not built yet" error screen even though `atlas.json` is fine. Decouple the two: treat `atlas.json` as primary (its failure → error screen) and load the search index separately; on search-index failure keep rendering the map/entity panels, fall back to an empty index (or a lightweight index derived from `project.entities`), and log the failure via `logger.error` (`src/lib/logger.ts`). Search degrades instead of blanking the app.
  - **Done when:** a rejected `loadSearchIndex()` no longer triggers the error screen; the map + entity panel still render; search silently falls back to an empty/derived index; the failure is logged through the logger seam; a test asserts the map renders when the search-index load rejects.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing; no artifact change. Overlaps AtlasViewer's load effect with Q88/Q94.
  ~2–3 runs.

- [ ] **Q90. Make ErrorBoundary route-scoped and resettable.**
  `src/components/ErrorBoundary.tsx` is a single top-level boundary carrying only `hasError`; it wraps the whole `Suspense`/`Routes` subtree in `src/App.tsx:46`, and once it catches, recovery is only `window.location.reload()` or a hard `href="/atlas"` anchor — client-side navigation does NOT clear the error. Add `resetKeys`/`onReset` support to ErrorBoundary (reset `hasError` when a key changes) and wrap it inside `<BrowserRouter>` with a small `useLocation()`-keyed component so navigating to a new route clears a caught error. Optionally add a second boundary around the EntityPanel body so a malformed single entity doesn't nuke the whole map. Keep the existing fallback UI.
  - **Done when:** ErrorBoundary accepts `resetKeys` and resets when they change; navigating to a different route after a caught error recovers without a full reload; `src/test/error-boundary.test.tsx` covers the reset-on-key-change path.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ErrorBoundary is a class component — the location key must be supplied by a hook wrapper, not read inside the class.
  ~2–3 runs.

- [ ] **Q91. Route uncaught async errors through the logger seam.**
  `src/lib/logger.ts` is documented as "the single seam for app diagnostics," but only React render errors reach it (via `ErrorBoundary.componentDidCatch`); unhandled promise rejections and non-React runtime errors bypass the seam and hit the console directly. Add a tiny `installGlobalErrorHandlers()` (new file under `src/lib/`) that registers `window.addEventListener('unhandledrejection', …)` and `window.addEventListener('error', …)` and forwards both to `logger.error`, and call it once from `src/main.tsx`. Guard against double-registration so it is idempotent.
  - **Done when:** `main.tsx` installs the global handlers once at startup; an `unhandledrejection` and a window `error` event both forward to `logger.error`; a unit test asserts both events reach the logger (with a stubbed logger).
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Infra only; no UI surface, no artifact change.
  ~1 run.

- [ ] **Q92. Honest Secrets-page message when Web Crypto is unavailable.**
  `src/atlas/secrets/CharacterSecretsPage.tsx` decrypts via `decryptSecret` (`src/atlas/secrets/secretCrypto.ts`), which needs `crypto.subtle` — undefined in a non-secure context (a player opening the site over plain `http://` on a LAN/self-host). `decryptSecret` swallows the failure and returns null (secretCrypto.ts:72-74), so `collectCharacterSecrets` returns `[]` and the page shows the misleading "No secrets found for that key. Check it with your DM." (line ~98). Detect `window.isSecureContext === false` or a missing `globalThis.crypto?.subtle` up front (in the page or `SecretsBody`) and show an honest message ("Secrets need a secure https connection to unlock on this device") instead of the wrong-key copy.
  - **Done when:** when `crypto.subtle` is unavailable / the context is insecure, the page shows the secure-context message and NOT the "no secrets / check with your DM" copy; the normal wrong-key path is unchanged when crypto is available; a unit test covers the insecure-context branch.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing secrets surface: capability detection + message only — do NOT change decryption logic or ever surface secret content.
  ~1 run.

- [ ] **Q93. Unify broken-image fallback across lightbox, hover-peek, and asset previews.**
  `src/atlas/entity/EntityPanel.tsx`'s `ImageThumb` (lines ~246-272) has a tidy dashed "Image missing" `onError` placeholder, but three sibling `<img>` renders don't: the EntityPanel lightbox img (line ~515 — a thumbnail that loads but whose full image 404s shows a blank black dialog), `src/atlas/peek/HoverPeekCard.tsx`'s thumbnail (line ~35, browser broken-image glyph), and `src/atlas/assets/AssetManagerPanel.tsx`'s preview (line ~48). Extract the `ImageThumb` fallback into a small reusable `<AtlasImage>` (or `useImgFallback`) in a player-safe module and use it in all three spots so every image degrades to the same "Image missing" box.
  - **Done when:** the lightbox, HoverPeekCard, and AssetManagerPanel images all render the shared "Image missing" fallback on `onError`; `ImageThumb` is refactored onto the shared primitive (or kept behavior-identical); a unit test asserts the fallback appears on image error.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  `AssetManagerPanel` is editor-only (`__INCLUDE_EDITOR__`-gated): the shared `<AtlasImage>` must be a plain presentational component with NO editor imports, so the player entry points (EntityPanel, HoverPeekCard) can import it and it stays tree-shaken-safe.
  ~2–3 runs.

- [ ] **Q94. Add a Try-again retry to the atlas load-error screen.**
  When `atlas.json` fails to load, `src/pages/AtlasViewer.tsx`'s error screen (~lines 440-465) offers only "Back to home"; the sole retry path is a full browser reload. Add a "Try again" button that re-runs the load (`loadAtlasContent(true)` + `loadSearchIndex()`) in place and clears `error` on success without a page reload (reset the load effect, e.g. via a retry-nonce state or an extracted load callback). Optionally auto-retry once on the `window` `online` event — the error screen already reads `navigator.onLine`.
  - **Done when:** the error screen shows a "Try again" action that re-attempts the load and clears the error on success without a full reload; a failing-then-succeeding load reaches the map after clicking retry (unit test with a mocked loader).
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Depends on / overlaps Q88 & Q89 (all touch AtlasViewer's load): if Q88's shared load-state ships first, fold the retry into `<AtlasLoadState>`/`useAtlasContent()` rather than AtlasViewer directly.
  ~1 run.


#### Q-M — Docs & authoring tooling

- [ ] **Q95. Correct the "three safety scanners" claim to the real count across all docs.**
  `scripts/atlas/publish-orchestrator.ts` (run by `atlas:publish`) executes SEVEN scan modules — check-no-secrets, check-derived-secrets, check-artifact-shape, check-image-privacy, check-fog-safety, check-player-secrets (six player-safety scanners) plus audit-assets (asset budget/license audit) — yet the docs still say "three" and describe only three. Rewrite `docs/VISIBILITY_AND_PLAYER_SAFETY.md`'s "## The three safety scanners" section (line 107): rename the heading, fix the chained-command block (lines 111-119), and add bullets for check-image-privacy, check-fog-safety, and check-player-secrets with a one-line "what it catches" each (note audit-assets separately). Also fix the "three safety scanners" wording in `docs/QUICK_START.md` line 104, `docs/PRODUCT_SPEC.md` line 41, and `docs/README.md` line 17, and expand the main `README.md` scanner table (lines 561-569, currently only check-secrets/check-derived/check-shape). Note there is no `atlas:check-player-secrets` npm alias — it runs only inside the orchestrator.
  - **Done when:** no doc says "three safety scanners"; the safety doc lists all six safety scanners + audit-assets each with a "what it catches" line; QUICK_START/PRODUCT_SPEC/README wording matches the real scan set.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Docs-only; overlaps `QUICK_START.md` with Q97 (different lines) — any order is fine. ~1 run.

- [ ] **Q96. Refresh KNOWN_LIMITATIONS.md rows that shipped features contradict.**
  Five rows in `docs/KNOWN_LIMITATIONS.md` now contradict reality — update each: line 30 image embeds `![[image.png]]` (✗ unsupported → ✓ supported for IMAGE embeds, per `docs/MARKDOWN_PARITY.md` line 31; keep note/section embeds `![[Note]]` explicitly out of scope); line 31 callouts `> [!type]` (✗ blockquote → ✓ foldable, core type set + aliases, MARKDOWN_PARITY line 27); line 83 "No phrase search — not yet" (shipped — `src/atlas/search/parseSearchQuery.ts` exports quoted-phrase parsing + `matchesPhrases`); line 62 "Starter loops ship uncompressed WAV — planned" (shipped — `content/astrath-deeprealm/_atlas/world.yaml` beds use `.ogg` `src` + `.m4a` `srcFallback`); line 130 "Asset license tracking — not yet" (shipped as asset credits — `assetCredits` registry in `scripts/atlas/loadWorldConfig.ts` + `src/pages/AtlasCredits.tsx`).
  - **Done when:** all five rows read accurately and are moved out of the "unsupported / not-yet" framing; no remaining KNOWN_LIMITATIONS row contradicts MARKDOWN_PARITY; the block-reference `[[Note#^id]]` row (line 32) is left as-is (still unsupported, a stated non-goal).
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Docs-only. ~1 run.

- [ ] **Q97. Fix QUICK_START seed-world config bug and leading-slash asset anti-pattern.**
  `docs/QUICK_START.md` step 3 (lines 36-37) tells the reader to set `contentRoot: "examples/seed-world"` and `defaultWorld: "seed"`, but `loadWorldConfig` joins `contentRoot/worldId/_atlas/world.yaml` (`scripts/atlas/loadWorldConfig.ts:156`), so that resolves to the non-existent `examples/seed-world/seed/_atlas/world.yaml`. Change it to `contentRoot: "examples"`, `defaultWorld: "seed-world"` (→ `examples/seed-world/_atlas/world.yaml`). Also step 4 line 71 teaches `src: /atlas/assets/maps/my-map.png`; the leading slash trips `scripts/atlas/validateAsset.ts`'s `absolute-path` warning (`raw.startsWith("/")`, line 110). Change it to the relative `atlas/assets/maps/my-map.png` form the real world.yaml configs use.
  - **Done when:** the step-3 config resolves to the real seed world.yaml path; no asset `src` in QUICK_START starts with `/`.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Docs-only; overlaps `QUICK_START.md` with Q95 (line 104) — different lines, any order. ~1 run.

- [ ] **Q98. Ship a world.yaml JSON Schema for editor autocomplete and validation.**
  No JSON Schema exists for world.yaml (no `*.schema.json` in the repo), so hand-authoring in VS Code/Obsidian gets no autocomplete or inline validation. Author a JSON Schema (e.g. `schemas/world.schema.json`) covering the shape `scripts/atlas/loadWorldConfig.ts` accepts: `schemaVersion`, `maps` (with `scale`, `grid`, `water`, `soundscape`, `layers`), `regions`, `routes` (+ `mode`/waypoints), `fog`, `calendar` (+ `months`), `import.folders`/`defaultFolder`, `credits`, `assetCredits`. Add a `# yaml-language-server: $schema=...` header line to `examples/seed-world/_atlas/world.yaml` and `content/astrath-deeprealm/_atlas/world.yaml`, and add a vitest that loads both real world.yaml files and validates them against the schema so it can't drift. Keep it permissive (allow extra keys where the loader tolerates them) so it never rejects a currently-valid file.
  - **Done when:** schema file exists; both world.yaml files carry the `$schema` reference and validate green in the new test; the test fails when a world.yaml violates the schema.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) + npm run atlas:publish (edits two build-input world.yaml files — confirm the header comment doesn't perturb the build/scans).
  Visibility vocab (invariant 1): keep `visibility` a plain string in the schema — the loader/`src/atlas/content/visibility.ts` owns the canonical player|dm|hidden|rumor set; do NOT hardcode/fork that enum into the schema. ~2-3 runs.

- [ ] **Q99. Give the seed world a tiny placeholder map so the first build shows a map.**
  `examples/seed-world/_atlas/world.yaml` ships `layers: []` (line 38), so QUICK_START's "reload /atlas to see the seed map" shows only empty ocean + grid — an anticlimactic first run. Add one small, generic, license-clean placeholder image (PNG or WEBP, well under `ASSET_SIZE_BUDGET_BYTES`) and wire a single layer into the `mistmoor-overview` map (2000×1500, relative `src` with NO leading slash, e.g. `atlas/assets/maps/seed-placeholder.png`). Commit the image where the build's asset resolver finds it (under `public/atlas/assets/...`, matching how `scripts/atlas/validateAsset.ts` / `audit-assets` resolve paths) so `atlas:build` and the asset scan pass. Update `examples/seed-world/README.md` and `docs/QUICK_START.md` to note a placeholder ships and how to swap it.
  - **Done when:** the seed build renders a visible placeholder layer; the image is a generic allowed-extension file under the size budget; `atlas:publish` scans (secrets/derived/image-privacy/audit-assets) stay green; README + QUICK_START mention the placeholder and swap steps.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest) + npm run atlas:publish.
  Player-facing shipped asset: must be generic (no DM/secret content), an allowed extension (png/jpg/webp), and under ASSET_SIZE_BUDGET_BYTES so the asset + secret scans stay green. ~2-3 runs.

- [ ] **Q100. Add a build-smoke test that keeps the documented seed-world path green.**
  QUICK_START points onboarding users at `examples/seed-world`, but no test exercises that path, so a schema/loader change can silently break the advertised flow (no `src/test` file references seed-world today). Add a vitest under `src/test` that calls `loadWorldConfig("examples", "seed-world")` (`scripts/atlas/loadWorldConfig.ts`) and asserts it returns without throwing `WorldConfigError`, produces the `mistmoor-overview` map, and yields the "Calendar of the Hollow Year" calendar with its 4 months (Frostfall/Greenrise/Highsun/Emberfade). Optionally extend to a minimal `scripts/build-atlas.ts` pass over the seed folder.
  - **Done when:** a test loads `examples/seed-world/_atlas/world.yaml` via `loadWorldConfig` and asserts the map + calendar; it fails if the seed world.yaml or loader contract drifts.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Independent of Q99 (the seed loads fine with `layers: []` since `maps.length > 0`); complements it. ~1 run.

### P — Refuel 2026-06-20 (player secrets — blessed by the DM)

> DM-directed feature refuel. Build **P1** — one substantial feature across **6 phases** (19 TDD tasks).
> **Read the design doc and the plan in full before each phase.** Phase 1 (schema + build-time leak scan)
> is self-contained and ships first. No server, no accounts.

- [x] **P1. Player Secrets — sealed reveals & character keys (player site).** ✅ DONE 2026-06-20 *(Phase 1 ✅ `174a4f23`; Phase 2 ✅ `e0f8380e`; Phase 3 ✅ `888ced5a`; Phase 4 ✅ `8edd67be`; Phase 5 ✅ `c7050483`; Phase 6 ✅ `34bbd2f3` — ship gate passed, 1740/1740 tests, all 12 scans clean)*
  **Design:** `docs/superpowers/specs/2026-06-17-player-secrets-design.md` — **read in full first.**
  **Plan:** `docs/superpowers/plans/2026-06-17-player-secrets.md` — **read in full; follow task-by-task.**
  Lets the DM embed encrypted secrets in player-facing entity pages. Two modes: (1) a **per-secret
  password** (a sealed box visible to all, unlocked by typing the right phrase — shown as an unopened
  envelope until solved); (2) a **per-character key** (the secret is invisible to everyone except the
  character whose key matches, revealed only after the owner signs in). Decryption is entirely
  client-side (no server, no accounts); plaintext never ships in the player build at rest; a new
  build-time scan (`check-player-secrets`, wired into the publish orchestrator) fails `atlas:publish`
  if any secret text leaks into the player bundle. No new server surface; fits the existing secrecy model.
  - Phases (order matters): **1** — schema (`AtlasSecretSpec`, `Entity.secrets`, `MapPlacement.secretId`)
    + build helpers (`buildSecrets.ts`, `stripSecretMarkers.ts`) + `check-player-secrets` leak scan
    registered in the publish orchestrator; **2** — client-side crypto (`secretCrypto.ts` — seal +
    character-key derivation); **3** — `SecretBox` component (sealed UI, passphrase unlock, character-key
    gate, sanitizer allow-list for `data-secret-id`); **4** — DM authoring (two toolbar "Add secret"
    buttons + `EntityEditPanel` field + `CharacterKeysPanel` in the editor rail); **5** — player-site
    integration (`EntityPanel` mount, `CharacterSecretsPage`, always-visible nav route); **6** — ship
    gate (full sharded suite + secrecy re-confirm + atlas:publish green).
  - **Touches the build pipeline** (new `check-player-secrets` scan registered in the publish
    orchestrator) → gate ALSO requires `npm run atlas:publish` green (proves the new scan ran clean
    against both `dist/` and `public/atlas/`).
  - **Mandatory secrecy invariant:** `check-player-secrets` must fail publish if any secret cleartext,
    passphrase, or character key appears in the player bundle. A fortress self-test — hand-authored
    secret in the real vault round-tripped through build, with only ciphertext in `atlas.json` and
    `search-index.json` — must pass before Phase 6 closes.
  - **Editor gate:** DM authoring code (Phases 4–5) is imported from `AtlasPlacementEditor` only
    (already `__INCLUDE_EDITOR__`-gated). The player-facing `SecretBox` component (Phase 3) is
    player-runtime — verify it carries no decrypt path that accepts a raw key.
  - **Autonomy guard:** Phase 1 (schema + scan) ships first and is fully self-contained. If client-side
    crypto (Phase 2) can't be made portable across target browsers within two attempts in the same area,
    hand back with a note.
  - Done when: the DM can author a per-secret-password secret and a per-character-key secret; players
    see the sealed box and can unlock it with the right phrase (or it reveals only for the right
    character); `check-player-secrets` catches any plaintext leak; full gate + atlas:publish green.
    ~4–6 runs across the phases.

### M — Refuel 2026-06-18 (joyful wayfinding — blessed by the DM)

> DM-directed feature refuel from a design session. Build **M1** — one substantial feature in **two halves**:
> Wander (plan Tasks 1–8) ships first and is independently usable; hover-peek (Tasks 9–17) follows.
> **Read the design doc and the plan in full before each phase** — the plan has per-task TDD steps; follow
> them top to bottom and commit per task. Operates only over already-redacted player data → no new secrecy
> surface (re-verified in the spec).

- [x] **M1. Joyful wayfinding — hover-peek cards + wander button (player site).**
  **Design:** `docs/superpowers/specs/2026-06-17-browsing-feel-design.md` — **read in full first.**
  **Plan:** `docs/superpowers/plans/2026-06-17-wayfinding.md` — **read in full; follow task-by-task.**
  Two player-site browsing upgrades over already-published player data: (1) a **hover-peek card** (portrait +
  type badge + name + one-line summary + a corner map-jump button shown only when the place has a non-fogged
  pin) that pops on hovering a wikilink, a Connections entry, or a map pin — desktop hover, mobile tap-to-peek,
  portal-rendered with a full keyboard/screen-reader contract; (2) a **Wander button + whole-world discovery
  meter** that flies the player to a random already-visible place they haven't opened (never reveals fog —
  fogged/secret pins are excluded from the player build), with a quiet "X of Y places" meter and
  filled-vs-hollow pins as a free footprints trail. Visited-state lives in localStorage mirroring
  `playerNotes.ts`.
  - Phases (order matters): **0** — foundations (sanitizer `data-entity-id`/`aria-haspopup`, visited store);
    **1–2** — Wander (pure `selectWanderTarget`/`discoveryMeter`; visited hook + openId mark + filled pins;
    Wander control + cross-map fly) — independently shippable; **3–4** — hover-peek (resolve/position helpers,
    `HoverPeekCard`, peek controller + portal + prose hover, movement guard, Connections/pin hover, mobile
    tap); **5** — a11y close-out (Escape ordering) + full gate.
  - **Touches the build pipeline** (the sanitizer allow-list runs at build time) → final gate ALSO requires
    `npm run atlas:publish` **and** `npm run atlas:publish:integrity-smoke` green (the `data-entity-id` /
    `aria-haspopup` additions carry no DM content).
  - **Mandatory secrecy re-confirm:** the wander pool + meter read only `data.project.placements`, and the peek
    card reads only player `entityById` + `images[0]`/`summary` — all from the player `atlas.json`, which
    excludes DM-only entities/placements at build (`build-atlas.ts:347,409,654,664`). No new fetch, no new
    field; the visited set is localStorage-only, never serialized to any artifact or URL.
  - **Autonomy guard:** Wander (Tasks 1–8) is self-contained — ship it first. If the hover-peek portal/mobile
    interaction can't be made non-janky within two attempts in the same area, ship Wander + the desktop
    prose/pin hover and hand back the mobile-tap + Connections refinements with a note.
  - Done when: hovering a link / Connections entry / pin pops the card (desktop) and tapping peeks then opens
    (mobile); the map button flies to non-fogged places; Wander flies to a random unopened visible place
    (cross-map switch included) and the meter + filled pins track discovery; all new helpers unit-tested;
    full gate + atlas:publish + integrity-smoke green. ~8–12 runs across the phases.
  - ✅ DONE 2026-06-18 — Tasks 1–8 (Wander half) merged at b9b6c5b1 (1590 tests); Tasks 9–18 (hover-peek half) merged at 8be06e46. 32 wayfinding tests (14 files); tsc clean; eslint 0 errors (14 pre-existing warnings); vitest 4-shard green (1606 total); npm run build clean; atlas:publish 10/10; integrity-smoke 5/5. New modules: src/atlas/peek/ (resolvePeekEntityId, computePeekPosition, HoverPeekCard, usePeekController); prose + Connections + pin hover wired into AtlasViewer + EntityPanel.

### J — Refuel 2026-06-16 (one-click Publish — blessed by the human)

> Human-directed feature refuel. Build **J1** — one substantial unit (5 increments, TDD throughout).
> **Read the design doc and the plan in full before starting** — the plan has per-task TDD steps; follow them.
> Increment 0 (plumbing) is independently testable and ships first. The push increment (5) is the only
> outward-facing step; it ships last and only after the safety-check half (0–3) is green-gated.

- [x] **J1. One-click Publish from the editor.**
  **Design:** `docs/superpowers/specs/2026-06-16-one-click-publish-design.md` — **read in full first.**
  **Plan:** `docs/superpowers/plans/2026-06-16-one-click-publish.md` — **read in full; follow task-by-task.**
  Add a single **Publish** button to the DM editor that builds the player-safe atlas, runs every safety scan,
  shows a plain-language readiness verdict + player-vs-player change list, and — only after the DM confirms —
  makes a scoped commit and pushes to `main` (the existing GitHub Pages deploy trigger). Two dev-only endpoints
  (`POST /__atlas/publish-check` + `POST /__atlas/publish-push`) live in the existing save plugin. A shared
  module-level build lock serializes save + publish (D4). CI is hardened to run the full scan set — closing the
  pre-existing fog/image/asset gap (D13). Every line is editor-only, tree-shaken from player builds (D7).
  - Increments (order matters): **0** — plumbing (snapshotBaseline export, shared lock, .gitignore,
    atlas:scan alias, CI hardening) ✅ DONE 2026-06-16 `592d2221`; **1** — `publish-check` endpoint +
    scan adapter + types ✅ DONE 2026-06-16 `734056c9`; **2** — readiness card + check-half UI (neutral idle, demote validator) ✅ DONE 2026-06-16 `6b5e4273`; **3** —
    tree-shake fingerprint guard ✅ DONE 2026-06-16 `8c5e7570`; **4** — `publish-push` endpoint (re-verify, scoped commit, push, snapshot) ✅ DONE 2026-06-16 `b3465f87`;
    **5** — confirm→publish wiring ✅ DONE 2026-06-16 `67333fb2`.
  - Gate: targeted vitest run for all new test files (whole-suite OOMs — shard, see memory); tsc clean; eslint
    0 errors; `npm run build && npm run atlas:check-secrets dist` exit 0 (no editor endpoints in bundle);
    `npm run atlas:scan` exit 0; spec cross-check D1–D14 all landed.
  - **Autonomy guard (push is irreversible):** build and gate Increments 0–4 fully before wiring Increment 5.
    If verification fails twice in the same area, hand back.
  - Done when: DM can click Publish in the editor → see a plain-language safety verdict + change list → confirm
    → get "Published ✓ — players will see it in a couple of minutes"; every safety decision D1–D14 implemented;
    full gate green. ~5–8 runs across the increments.
  - ✅ DONE 2026-06-16 (Increment 5, final) — commits `3d9ca5ca` (usePublishFlow push half: confirm→publishing→terminal states, 11 tests) + `67333fb2` (PublishCheckTab terminal state rendering + shebang regression fix; build + atlas:check-secrets dist clean). Full J1 feature: DM clicks Publish → safety check → readiness card → confirm → "Published ✓ — players will see it in a couple of minutes".

### K — Refuel 2026-06-16 round 2 (Obsidian read-only merge — blessed by the human)

> Human-approved feature: safety-bounded Obsidian vault sync. **Read design + plan in full before each phase.**
> Design: `docs/superpowers/specs/2026-06-16-obsidian-readonly-merge-design.md`
> Plan: `docs/superpowers/plans/2026-06-16-obsidian-readonly-merge.md`
> Phases 1–4 ✅ DONE. Build Phase 5 next (ship gate: full vitest + integrity smoke).

- [x] **K1. Sync from Obsidian (read-only merge, Phases 3–5 remain).**
  **Design:** `docs/superpowers/specs/2026-06-16-obsidian-readonly-merge-design.md` — **read in full first.**
  **Plan:** `docs/superpowers/plans/2026-06-16-obsidian-readonly-merge.md` — **follow phase-by-phase.**
  Merges updated vault notes into atlas entities, preserving atlas-side work (pins, visibility, relationships).
  Never writes to the vault. Never auto-exposes DM content to players. Disk is always the base.
  - Phases: **1** — merge engine + secrecy core ✅ DONE 2026-06-16 (`4ae3b795` `17711225` `209930b8` `5e196ff5`); **2** — identity hardening, sync-map, needsReview from DM-canon ✅ DONE 2026-06-16 (`d01ff125` `aed21421` `bccef3c2`); **3** — vault-scan endpoint, ignoreRules (picomatch), .local-atlas config ✅ DONE 2026-06-17 (`50cfc81d`); **4** — SyncPanel UI, delete ImportPanel ✅ DONE 2026-06-17 (`96788c9c`); **5** — ship gate ✅ DONE 2026-06-17.
  - Gate (each phase): targeted vitest green; tsc clean; eslint 0 errors; no player-build leak.
  - Done when: DM can point the editor at their vault folder → see a diff of what changed → confirm per-entity → atlas updates in-place without losing pins/placements/relationships; full Phase 5 gate green.
  - ✅ DONE 2026-06-17 — ship gate: tsc clean; eslint 0 errors (14 pre-existing warnings); 1574 tests green (4 shards, no OOM); atlas:build:player clean; atlas:check-secrets + atlas:check-derived exit 0; integrity-smoke 5/5; atlas:publish 10/10 clean.

### L — Refuel 2026-06-17 (asset credits — blessed by the human)

> Human-directed feature refuel from a brainstorm. Build **L1** — one bounded feature in **two increments**
> (Increment 1 ships before Increment 2). **Read the design doc in full before starting.** L1 supersedes and
> folds in the page-only N3 nice-to-have. Carries a mandatory leak-regression test.

- [x] **L1. Asset credits — in-image corner badge + aggregate credits page, DM-toggled at build time.**
  **Design:** `docs/superpowers/specs/2026-06-17-asset-credits-badge-and-page-design.md` — **read in full first.**
  Add an optional `atlas.credit` string to entity frontmatter (parsed → threaded into `entity.credit` in the
  player `atlas.json`) and a world-level `credits: { badges, page }` block in `world.yaml` (both default
  `true`), threaded through the world-config pipeline exactly as the "living water" `water` block was
  (`loadWorldConfig` → `buildFullWorldYaml` → `build-atlas`). Two player-facing surfaces, each gated by its
  toggle: (1) a **faint bottom-right corner badge (~5px inset)** over each credited entity's images in
  `EntityPanel` that reveals the full credit at full opacity on hover/focus; (2) a `/atlas/credits` page
  listing player-visible credited entities alphabetically, with a nav link (hidden when no credits exist).
  The DM flips both from a **"Credits (site-wide)" section in `MapSettingsPanel`**, persisted via the
  existing Save flow.
  - **Increment 1** (ship first): schema (`Entity.credit?`, `World.credits?`, `CreditsConfig`), frontmatter
    parse, `resolveCredits()` + world-config parse/serialize, build-atlas threading, `CreditBadge` in
    EntityPanel, the credits page + gated nav. Fully functional via `world.yaml` (hand-editable).
  - **Increment 2**: the "Credits (site-wide)" toggle UI in `MapSettingsPanel` (world-level patch path —
    follow the existing `defaultMapId` edit path; `water`/`oceanColor` are per-map and not a direct model).
  - Files: `src/atlas/content/schema.ts`, `scripts/atlas/parseFrontmatter.ts`, `scripts/atlas/loadWorldConfig.ts`,
    `src/atlas/yaml/buildFullWorldYaml.ts`, `scripts/build-atlas.ts`, new `src/atlas/entity/CreditBadge.tsx`,
    `src/atlas/entity/EntityPanel.tsx`, new `src/pages/AtlasCredits.tsx`, `src/App.tsx`,
    `src/atlas/AtlasNavMenu.tsx`, `src/pages/AtlasViewer.tsx`, `src/atlas/MapSettingsPanel.tsx`, `src/index.css`;
    tests under `src/test/` (resolveCredits, build round-trip, EntityPanel badge, credits page, settings toggle).
  - **Touches the build pipeline** → gate ALSO requires `npm run atlas:publish:integrity-smoke` **and**
    `npm run atlas:publish` green (no DM content leaks; `credit`/`credits` carry no DM content).
  - **Mandatory:** a leak-regression test proving a `visibility: dm` entity with a credit is absent from the
    player `atlas.json`, the credits page, and any badge.
  - **Autonomy guard:** if the world-level patch path for Increment 2 is a large new surface, ship Increment 1
    fully (credits driven by `world.yaml`) and hand back Increment 2 with a note.
  - Done when: `atlas.credit` round-trips into the player atlas; faint corner badge shows on credited images
    and reveals the full credit on hover/focus (thumb-click still opens the lightbox); `/atlas/credits` lists
    credited player-visible entities with a gated nav link; both surfaces hide when their toggle is off; the
    DM can flip both from Map Settings and Save persists it; DM-only credited entity absent everywhere player
    (regression test asserts); full gate + integrity-smoke + atlas:publish green. ~2–4 runs.
  - ✅ DONE 2026-06-18 — **Increment 1** shipped: commit e71d99f3. Schema (Entity.credit, World.credits, CreditsConfig), parseFrontmatter, resolveCredits(), loadWorldConfig, buildFullWorldYaml, build-atlas, CreditBadge component, /atlas/credits page, AtlasNavMenu + AtlasViewer wiring. Gate: tsc clean; eslint clean; vitest 4-shard (375 tests) green; atlas:publish 10/10. Secrecy: dm-only credit absent from player atlas.json (build + page guard). **Increment 2 (MapSettingsPanel toggle) hands back** — world-level patch path is new surface not covered by the existing per-map edit model; Increment 1 is fully usable via `world.yaml`.

### I — Refuel 2026-06-15 round 2 (roadmap brainstorm — blessed by the human)

> Human-directed roadmap refuel from a feature-planning session. Build **I1 → I4** in order. Each is bounded,
> revertible, and cites its own spec (**read in full first**). I1 carries a mandatory leak-regression test;
> I2/I3 are pure player-facing additions; I4 is docs-only.

- [x] **I1. Show authored Connections on the entity page.**
  **Spec:** `docs/superpowers/specs/2026-06-15-connections-on-entity-page-design.md` — **read in full.**
  Authored `entity.relationships[]` are saved in the editor with per-link visibility tags but never
  displayed in the reading pane (player or DM). Render them as a compact **"Connections"** list in
  `EntityPanel`, directly beneath the existing "Mentioned in" backlinks. DM view shows all
  relationships; `visibility: dm` rows get a `(DM)` badge. Player view shows only the
  player-safe relationships that `projectEntityForPlayer` already filters — **no new redaction
  logic; reuse only.** Each target name is clickable (`onOpenEntity`); unresolved ids degrade
  gracefully. **Mandatory:** a leak-regression DOM test asserting a `visibility: dm` relationship
  and a relationship to a DM-only entity are absent from the player Connections render and present
  in the DM render.
  - Files: `src/atlas/entity/EntityPanel.tsx`; `src/test/entity/EntityPanel.test.tsx`; extend
    `src/test/entity/player-preview-leak-regression.test.tsx`.
  - Done when: Connections renders beneath Mentioned in; DM view shows all rels with DM badge;
    player view shows only player-safe rels; clicking a target opens the entity; no Connections
    section when relationships is empty; leak-regression test green; standard gate green. ~1–2 runs.
  - ✅ DONE 2026-06-16 — commit e20ad90c (feat(I1): Connections section on entity page; entityById
    added to destructuring; 7 EntityPanel unit tests + 4 I1 leak-regression tests in
    player-preview-leak-regression.test.tsx). Gate: 1417 tests green (4 shards, no OOM); tsc clean;
    eslint 0 errors (16 pre-existing warnings). Pure client-side display — no build-pipeline change.

- [x] **I2. Map distance ruler — click two points to measure straight-line world distance.**
  **Spec:** `docs/superpowers/specs/2026-06-15-map-distance-ruler-design.md` — **read in full.**
  Add a tape-measure mode to both the player viewer and the DM editor: click a ruler button in the toolbar to
  enter ruler mode, click two map points, see a dashed line with a distance label (e.g. "12.3 mi"; falls back
  to "NNN px" when no scale is configured). Clicking the button again clears and exits. In the editor, ruler
  mode auto-deactivates when pin-placement or region-drawing mode is entered. Explicitly NOT travel-time or
  multi-segment path measurement. New pure helper `measureDistance` (pixel distance → world-unit label, reusing
  the `MapScale` data already present in `atlas.json`); new `RulerLayer` react-leaflet component shared by both
  viewers; reuses `mapClickToAtlasCoord` for coordinate conversion.
  - Files: `src/atlas/ruler/measureDistance.ts`; `src/atlas/ruler/RulerLayer.tsx`; `src/pages/AtlasViewer.tsx`;
    `src/pages/AtlasPlacementEditor.tsx`; `src/test/ruler/measureDistance.test.ts`.
  - Done when: two-click measurement works in both viewer and editor; label shows world units (or px fallback);
    ruler button clears/exits; `measureDistance` unit-tested; standard gate green (tsc + eslint + sharded
    vitest). ~1–2 runs.
  - ✅ DONE 2026-06-16 — commit 8288dd28 (feat(I2): RulerLayer + measureDistance + button in both viewer and
    editor toolbars; 6 unit tests in src/test/ruler/measureDistance.test.ts). Gate: 1423 tests green (4 shards,
    no OOM); tsc clean; eslint 0 errors (16 pre-existing warnings). Pure client-side UI — no build-pipeline change.

- [x] **I3. Shareable deep links (map + pan/zoom + open entity).**
  **Spec:** `docs/superpowers/specs/2026-06-15-deep-link-pan-open-design.md` — **read in full.**
  Today only `?entity=<id>` is captured; the map always boots to its default center and Back navigates away
  from the atlas. Extend the existing query-param share link (CRITICAL: stay query-param — path routes 404 on
  GitHub Pages static hosting) to also capture active map (`?map=`), viewport center (`?cx=`/`?cy=` in map-space
  pixels), and zoom (`?cz=`). Add pure `serializeDeepLink`/`parseDeepLink` helpers in new `src/atlas/deepLink.ts`;
  a `ViewSyncController` child of `<MapContainer>` (using the existing `moveend`/`zoomend` pattern from
  `AtlasMinimap`) lifts viewport readings up to `AtlasViewer`; `replaceState` keeps the URL current on pan/zoom;
  `pushState` on `openEntity` + a `popstate` listener make Back work through entity navigation. `CopyLinkButton`
  in `EntityPanel` reads `window.location.href` (already current). Boot path replaces the inline `URLSearchParams`
  parse with `parseDeepLink`. Old `?entity=`-only links must still work.
  - Files: new `src/atlas/deepLink.ts`; `src/pages/AtlasViewer.tsx`; `src/atlas/entity/EntityPanel.tsx`; new
    `src/test/deep-link.test.ts`.
  - Done when: entity opens push history (Back returns to prior entity); pan/zoom updates URL without new Back
    entries; map switch updates `?map=`; copied link reopens exact view in a fresh tab; old `?entity=`-only
    links unaffected; pure helpers unit-tested; gate green. ~1–2 runs.
  - ✅ DONE 2026-06-16 — commit dc44d15d (feat(I3): serializeDeepLink/parseDeepLink pure helpers + ViewSyncController
    + replaceState URL sync + pushState/popstate Back support + enriched CopyLinkButton; 12 unit tests in
    src/test/deep-link.test.ts). Gate: 1435 tests green (4 shards, no OOM); tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings). Pure client-side — no build-pipeline change.

- [x] **I4. Fix README editor-rail drift.**
  **Spec:** `docs/superpowers/specs/2026-06-15-docs-readme-editor-rail-design.md` — read in full.
  The README's "DM Creator Cockpit" section lists Pins / Maps / Regions / Routes / Fog / Entities / Import /
  Publish Check. The live rail (verified in `src/atlas/shell/railRegistry.tsx`) is Characters / Locations /
  Factions / Events / Items / Lore / Pins / Regions / Routes / Fog / Save / Publish. Rewrite the README panel
  list and per-panel bullets to match: six content category tabs instead of one Entities tab, Maps and Import
  moved to "menu-only" panels, Publish Check → Publish, Save added as a system rail item.
  - Files: `README.md`.
  - Done when: README panel list matches the live rail exactly; Maps and Import documented as menu-only; no code
    files modified; docs-only gate. ~1 run.
  - ✅ DONE 2026-06-16 — commit 576981ae (docs(I4): fix README editor-rail drift — six content tabs, Save, Publish, menu-only Maps/Import). Docs-only gate: eslint 0 errors (16 pre-existing warnings); no tests (docs change). README "DM Creator Cockpit" now lists Content/Map/System/Menu groups matching the live rail exactly.

### H — Refuel 2026-06-15 (animated ocean / "living water" — blessed by the human)

> Human-directed look-&-feel refuel. Full design (**read in full first**):
> `docs/superpowers/specs/2026-06-15-animated-ocean-background-design.md`. Build **H1 → H2**.
> Default: water is **on but gentle**, **per map**, with a hard off switch back to today's flat colour.

- [x] **H1. Animated ocean background — rendering + config + player parity.**
  **Spec:** `docs/superpowers/specs/2026-06-15-animated-ocean-background-design.md` — **read in full** (build phases 1–3).
  Upgrade each map's flat `oceanColor` fill into a configurable, gently animated "living water" layer rendered
  behind the map (a `pointer-events:none` backdrop below the Leaflet panes; the base `oceanColor` stays as the
  fallback). Add a per-map `water` config (`enabled`/`intensity`/`speed`/`crestColor`) on `MapDocument` with a
  pure `resolveWater()` (defaults: on, gentle, slow; crest derived from `oceanColor`; clamps). `enabled:false`
  → renders nothing → byte-for-byte today's flat colour (the kill switch). One shared `OceanBackground`
  component used by BOTH the player viewer and the editor; respects `prefers-reduced-motion` (renders still).
  Thread `water` through `loadWorldConfig` (parse/sanitize) → `buildFullWorldYaml` (serialize) → `build-atlas`
  (into player `atlas.json`), so the water shows on the player site and through fog automatically (no secrecy
  risk — benign world-level theme data, like the existing `oceanColor`).
  - Files: `src/atlas/content/schema.ts`; new `src/atlas/ocean/OceanBackground.tsx` + `src/atlas/ocean/resolveWater.ts`;
    `src/pages/AtlasViewer.tsx`, `src/pages/AtlasPlacementEditor.tsx`; `scripts/atlas/loadWorldConfig.ts`,
    `src/atlas/yaml/buildFullWorldYaml.ts`, `scripts/build-atlas.ts`; tests under `src/test/ocean/**` + extend
    world-loader/build tests.
  - **Autonomy guard:** if the backdrop can't sit behind the Leaflet panes without breaking map drag/zoom,
    ship the simplest equivalent (animate the container background) and hand back the pane-layer upgrade — do
    not risk interaction or expand scope.
  - **Touches the build pipeline** → gate also requires `npm run atlas:publish:integrity-smoke` **and**
    `npm run atlas:publish` green (no secret leak; `water` carries no DM content).
  - Done when: maps show a gentle living sea by default; `enabled:false` reverts to exactly the flat colour;
    water shows in the player build incl. through fog; reduced-motion renders still; `resolveWater` unit-tested;
    config round-trips into the player `atlas.json`; standard gate + publish + integrity-smoke green. ~1–2 runs.
  - ✅ DONE 2026-06-15 — commits 2e6766c3 (schema + ocean module: resolveWater + OceanBackground + 22 tests)
    + 12db1a49 (config plumbing: loadWorldConfig sanitizeWater + buildFullWorldYaml serialize + viewer/editor
    mount + 7 world-loader tests). Gate: 1393 tests green (4 shards); tsc clean; eslint 0 errors (16
    pre-existing warnings); integrity-smoke 5/5; atlas:publish 10/10 clean.

- [x] **H2. "Living water" controls in the map settings panel.**
  **Spec:** `docs/superpowers/specs/2026-06-15-animated-ocean-background-design.md` — **read in full** (build phase 4).
  Add a "Living water" section under the existing ocean-colour picker in `MapSettingsPanel.tsx`: a toggle
  (enabled), **Strength** (intensity) + **Speed** (speed) sliders, and a **Wave colour** picker (crestColor,
  pre-filled with the derived default). Each control calls the existing `onPatch({ water })` → `patchMap` →
  existing Save (`buildFullWorldYaml` → `/__atlas/save`); undo is automatic. When the toggle is off, hide/grey
  the three tuning controls. Pure DM-editor UI; no secrecy or build-pipeline impact.
  - Files: `src/atlas/MapSettingsPanel.tsx`; UI test under `src/test/`.
  - Done when: the DM can turn the living water on/off and adjust strength/speed/wave-colour per map, see it
    change live on the map, and Save persists it (round-trips via `world.yaml`); toggling off restores the flat
    colour; standard gate green. ~1 run.
  - ✅ DONE 2026-06-15 — commit b65e7630 (Living water section in MapSettingsPanel: toggle + Strength/Speed
    sliders + Wave colour picker + 9 UI tests in src/test/map-settings-panel.test.tsx). Gate: all 4 shards
    green; tsc clean; eslint 0 errors (16 pre-existing warnings). Pure editor UI — no pipeline impact.

### G — Refuel 2026-06-14 round 2 (blessed by the human)

- [x] **G1. Honest player preview — faithful "as players see it" view.**
  **Spec:** `docs/superpowers/specs/2026-06-14-honest-player-preview-design.md` — **read in full.**
  Today the editor's "player" view only filters *which entities* show (`filterEntitiesForLens`); it does not
  consistently redact content *within* an entity, so `%%dm%%` blocks, DM-only profile fields, secret/DM
  relationships, and DM-entity links can still leak in the reading pane. Make the **player** ViewMode drive a
  faithful projection of the whole reading experience via the EXISTING pure `projectEntityForPlayer()`
  pipeline (verified reusable client-side — **reuse only; no new redaction logic; no rebuild**), plus a clear
  "previewing as players see it" indicator. **Mandatory:** a leak-regression test (an entity with a
  `%%secret%%`, a DM-only profile field, a `visibility: dm` relationship, and a `[[DM-only]]` link renders
  NONE of them in the player preview). Build the default single-toggle shape; a separate full-screen preview
  route is out of scope for v1.
  - Files: `src/atlas/view/ViewModeProvider.tsx` + consumers; `src/atlas/entity/EntityReadingView.tsx`,
    `EntityPanes.tsx`, `EntityPanel.tsx`; `src/pages/AtlasPlacementEditor.tsx` (toggle + indicator); tests
    (the mandatory leak-regression test + an indicator test).
  - Done when: Player view shows entities fully redacted (no `%%dm%%`, no DM fields, no secret/DM
    relationships, DM-links redacted) AND only player-visible entities/maps appear AND a clear indicator
    shows; DM view unchanged; the leak-regression test proves a planted DM secret is absent from the preview;
    gate green (no build-pipeline change). ~1–2 runs.
  - ✅ DONE 2026-06-14 — commits 38443725 (feat: EntityPanes honors global ViewMode — player pane is primary
    in player mode + "Player preview — as players see it" banner; ViewModeToggle gets "Previewing as players
    see it" chip in editor header) + merge e838641b. Mandatory leak-regression test: 14 assertions across
    4 DM channels (%%dm%% block, profile.dm field, visibility:dm relationship, [[DM-only]] link) — all
    absent from player render, all present in DM render. Gate: 1250 tests green (4 shards); tsc clean;
    eslint 0 errors (16 pre-existing warnings). No build-pipeline change — pure client-side reuse.

### F — Refuel 2026-06-14 (blessed from the inbox)

- [x] **F1. Categorize imported notes (stop silent "Lore" bucketing).**
  **Spec:** `docs/superpowers/specs/2026-06-14-categorize-imported-notes-design.md` — **read in full.**
  Imported notes with no explicit `atlas.type`, no recognized tag, and an unmapped source folder silently
  fall through to type `"lore"`, so an imported NPC never shows under the **Characters** tab (and is
  indistinguishable from a deliberate lore note). Keep the automatic path (explicit / tags / mapped-folder)
  intact; the core change is making the *fallback* honest + fixable — surface "guessed" rows in the existing
  import staging modal (reuses the per-row type dropdown from B1/B2) so the DM assigns the right type in one
  glance. Pure DM-editor + import-staging change; **no secrecy risk** (player projection filters on
  `visibility`, never `type` — verified in the spec). **Design decided (2026-06-14):** a guessed note stays
  data-default `"lore"` but is **marked guessed** + one-click fixable in the staging modal; a separate
  "Uncategorized" bucket is **out of scope for v1**. **No fragile filename/content heuristics in v1.**
  - Files: `src/atlas/import/stagingState.ts`, `src/atlas/import/inferType.ts`,
    `src/atlas/import/ImportStagingModal.tsx`; tests in `src/test/import-staging-modal.test.tsx` + stagingState
    coverage for the guessed-vs-deliberate-lore distinction.
  - Done when: an unmapped-folder / no-signal note is flagged "guessed" in the staging modal and assigning it
    "npc" routes it under Characters after import; explicitly-typed / tagged / mapped-folder notes are
    unaffected (no false flag); a deliberately-lore note isn't flagged; import still completes with zero extra
    mandatory clicks; standard gate green. ~1–2 runs.
  - ✅ DONE 2026-06-14 — commits ef10e2c3 (typeWasGuessed field + 8 staging-state tests) + 4d2d059b
    ("Pick a type" badge in modal + 4 modal tests). Gate: 1214 tests green (4 shards, no OOM); tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings). inferType.ts unchanged (no behavior change to recognized folders).

- [x] **F2. "What's new for players" counts distinct entities (not edit-records).**
  **Spec:** `docs/superpowers/specs/2026-06-14-publish-diff-distinct-entity-count-design.md` — **read in full.**
  The publish summary badge counts change-records, so one entity edited two ways reads as "2 entities
  changed." Make the entity / map / placement summary counts tally **distinct ids** (fix all three together
  for consistency); the detailed change list is unchanged. DM-editor publish-summary only; no secrecy impact.
  Decided by the human 2026-06-14 (clears the "handed back" badge item in the code-quality log).
  - Files: `src/atlas/publish/computeAtlasDiff.ts` (+ the badge consumer if it self-counts);
    `src/test/atlas-diff.test.ts`.
  - Done when: an entity with title+body changes counts as 1 in the badge (test asserts); maps/placements
    likewise distinct; detailed change list unchanged; gate green. ~1 run.
  - ✅ DONE 2026-06-14 — commit abea3ba0 (`counts` uses `new Set(...).size` for entities/placements/maps;
    4 new tests: single-entity two-change-kinds counts as 1, two entities with multiple kinds each counts
    as 2, maps distinct, placements distinct). Badge consumer (`PublishedDiffPanel`) confirmed reads
    `diff.counts` not `.length`. Gate: 1218 tests green (4 shards); tsc EXIT:0; eslint 0 errors (16 known
    warnings).

- [x] **F3. Pin label de-cluttering on crowded maps.**
  **Spec:** `docs/superpowers/specs/2026-06-14-pin-label-decluttering-design.md` — **read in full.**
  Crowded maps render all pin labels at once into an unreadable smear. Use the existing `pin.priority` to
  thin **labels only** (markers always show) via a zoom×priority threshold extracted as a pure, unit-tested
  visibility function. **Autonomy guard:** if it needs true label-collision detection, ship the threshold
  version and hand back the upgrade — don't expand scope. (Graduated from NICE-TO-HAVE N2.)
  - Files: the map pin/label render layer under `src/atlas/` + a new pure `labelVisibility` helper + test;
    theme/CSS if labels fade.
  - Done when: zoomed-out crowded maps show only higher-priority labels and reveal more on zoom-in; markers
    always show; low-pin maps unchanged; visibility logic unit-tested; gate green (+ publish scans only if the
    build path is touched). ~1–2 runs.
  - ✅ DONE 2026-06-14 — commit b7f63ed2 (new `src/atlas/pins/labelVisibility.ts` with `labelVisibilityThreshold`
    + `shouldShowLabel`; `AtlasViewer.tsx` wires `shouldShowLabel(zoom, style.priority)` into "auto" mode
    label decisions, replacing per-preset `labelMinZoom` lookup; explicit "always"/"hover"/"never" overrides
    untouched; priority-ordered collision detection preserved). 18 new unit tests.
    Gate: 1236 tests green (4 shards); tsc EXIT:0; eslint 0 errors (16 known warnings). Render-layer change
    only — publish scans not needed.

### E — Refuel 2026-05-31 (blessed from the ranked inbox)

Ordered by confidence/safety: **E1 is done**; build **E2 next**. Each is bounded and revertible. E2 and E6
are clear correctness/polish (E6 mirrors E2 — same Publish Check surface); E3 touches dev/build wiring (spec
picked the approach); E4–E5 carry some UX/feature latitude — the spec pins the chosen shape.

- [x] **E1. Accessible names for icon-only controls.**
  **Spec:** `docs/superpowers/specs/2026-05-31-accessibility-labels-design.md` — **read in full.**
  Several icon-only buttons (the minimap region; the map-layer-panel nudge/lock/duplicate/remove buttons;
  per-pin discard/remove; two EntitiesTab trash buttons) have no accessible name. Add `aria-label`/`role`
  matching the codebase's existing pattern. Pure additive, no visual change.
  - Files: `src/atlas/AtlasMinimap.tsx`, `src/atlas/MapLayerPanel.tsx`, `src/pages/AtlasPlacementEditor.tsx`,
    `src/atlas/tabs/EntitiesTab.tsx`; new test under `src/test/`.
  - Done when: listed controls expose accessible names (sampled test green); no behaviour/visual change;
    gate green. ~1 run.
  - ✅ DONE 2026-05-31 — commits a9a1a222 (aria-labels + role on minimap/layer-panel/placement-editor/
    EntitiesTab + 6-test regression guard) + 3191e7ad (fix: stable react-leaflet mock — the original test
    returned a fresh useMap() object each render, spinning AtlasMinimap's viewport effect into an
    infinite-loop OOM; this was the real cause of 8 prior routine hand-backs, not machine memory).
    Merged to main via a7f22fbc. Full gate: 1039 tests green (4 shards, no OOM); tsc clean; eslint 0 errors;
    atlas:publish 10/10 scans clean; integrity-smoke 5/5.

- [x] **E2. Flag dropped image embeds in Publish Check.**
  **Spec:** `docs/superpowers/specs/2026-05-31-dropped-image-embed-flag-design.md` — **read in full.**
  Obsidian `![[Portrait.png]]` embeds silently vanish in the player view. Add a Publish Check **warning**
  (the pre-blessed "flag it" half — not the larger "render it" change) so the DM sees which images won't
  publish. One check in `validateProject.ts`; reuses the existing Issue/UI model.
  - Files: `src/atlas/yaml/validateProject.ts`; extend `src/test/atlas-publish-check.test.ts`.
  - Done when: player-visible entities with image embeds raise a `dropped-image-embed` warning; no false
    positives on DM-only/non-image/stripped-block embeds; gate green. ~1 run.
  - ✅ DONE 2026-06-02 — commit a0eab4c0 (warn on dropped image embeds; scans e.body with image-extension
    filter; DM-only and non-image embeds not flagged; 4 regression tests). Gate: 1043 tests green (4
    shards, no OOM); tsc clean; eslint 0 errors (16 pre-existing warnings). Merged to auto/continuous-dev.

- [x] **E3. Editor "just works" on first run (auto-build the DM atlas).**
  **Spec:** `docs/superpowers/specs/2026-05-31-editor-first-run-autobuild-design.md` — **read in full.**
  On a fresh checkout `npm run dev` serves the player atlas, so the editor opens degraded with a "Save
  won't work — run `npm run atlas:build`" banner. Add a `predev` guard (`scripts/ensure-dm-atlas.ts`) that
  builds the DM atlas when missing/stale (skips when fresh; never blocks dev on build failure). **Touches
  dev/build wiring** — the spec picked the `predev` approach; also run `npm run atlas:publish` once as a
  safety check.
  - Files: `package.json` (`predev`); new `scripts/ensure-dm-atlas.ts`; test for the pure staleness check.
  - Done when: fresh checkout → `npm run dev` auto-builds and the editor opens with content + no banner;
    warm start skips the rebuild; build failure doesn't abort dev; `npm run build`/player build unaffected;
    gate green. ~1 run.
  - ✅ DONE 2026-06-02 — commit fc839c6c (predev hook + scripts/ensure-dm-atlas.ts; isAtlasStale pure
    helper; 4 unit tests). Gate: 1047 tests green (4 shards, no OOM); tsc clean; eslint 0 errors;
    atlas:publish 10/10 scans clean. Merged to auto/continuous-dev.

- [x] **E4. Clearer import report (post-import summary).**
  **Spec:** `docs/superpowers/specs/2026-05-31-import-report-summary-design.md` — **read in full.**
  After a vault import the only feedback is a bare count. Enrich the existing success toast with a plain-
  language breakdown (added / updated / replaced / skipped, plus a distinct "couldn't be read" line) derived
  from the staged rows. No new mandatory step — sleek, one-glance. UX latitude: spec pins the chosen shape.
  - Files: `src/atlas/import/useMdImportFlow.ts` (+ a pure `summarizeImport` helper, likely in
    `src/atlas/import/`); test for the helper.
  - Done when: the DM sees a correct plain-language breakdown after import without extra clicks; existing
    conflict/rebuild toasts unchanged; gate green. ~1 run.
  - ✅ DONE 2026-06-02 — commit dcbba70c (summarizeImport helper + formatImportSummaryLine; useMdImportFlow
    uses description on success toast; toast.warning when couldntBeRead > 0; 11 unit tests). Gate: 1058
    tests green (4 shards, no OOM); tsc clean; eslint 0 errors. Merged to auto/continuous-dev.

- [x] **E5. Phrase search (`"exact phrase"`) in the player search.**
  **Spec:** `docs/superpowers/specs/2026-05-31-phrase-search-design.md` — **read in full.**
  Add quoted exact-contiguous-phrase matching to `SearchPalette` (AND-combined with unquoted terms);
  introduces **no** fuzzy matching (a non-goal). Extract the parse + match into tested pure functions under
  `src/atlas/search/`. Most feature-shaped item in this batch — easy to defer.
  - Files: `src/pages/AtlasViewer.tsx`, new pure helpers under `src/atlas/search/`; tests. **Contingency
    only:** if `bodyText` isn't on the index entries, a one-field add in `scripts/build-atlas.ts` pulls in
    the `atlas:publish:integrity-smoke` + `atlas:publish` gate (see spec).
  - Done when: `"exact phrase"` restricts results to contiguous matches; mixed queries AND correctly; the
    phrase is highlighted; parse/match logic is unit-tested; gate green. ~1–2 runs.
  - ✅ DONE 2026-06-02 — commits 487a8083 (parseSearchQuery + matchesPhrases helpers + 15 unit tests) +
    b669ed51 (wire phrase filter + highlighted snippet into SearchPalette; placeholder updated). Gate: 1073
    tests green (4 shards, no OOM); tsc clean; eslint 0 errors. No build/scan pipeline impact
    (bodyText was already present on index entries — contingency not triggered).

- [x] **E6. Flag broken wikilinks in Publish Check.**
  **Spec:** `docs/superpowers/specs/2026-05-31-broken-wikilink-flag-design.md` — **read in full.**
  A wikilink whose target doesn't resolve (`[[Ghost Town]]`, `[[Note#Heading]]`) renders to players as dead
  text, and the DM is never warned. Add a Publish Check **suggestion** (deliberately low-key — not a
  warning; many broken links are intentional WIP) that surfaces, per player-visible entity, the broken
  targets players would see. Mirrors E2 exactly: one check in `validateProject.ts`, reuses the existing
  Issue/UI model. **No regex needed** — `entity.links[]` already carries `broken: boolean`; iterate it like
  the existing `wikilink-to-dm` check. Sibling of E2; same "flag it, don't fix the renderer" half.
  - Files: `src/atlas/yaml/validateProject.ts`; extend `src/test/atlas-publish-check.test.ts`.
  - Done when: player-visible entities with broken links raise one aggregated `broken-wikilink` suggestion
    per entity (naming the dead targets, with a `go-entity` action); no issue for DM-only entities or
    all-resolving entities; no per-link spam; no UI/schema change; gate green. ~1 run.
  - ✅ DONE 2026-06-02 — commit 5ea9ee8d; iterates e.links[], filters broken===true, emits one aggregated
    Issue per entity (severity "suggestion", category "yaml", go-entity action, up to 3 targets listed
    inline + "…and N more" for longer). 4 new tests (player+broken, player+resolved, dm+broken,
    multi-broken-aggregated); 1077 tests green (4 shards); tsc clean; eslint 0 errors.

### D — Daily-driver fixes from the 2026-05-30 dogfooding pass

All four are **no-gate**: clear correctness/polish, bounded, revertible. Build top to bottom — **D1 first**
(it stops a whole-app crash). Full ranking/context graduated from the Inbox in `docs/DEVELOPMENT_WANTS.md`.

- [x] **D1. Stop the whole app blank-screening; contain any future component crash.**
  **Spec:** `docs/superpowers/specs/2026-05-30-crash-guard-error-boundary-design.md` — **read in full.**
  Selecting an entry with no map location (e.g. an Event) white-screens the entire player viewer, with no
  safety net. Two goals: (1) add an app-level React **error boundary** so no single component error can
  ever blank the site again (graceful "something went wrong" + Reload instead); (2) drive out the actual
  crash with a **headless regression test** that opens a location-less entity and asserts no throw. Also
  add a finite-coordinate guard in `MapController`. The obvious `flyTo` path is already guarded — do not
  assume it; reproduce via the test and fix what it surfaces.
  - Files: new `src/components/ErrorBoundary.tsx`; `src/App.tsx`; `src/pages/AtlasViewer.tsx`; tests under `src/test/`.
  - Done when: an error-boundary unit test shows the fallback (not a blank screen) when a child throws; a
    regression test covers opening a location-less entity without crashing (or the documented
    isolated-component equivalent if leaflet+jsdom blocks full-viewer render); no DM content in the
    fallback copy; gate green. ~1 run.
  - ✅ DONE 2026-05-30 — commit 36cc1670; ErrorBoundary wraps Routes in App.tsx; 3 boundary tests + 3
    location-less entity regression tests pass; MapController finite-coord guard added; 959/959 tests
    green; tsc clean; eslint 0 errors

- [x] **D2. Show proper-case names instead of lowercase file-slugs.**
  **Spec:** `docs/superpowers/specs/2026-05-30-display-casing-design.md` — **Part 1.**
  Notes without an explicit `title:` (e.g. imported NPCs) render as "corven"/"edric" because
  `deriveTitle()` returns the raw filename slug uncapitalized. Title-case the derived fallback only
  (explicit titles untouched) — fixes search results, the reading-panel title, and pin labels at once.
  - Files: `scripts/build-atlas.ts` (export + fix `deriveTitle`); test under `src/test/`.
  - Done when: a slug-derived title is title-cased ("corven" → "Corven", "great-hall" → "Great Hall");
    explicit frontmatter titles unchanged; unit test covers it; gate green. ~1 run.
  - ✅ DONE 2026-05-30 — commit 7d8c6beb; deriveTitle exported + title-cased; stagingState.ts synced; 6 unit tests added; 965/965 tests green; tsc clean; eslint 0 errors

- [x] **D3. Show search snippets in original case.**
  **Spec:** `docs/superpowers/specs/2026-05-30-display-casing-design.md` — **Part 2.**
  Result snippets render all-lowercase because the search index `body` is lowercased for matching and the
  viewer renders straight from it. Ship a parallel original-case `bodyText` for display; keep `body`
  lowercased for matching; slice the display text using match offsets from the lowercased field.
  - Files: `scripts/build-atlas.ts`, `src/atlas/content/loader.ts` (add `bodyText?`), `src/pages/AtlasViewer.tsx` (`snippet()` + call site); tests.
  - **Touches the build pipeline** → the gate also requires `npm run atlas:publish:integrity-smoke` **and**
    `npm run atlas:publish` green (no new secret leak — `bodyText` is the same redacted body as `body`).
  - Done when: a snippet renders original-case text with the match highlighted; a build test shows entries
    carry a non-lowercased `bodyText`; gate + integrity-smoke green. ~1 run.
  - ✅ DONE 2026-05-30 — commit 1b3fd01a; snippet() extracted to src/atlas/search/snippet.ts; bodyText added to search index; 8 new tests; 973/973 tests green; tsc clean; eslint 0 errors; integrity-smoke 5/5; atlas:publish clean

- [x] **D4. Silence the CSS `@import`-order build warning.** *(no separate spec — fully specified here)*
  `src/index.css` has `@import "leaflet/dist/leaflet.css";` *after* the three `@tailwind` directives, so
  Vite/PostCSS warns on every start that `@import` must precede other statements. Move that one `@import`
  to the **very top** of the file (above `@tailwind base;`).
  - Files: `src/index.css`.
  - Done when: the leaflet `@import` is the first statement; `npm run dev`/`npm run build` start with no
    "`@import must precede`" warning; leaflet styles still apply (map controls/popups look unchanged);
    gate green. ~1 run.
  - ✅ DONE 2026-05-30 — commit c5a6c33c; @import moved to line 1; build clean with no CSS warning; 973/973 tests green; tsc clean; eslint 0 errors

### A — Speed up publishing (Stage 2)

**Spec:** `docs/superpowers/specs/2026-05-28-atlas-publish-speedup.md` · **Plan:** `docs/superpowers/plans/2026-05-28-atlas-publish-speedup.md`
**Stage 1 (integrity-smoke harness) is already shipped.** This is Stage 2 only.

> ⚠️ **The spec's "≥40% faster / under 20s" target is SUPERSEDED — do not chase it.** Profiling showed the
> Vite build dominates (~65%) and is out of scope. Optimize the **scan phase only** (~6.5s → ~1s, ~30%
> total). Keep `npm run atlas:publish:integrity-smoke` green throughout — it is the safety net.

- [x] **A1. Make the scan scripts importable as modules.** Refactor the 6 scan scripts to export a callable
  run function (e.g. `run({ dirs })`) while keeping their existing CLI entry shim. **No behavior change.**
  - Files: `scripts/check-no-secrets.ts`, `scripts/check-derived-secrets.ts`, `scripts/check-image-privacy.ts`, `scripts/check-fog-safety.ts`, `scripts/check-artifact-shape.ts`, `scripts/atlas/audit-assets.ts`
  - Done when: each script still works from the CLI exactly as before; `npm run atlas:publish` and
    `atlas:publish:integrity-smoke` both green. ~1 run.
  - ✅ DONE 2026-05-30 — commit 8d1c6aec; integrity-smoke all 5 faults caught; atlas:publish EXIT:0

- [x] **A2. Add the parallel orchestrator.** New `scripts/atlas/publish-orchestrator.ts` imports the scan
  modules and runs the read-only scans via `Promise.all` (one process, no per-scan `tsx` cold-start).
  Rewire the scan portion of the `atlas:publish` script in `package.json` to a single orchestrator call.
  - Files: new `scripts/atlas/publish-orchestrator.ts`; `package.json` (the `atlas:publish` line).
  - Done when: integrity-smoke green (planted faults still rejected), publish exit code 0, scan phase
    measurably faster. ~1 run.
  - ✅ DONE 2026-05-30 — commit a1274138; all 10 scans run via Promise.all, integrity-smoke all 5 faults caught, atlas:publish EXIT:0

- [x] **A3. (conditional) Cache `sharp.metadata()` between image checks.** Only if A2 leaves the scan phase
  above ~2s. Share the decode between `check-image-privacy` and `audit-assets`.
  - Done when: scan phase ~1s, all gates green. Skip this unit if A2 already hits ~1s. ~1 run.
  - ✅ SKIPPED 2026-05-30 — orchestrator timed at 1.57s (< ~2s threshold); A3 cache not needed

### B — Verify import folder-mapping (close the 4 gaps)

**Plan:** `docs/superpowers/plans/2026-05-16-import-folder-mapping.md` (core logic merged; these 4 gaps remain).

- [x] **B1. Fix the two `ImportStagingModal` gaps (one is a real bug).**
  - Gap 1 (bug): the "Select all overwrites" control never renders — it filters on a `r.conflict` field
    that doesn't exist; should test `r.rowKind === "path-collision"`.
  - Gap 2: derive the type-option list from `importConfig.folders` keys instead of a hardcoded array (so
    "zero code for a new type" holds); fix the stale "slug"/"conflict" copy.
  - Files: `src/atlas/import/ImportStagingModal.tsx`; test `src/test/import-staging-modal.test.tsx`.
  - Done when: overwrite control renders on a collision; new folder types appear with no code change;
    test covers both; gates green. ~1 run.
  - ✅ DONE (pre-queue) — commits f7261619 (conflictRows fix) + 361b14e4 (type dropdown from importConfig); 7/7 modal tests pass

- [x] **B2. Add the missing validation + build-pipeline tests, and a seed config.**
  - Validation tests for `sanitizeImportConfig()` (safe-segment regex, reserved names `_atlas`/`.`/`..`,
    missing-default fallback, absent `import:` block).
  - Build test: `importFolders` present in DM `atlas.json` under `worlds[0]`, **absent** in `--player` build.
  - Seed an example `import:` block in `content/astrath-deeprealm/_atlas/world.yaml`.
  - Files: `src/test/atlas-world-loader.test.ts`, `src/test/atlas-build.test.ts`, `content/astrath-deeprealm/_atlas/world.yaml`.
  - Done when: ~6 new tests green; player build proven free of the import config; gates green. ~1 run.
  - ✅ DONE (pre-queue) — commits 31e5c8ed (world-loader import-block tests) + 9c13a46f (importFolders build test) + e06b2a5a (world.yaml import block)

### C — Richer markdown rendering (Phase 2)

**Spec:** `docs/superpowers/specs/2026-05-18-obsidian-markdown-parity-design.md` (Phases 0+1 shipped; this is Phase 2).
Render/styling parity only — **not** interactivity.

- [x] **C1. Highlights (`==text==`).** Add a `marked` inline extension → `<mark>` (or `.highlight` span);
  allow it in the sanitizer; theme-token the color; prove it renders identically across DM pane, reading
  view, and player projection.
  - Files: `src/atlas/content/markdownCore.ts`, `src/atlas/content/sanitizer.ts`, theme CSS, parity test.
  - Done when: highlight renders at parity on all three surfaces; gates + browser smoke green. ~1 run.
  - ✅ DONE (pre-queue) — commit c77396d5; parity fixture verifies `<mark>wrong</mark>` survives sanitizer

- [x] **C2. Footnotes (`[^id]` + definitions) — with orphan-reference drop.** Sequential numbering,
  backreferences. **Mandatory secrecy edge case:** if a footnote *definition* sits inside a stripped
  `%%…%%` or `:::dm…:::` block, the now-dangling reference must be **removed** from player/published output,
  never left as a bare `[^id]`. Allow `<sup>`/`<ol>` backref markup in the sanitizer.
  - Files: `src/atlas/content/markdownCore.ts`, `src/atlas/content/sanitizer.ts`, CSS; tests for the orphan
    case + a secrecy regression (definition inside `%%` ⇒ absent downstream).
  - Done when: footnotes render at parity; orphan-drop proven; secrecy contract holds; gates + smoke green. ~1–2 runs.
  - ✅ DONE (pre-queue) — commit bf188e0f; parity fixture verifies footnote backref + orphan-drop logic

- [x] **C3. Task-list styling (`- [ ]` / `- [x]`).** GFM already parses these; scope is consistent,
  read-only checkbox styling across DM / reading / player surfaces. No interactivity.
  - Files: theme CSS; parity test.
  - Done when: checkboxes look consistent on all surfaces, non-interactive in read/player; gates green. ~1 run.
  - ✅ DONE (pre-queue) — commit bf188e0f; parity fixture verifies `atlas-task-item`/`atlas-task-done` classes, no `<input>` emitted

---

## 🔋 REFUEL POINT — read this when every WANT above is ✅ DONE

The certain, blessed work is finished. **Do not invent new wants.** From here:

1. Prefer a **nice-to-have** below *only if it clearly passes the design-check* (see roadmap step 2a).
2. If nothing passes cleanly, **stop and hand back** (routine step 7): write a short list of candidate
   wants into `ACTIVE.md`, each with a one-line "why it fits the design," and wait for the human to bless.

A run that stops here and asks is a **success**, not a stall.

---

## 🟡 NICE-TO-HAVES — design-check required before each (not auto-go)

Lighter specs on purpose — these are the agent's own ideas, so the bar to start is higher. When genuinely
unsure which to pick, take **N5 (hygiene nibble)** — it's the safest filler.

- [x] **N1. Phrase search** (`"exact phrase"`) in the player search. ✅ SUPERSEDED — shipped as **E5**
  (2026-06-02, commits 487a8083 + b669ed51). Kept for the record; do not rebuild.
- [x] **N2. Pin de-cluttering at high pin counts** ✅ SUPERSEDED — shipped as **F3** (2026-06-14, commit
  b7f63ed2). Kept for the record; do not rebuild.
- [x] **N3. Asset credits — `credit` field + player credits page.** ✅ SUPERSEDED — blessed and folded into
  **L1** (2026-06-17), which keeps the credits page and adds the in-image corner badge + DM toggles.
  See section **L** above and `docs/superpowers/specs/2026-06-17-asset-credits-badge-and-page-design.md`.
  The original page-only spec (`docs/superpowers/specs/2026-06-15-asset-credits-design.md`) is retained for
  history; do not build it separately.
- [x] **N4. Import report polish** ✅ SUPERSEDED — shipped as **E4** (2026-06-02, commit dcbba70c).
  Kept for the record; do not rebuild.
- [x] **N5. Hygiene / coverage nibble** — one small, safe test-coverage addition or dead-code removal in a
  weakly-covered module. The always-available safe filler. ~1 run.
  - ✅ DONE 2026-05-30 — commit 70c8477c; added 5 validatePatchYaml map-kind tests (map/settings/world-map
    path had zero coverage); 978/978 tests pass; tsc clean; eslint 0 errors
- [x] **N6. Hygiene / coverage nibble #2** — fog-of-war geometry (`effectiveLit.ts`) had zero test coverage
  despite being correctness-critical (wrong reveal/conceal logic exposes DM content). ~1 run.
  - ✅ DONE 2026-05-30 — commit f9d89ad0; 15 new tests covering `pointInPolygon`, `isLit`, `effectivePolygons`;
    993/993 tests pass; tsc clean; eslint 0 errors
- [x] **N7. Hygiene / coverage nibble #3** — `inferType.ts` (folder→type inference) and
  `filterEntitiesForLens.ts` (DM/player visibility filter) both had zero test coverage despite being
  correctness-critical (wrong visibility filtering exposes DM content to players). ~1 run.
  - ✅ DONE 2026-05-30 — merge commit e22253c0; 23 tests for inferTypeFromPath/isIgnoredPath + 8 tests for
    filterEntitiesForLens; 1024/1024 tests pass; tsc clean; eslint 0 errors
- [x] **N8. Hygiene / coverage nibble #4** — `stagingState.ts` error-path branches: `updateStagingRow`
  with a `parseError` row, update-row type-change anchoring, empty patch passthrough, `resolvedVisibility`
  patch, and `isAllowedTargetPath` Windows backslash guard — all were untested branches on correctness-
  critical import routing logic. ~1 run.
  - ✅ DONE 2026-05-30 — merge commit e28c8247; 6 new tests; 1029/1029 tests pass; tsc clean; eslint 0 errors
- [x] **N9. Hygiene / coverage nibble #5** — `snippet.ts` branch coverage: leading "…" (match deep in body),
  trailing "…" (body extends far past match), and `escapeHtml()` converting `&`, `<`, `>` in surrounding
  display text. Three untested conditional branches in the search-snippet display logic. ~1 run.
  - ✅ DONE 2026-05-30 — merge commit 849c7983; 3 new tests; 1032/1032 tests pass; tsc clean; eslint 0 errors
- [x] **N10. Hygiene / coverage nibble #6** — `computeAtlasDiff.ts` (the editor's "Changes since last
  publish" diff engine) had five uncovered branches: `title-changed`, `summary-changed`, `route-added`,
  `route-removed`, `region-removed` on active maps, and overlays emitted when a whole map is removed.
  All are correctness-critical (a missed diff entry means the DM gets a silent gap in their publish
  summary). ~1 run.
  - ✅ DONE 2026-06-02 — commit e6cd02f9; 5 new tests in `atlas-diff.test.ts`; 1082 tests green (4 shards,
    no OOM); tsc clean; eslint 0 errors. Merged to auto/continuous-dev (merge a4457587).
- [x] **N11. Hygiene / coverage nibble #7** — `scripts/atlas/calendarDate.ts` (`parseAtlasDate`) had zero
  test coverage despite powering event-timeline sorting and player-visible date labels. Multiple branches:
  YYYY-MM-DD with/without a world calendar, YYYY-MM and YYYY partial dates, custom-calendar label
  formatting (month names + epoch suffix), month-index overflow clamp, and ISO 8601 Date.parse fallback.
  All correctness-critical: wrong date parsing = wrong sort order in the DM's event timeline. ~1 run.
  - ✅ DONE 2026-06-02 — commit f4cec947; 10 new tests in `src/test/calendar-date.test.ts`; 1092 tests
    green (4 shards, no OOM); tsc clean; eslint 0 errors. Merged to auto/continuous-dev (merge 0446e431).
- [x] **N12. Hygiene / coverage nibble #8** — `src/atlas/import/mapImport.ts` pure helpers had
  significant uncovered branches: `nameFromFilename` (entirely untested), `resolveSize` sizing modes
  (`stretch-to-current`, `center-natural`, `custom` with keepAspect variants), and `validateImportPlan`
  validation rules (duplicate map id, invalid map/layer size, external URL, missing src, unusual
  extension, oversize image). Discovered and fixed a real infinite-recursion bug: the no-currentMap
  fallback in `stretch-to-current`/`center-natural`/`fit-within-current` called `resolveSize(image)`
  without resetting the sizing mode, causing infinite recursion. Fixed by inlining the natural-size
  result; all three cases corrected. ~1 run.
  - ✅ DONE 2026-06-02 — commits 96a180c9 (fix+test: infinite-recursion bug fix + 21 new tests);
    merged 33d52578. Gate: 1124 tests green (4 shards, no OOM); tsc clean; eslint 0 errors (16
    pre-existing warnings).
- [x] **N13. Hygiene / coverage nibble #9** — `scripts/atlas/parseFrontmatter.ts` private helpers
  (`parsePlacements`, `parsePinStyle`, `parseProfile`, `parseRelationships`) had zero branch coverage
  on their validation/rejection paths. Key correctness cases: non-array inputs warn+return undefined,
  non-object items skipped, missing required fields warn+skip, pin priority clamped 0..10, invalid
  shape/labelMode silently ignored, relationship invalid visibility defaults to "dm" (security invariant).
  ~1 run.
  - ✅ DONE 2026-06-02 — commit ef1a12f4; 17 new tests in `src/test/atlas-parser-placements.test.ts`;
    merged 5c0a9d8e. Gate: 1141 tests green (4 shards, no OOM); tsc clean; eslint 0 errors (16
    pre-existing warnings).
- [x] **N14. Hygiene / coverage nibble #10** — `scripts/atlas/loadWorldConfig.ts` helper branches
  had zero test coverage: `sanitizeScale` (non-number/zero/negative `unitsPerPixel` → warn+undefined;
  default `unitLabel`), `sanitizeGrid` (invalid kind/size → warn+undefined; `enabled` default),
  `calendar` (empty or all-invalid months → warn+undefined; mixed valid/invalid filtering),
  `normalizeVis` (undefined → silent default; invalid string → warn+default), region geometry
  (fewer-than-3-points → warn+drop), route edge-cases (invalid mode, string waypoint conversion,
  invalid waypoint skip). ~1 run.
  - ✅ DONE 2026-06-02 — commit e0f82b90; 20 new tests in `src/test/atlas-world-loader.test.ts`;
    merged 81589996. Gate: 1161 tests green (4 shards, no OOM); tsc clean; eslint 0 errors (16
    pre-existing warnings).
- [x] **N16. Hygiene / coverage nibble #12** — `src/atlas/import/parseObsidian.ts` had several untested
  branches: `generateAutoSummary` truncation paths (blocks < 20 chars skipped → undefined; block > maxLen
  truncated at word boundary; hard char cut when no space); `parseObsidianFile` level="placeable" (dm +
  mappable type); broken-wikilink detection via `knownEntityNames`; player-published + broken-wikilinks
  warning; malformed YAML frontmatter error path; https:// attachment resolved=true; relative attachment
  unresolved warning. All are correctness-critical import UI paths.
  - ✅ DONE 2026-06-02 — commit fbe76799; 10 new tests added to `src/test/atlas-import.test.ts`;
    merged 46bf0952. Gate: 1175 tests green (4 shards, no OOM); tsc clean; eslint 0 errors (16
    pre-existing warnings).
- [x] **N17. Hygiene / coverage nibble #13** — `src/atlas/content/parseWikilinks.ts` had no tests for
  the security contract or edge cases: `tokenizeWikilinks` (empty body, no-wikilinks passthrough,
  resolved/broken/aliased links, token substitution, multi-link order) and `renderLinkTokens`
  (`hideBroken: true` must never leak raw target names to players — key security invariant; `hideBroken:
  false` exposes target in title attr for DM view; resolved `<a>` tag; HTML escaping in target and
  display text for XSS guard; URL-encoded href; out-of-bounds token index → empty string, no crash).
  - ✅ DONE 2026-06-02 — commit 9dcff86d; 15 new tests in `src/test/content/parseWikilinks.test.ts`;
    merged 1ae2f168. Gate: 1190 tests green (4 shards, no OOM); tsc clean; eslint 0 errors (16
    pre-existing warnings).
- [x] **N18. Hygiene / coverage nibble #14** — `src/atlas/profiles/profileBuild.ts` pure helpers
  (`compactProfile`, `compactDmProfile`, `compactPlayerProfile`, `isEmptyDmProfile`, `stripDmProfile`)
  had only 2 test cases across 4 functions with ~12 untested branches. All are correctness-critical:
  they determine what profile data ships in the player build (DM-only fields must be stripped).
  Branches covered: undefined inputs → undefined; empty-object inputs → undefined; whitespace-only
  values discarded; mixed valid/invalid fields → only valid kept + trimmed; rumors/visible_traits
  with empty strings filtered; dm-only profile half kept when player absent; player-only half kept
  when dm absent; isEmptyPlayer=true path in stripDmProfile (empty player object is preserved as-is).
  - ✅ DONE 2026-06-15 — commit 7c663c19; 18 new tests in `src/test/atlas-profiles.test.ts`;
    merged into auto/continuous-dev. Gate: 1268 tests green (4 shards, no OOM); tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings).
- [x] **N19. Hygiene / coverage nibble #15** — `src/atlas/pins/presets.ts` had only 3 tests
  covering the happy path for `defaultPresetForType`, `diffPinOverride`, and `resolvePinStyle`;
  `pinSvg` had zero coverage. Added 18 tests covering:
  - `defaultPresetForType(undefined)` and empty string → "custom"
  - Type aliases: `divine_site`→temple, `black_market`→shop, `wilderness_landmark`→hazard,
    `player_base`, `resonance_site`, `mystery`
  - Case-insensitivity: SETTLEMENT/NPC/Dungeon resolve correctly
  - `diffPinOverride` with explicit preset change stored as override
  - `diffPinOverride` preserving `labelMinZoom` and `priority` overrides
  - `resolvePinStyle` with no override / null override → returns preset defaults
  - `resolvePinStyle` for unknown type → custom preset
  - `pinSvg`: all 6 shape branches (circle/square/diamond/shield/star/teardrop)
  - `pinSvg`: dim option → opacity:0.6; pulse → atlas-pulse animation
  - ✅ DONE 2026-06-15 — commit 159dd883; 18 new tests in `src/test/atlas-pin-presets.test.ts`;
    merged 0de1cd00. Gate: 1286 tests green (4 shards, no OOM); tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings).
- [x] **N20. Hygiene / coverage nibble #16** — `src/atlas/session/sessionSnapshot.ts`
  (`sessionHasWork`) had 6 untested slice branches — override/map/region/route/fog/layer each
  returning true. `deserializeSession`'s inner state-field guard (missing required fields →
  null) was never reached because the existing "junk" test short-circuits at the version check.
  Added 15 tests: each `sessionHasWork` slice independently true and false; `deserializeSession`
  with valid version + non-object / missing-field state → null; pristine-match entityEdit not
  counted as work (gap in prior test).
  - ✅ DONE 2026-06-15 — commit 566f8515; 15 new tests in `src/test/session/sessionSnapshot.test.ts`;
    merged defb8429. Gate: 1301 tests green (4 shards, no OOM); tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings).
- [x] **N21. Hygiene / coverage nibble #17** — `src/atlas/editor/textareaInsert.ts` (toolbar text
  insertion helpers) had zero test coverage despite being the pure core of the DM editor's
  toolbar. Three functions: `wrapInline` (selection vs. placeholder; custom placeholder; full-string
  wrap; empty buffer), `prefixLines` (single line without/with trailing newline; multiline spanning;
  mid-line selection expands to line start), `insertBlock` (with/without trailing newline
  controlling insertAt; all four sep branches — head empty / ends-`\n\n` / ends-`\n` / bare text;
  trailingNl omitted when tail already starts with `\n`). 15 tests total.
  - ✅ DONE 2026-06-15 — commit 11b81910; 15 new tests in `src/test/textareaInsert.test.ts`;
    Gate: 1316 tests green (4 shards, no OOM); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).
- [x] **N22. Hygiene / coverage nibble #18** — `src/atlas/yaml/dump.ts` (`patchHeader`, `dumpYaml`)
  and `src/atlas/yaml/buildPatches.ts` (`buildEntityFrontmatterPatch`) had uncovered branches. The
  only existing test exercised `buildEntityFrontmatterPatch` as a smoke test; all the following were
  untested: `patchHeader` without notes (if-branch skipped); `patchHeader` with notes (lines appended);
  `dumpYaml` valid YAML structure + 2-space indent + no code fences; `buildEntityFrontmatterPatch`
  with no title (top object must omit title key); empty-array exclusion (aliases/tags: [] stripped);
  undefined-value exclusion; single-file singular suffix ("1 file"); multiple-files plural suffix
  ("2 files"); sections[] populated with label + yaml per patch; "# file:" body marker per patch.
  - ✅ DONE 2026-06-15 — commit b6062345; 15 new tests in `src/test/yaml/buildPatches.test.ts`;
    Gate: 1331 tests green (4 shards, no OOM); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).
- [x] **N23. Hygiene / coverage nibble #19** — `src/atlas/yaml/validatePatch.ts` (`validatePatchYaml`)
  had 17 uncovered branches across the `entity-frontmatter` and `placement` kinds. The `entity-frontmatter`
  kind (added in N22) had only 3 tests (valid, invalid visibility, markdown fences); all structural
  validation paths were untested. The `placement` kind was completely untested. Branches covered:
  `entity-frontmatter`: empty patch → "Patch is empty" error; no object blocks (top-level list) → error;
  block with no `atlas:` section → warning; `atlas:` is array or scalar (not a mapping) → error;
  `atlas.type` not a string → error; `atlas.summary` not a string → warning; `atlas.aliases / images /
  placements / relationships` not an array → errors; `placements[].mapId` not a string → warning;
  `placements[].x/y` non-numeric → error. `placement` kind: valid patch → ok; no placements block →
  error; missing mapId → warning; non-numeric coordinates → error.
  - ✅ DONE 2026-06-15 — commit 2406e018; 17 new tests added to `src/test/atlas-patch-engine.test.ts`
    (run routine-n23-20260615). Gate: 1348 tests green (4 shards, no OOM); tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings).
- [x] **N24. Hygiene / coverage nibble #20** — `src/atlas/content/stripDmBlocks.ts` is on the critical
  security path (strips DM-only `%%...%%` and `:::dm...:::` blocks before the player-safe build) but had
  only a single parity test covering one happy path. Multiple correctness branches were untested:
  `stripDmBlocks`: no-markers fast path (count:0, unbalanced:false); multiple `%%` blocks accumulate
  count; unbalanced `%%` (odd occurrence) detected as build error; fenced-code guard (unbalanced
  detection skips `%%` inside ` ``` ` blocks); unclosed `:::dm` (opens > closes) detected; balanced
  `:::dm`/`:::` pair not flagged; fenced-code guard for `:::dm`; 3+ blank-line collapse after strip;
  combined `%%` + `:::dm` in one pass. `stripDmFromShippingString`: undefined passthrough; no-marker
  fast path (string returned as-is); inline `%%` stripped + trimmed; internal whitespace collapsed
  after strip; `:::dm...:::` stripped.
  - ✅ DONE 2026-06-15 — commit a8aa28ed; 16 new tests in `src/test/content/stripDmBlocks.test.ts`
    (run routine-n24-20260615). Gate: 1364 tests green (4 shards, no OOM); tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings).
- [x] **N25. Render inline image embeds (`![[image.png]]`).** ⚠️ design-check first — changes player-visible rendering + touches the build pipeline.
  **Spec:** `docs/superpowers/specs/2026-06-15-render-image-embeds-design.md` — **read in full.**
  `![[Portrait.png]]` embeds silently vanish in the player view and in the published `atlas.json` because only
  the DM editor's `renderEntityMarkdown` applies an embed-conversion pre-pass before calling `marked`;
  `projectEntityForPlayer` and `build-atlas.ts` call `markdownToHtml` directly with no such pass. Extract the
  existing embed pre-pass from `renderEntityMarkdown.ts` into an exported `resolveImageEmbeds` helper and wire it
  into both gaps. The sanitizer already allows `img` — no sanitizer change. **Autonomy guard:** if rendering
  requires building a new vault-image → atlas-asset copy pipeline, ship the render change only and hand back the
  pipeline half. **Mandatory:** a secrecy regression test proving an embed inside a `%%` block is absent from player `bodyHtml`.
  - Files: `src/atlas/content/renderEntityMarkdown.ts`, `src/atlas/content/projectEntityForPlayer.ts`,
    `scripts/build-atlas.ts`; tests in `src/test/content/renderEntityMarkdown.test.ts` + extend `projectEntityForPlayer` tests.
  - **Touches the build pipeline** → gate also requires `npm run atlas:publish:integrity-smoke` **and** `npm run atlas:publish` green.
  - Done when: `![[Portrait.png]]` renders as `<img>` in the player viewer and in the published `atlas.json`; an
    embed inside `%%` is absent from player output (regression test); DM editor render unchanged; gate + integrity-smoke + atlas:publish green. ~1–2 runs.
  - ✅ DONE 2026-06-16 — commit 999587c8 (feat(N25): resolveImageEmbeds extracted from renderEntityMarkdown + wired
    into projectEntityForPlayer + build-atlas.ts; stripDmBlocks runs before resolveImageEmbeds in both paths so
    embeds in %%...%% absent from player output; 5 unit tests for resolveImageEmbeds + 4 tests for
    projectEntityForPlayer embed rendering incl. mandatory secrecy regression). Gate: 1447 tests green (4 shards,
    no OOM); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings); integrity-smoke 5/5;
    publish-orchestrator 10/10 clean. Note: vite build step of atlas:publish fails from external worktree path
    (pre-existing env issue, not caused by this change — inside-repo builds confirmed clean).
- [x] **N26. Render planned/broken wikilinks as visible "planned link" styling.**
  **Spec:** `docs/superpowers/specs/2026-06-15-render-planned-links-design.md` — **read in full.**
  Wikilinks whose target doesn't resolve render today as muted, non-clickable `atlas-unresolved` spans
  indistinguishable from plain prose. Split the single CSS class into `atlas-planned-link` (DM view — dashed
  amber underline + `title=` tooltip naming the target) and `atlas-planned-link-player` (player/player-preview —
  neutral dotted underline, no tooltip, no target in HTML). Change only `renderLinkTokens` in
  `src/atlas/content/parseWikilinks.ts` (reuse the existing `broken` flag; no new regex); update `src/index.css`
  (two new rules, remove old `.atlas-unresolved`); update tests. **CRITICAL security invariant:** `hideBroken: true`
  must never put `link.target` anywhere in the rendered HTML — the existing N17 security test must stay green; new
  cross-surface tests must assert class name + no-target-leak on both surfaces.
  - Files: `src/atlas/content/parseWikilinks.ts`, `src/index.css`, `src/test/content/parseWikilinks.test.ts`,
    `src/test/content/parseWikilinks-parity.test.ts`.
  - Done when: broken links render as `atlas-planned-link` (DM, amber dashed, tooltip present) or
    `atlas-planned-link-player` (player, neutral, no tooltip, no target in HTML); existing N17 security test green;
    new planned-link tests green across DM and player surfaces; standard gate green (sharded vitest, tsc, eslint). ~1 run.
  - ✅ DONE 2026-06-16 — commit f783e8e1 (feat(N26): render broken wikilinks as planned-link styling; atlas-planned-link DM dashed-amber + atlas-planned-link-player neutral dotted; dead .atlas-broken-link + .atlas-unresolved selectors removed; 3 new cross-surface planned-link tests + stale assertions updated; security invariant preserved). Gate: 1438 tests green (4 shards, no OOM); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings). Pure client-side CSS + one function change — no build-pipeline impact.

- [x] **N27. Hygiene / coverage nibble #21** — `src/atlas/peek/computePeekPosition.ts` (M1) had the
  right-edge clamp tested but two clamp branches untested: anchor at the left viewport edge clamped to
  `gap`, and mid-viewport anchor left at `rawLeft` unchanged. Also untested: the exact boundary where
  `roomBelow === card.height + gap` places below, vs one pixel short flips above. `usePeekController.ts`
  (M1) had three state-machine transitions untested: re-hover while peek already open (switches entity
  immediately without the open delay), `onCardLeave` (schedules the close grace period), and `dismiss`
  (immediately clears the peek card). 7 new tests total; pure test coverage — no source changes.
  - ✅ DONE 2026-06-18 — commit cb3853ac (test(N27): computePeekPosition left-edge clamp + unclamped
    middle + exact-boundary flip × 2; usePeekController re-hover + onCardLeave + dismiss; 7 new tests in
    computePeekPosition.test.ts + usePeekController.test.tsx). Gate: 1690 tests green (4 shards, no OOM;
    shard-4 RPC timeout flake confirmed infra); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).
- [x] **N28. Hygiene / coverage nibble #22** — `src/atlas/publish/BuildReportPanel.tsx` exports two pure
  functions (`deriveBuildIssues`, `buildReportToMarkdown`) with no test coverage. `deriveBuildIssues`
  converts raw `BuildReport` counts into structured `BuildReportIssue` records — all four count fields
  (missingAssets, duplicateSlugs, unresolvedLinks, externalAssets) had untested singular/plural branches,
  and the `parseWarningString` helper had untested owner-prefix and em-dash-suggestion paths.
  `buildReportToMarkdown` had no tests at all (ready/blocked header, meta fields, Fix line, scope
  formatting, summary counts). 19 new tests; pure test coverage — no source changes.
  - ✅ DONE 2026-06-20 — commit 720be4ca (test(N28): deriveBuildIssues + buildReportToMarkdown — 19 tests
    in src/atlas/publish/BuildReportPanel.test.ts). Gate: 19 tests green (targeted vitest run); tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings).
- [x] **N29. Hygiene / coverage nibble #23** — `src/atlas/secrets/playerSecretsStore.ts` (P1) had only
  happy-path coverage. Five corruption/recovery branches were untested: corrupt JSON in localStorage →
  defaults; `characterKey` stored as non-string → null; `unlocked` stored as non-array → empty list;
  non-string items inside `unlocked` array → filtered out; `localStorage.setItem` probe throws (storage
  unavailable) → graceful null/false defaults. `src/atlas/secrets/collectCharacterSecrets.ts` (P1)
  was missing the `e.secrets ?? []` null-guard path (entity with no `secrets` field at all → returns
  empty). 6 new tests across two files; pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit 4dd3826c (test(N29): playerSecretsStore corruption/recovery + collectCharacterSecrets undefined-secrets; 5 new tests in playerSecretsStore.test.ts + 1 in collectCharacterSecrets.test.ts). Gate: 13 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N30. Hygiene / coverage nibble #24** — `src/atlas/sync/useSyncSettings.ts` (K1) had zero test
  coverage despite being the persistence layer for the Obsidian sync panel. Four async functions with
  clear untested branches: `loadSettings`/`loadSyncMap` each have three paths (success → parsed object;
  non-ok response → empty object `{}`; fetch throws → empty object `{}`); `saveSettings`/`saveSyncMap`
  each have one path (POST to `/__atlas/local-write` with correct `name` + serialized `contents`).
  7 new tests in `src/test/sync-settings.test.ts` using `vi.stubGlobal("fetch", ...)` mocks;
  pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit 8199ab53 (test(N30): useSyncSettings fetch branches — loadSettings/saveSettings/loadSyncMap/saveSyncMap (7 tests)). Gate: 7 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N31. Hygiene / coverage nibble #25** — `src/atlas/entity/CreditBadge.tsx` (L1) had no dedicated
  component tests. The EntityPanel integration tests (L1 section) verified the conditional rendering
  branches (badge shown, badges=false hidden, no credit hidden), but the component's own contract was
  untested: text content rendered, `atlas-credit-badge` CSS class applied, `title` attribute equal to
  the credit string (tooltip), `aria-label` prefixed with "Image credit:", and `role="note"`. 5 new
  tests in `src/test/entity/CreditBadge.test.tsx`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit 8b4a131f (test(N31): CreditBadge pure component — 5 tests (text content, CSS class, title attr, aria-label, role)); merged ae3a6687. Gate: 5 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N32. Hygiene / coverage nibble #26** — `src/atlas/secrets/secretBlockView.ts` (P1) had no test
  coverage. It is the imperative DOM driver for the player-facing sealed-secret UI and has seven testable
  branches: character lock with no character key (host stays empty/invisible); character lock with key +
  reveal succeeds (inserts `atlas-secret-open` div); character lock with key + reveal returns null (host
  stays cleared); password lock renders sealed box with passphrase input and submit button; password lock
  with teaser text; password lock without teaser (no `.atlas-secret-teaser` element); password form submit
  with correct passphrase (content revealed, `markUnlocked` called); password form submit with wrong
  passphrase ("The seal holds firm." message, `markUnlocked` not called). 8 new tests using
  `vi.mock` for `revealToHtml` and `playerSecretsStore`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit 5e359416 (test(N32): secretBlockView DOM branches — 8 tests); merged d6476f7d. Gate: 8 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N33. Hygiene / coverage nibble #27** — `src/atlas/secrets/CharacterSecretsPage.tsx` (P1) had no
  test coverage. The `SecretsBody` sub-component drives the player-facing character-key sign-in and secret
  reveal flow with four distinct state branches: no key (sign-in form); key present + pending resolve
  (Searching…); key present + no secrets found (no-results message); key present + secrets found (secrets
  list with entity links). The form submit → `setCharacterKey` call and the Forget button → `forgetAll`
  call were also untested. 6 new tests in `src/test/secrets/CharacterSecretsPage.test.tsx` using
  `vi.mock` for `loadAtlasContent`, `playerSecretsStore`, and `collectCharacterSecrets`; pure test
  coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit 07ea3531 (test(N33): CharacterSecretsPage SecretsBody state machine — 6 tests); merged 2952a5ff. Gate: 6 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).
- [x] **N34. Hygiene / coverage nibble #28** — `src/atlas/content/projectEntityForPlayer.ts` is the core
  client-side secrecy projection function used by the honest-player-preview (G1) and the entity reading
  pane; it had seven untested branch gaps. Branches covered: alias-based wikilink redaction
  (`buildProjectionContext` wires aliases into the name index — a `[[Alias]]` link to a secret entity
  must be redacted via the alias path, not just the title path); `rumor`-visibility entity NOT in
  `secretIds` (security invariant: `PLAYER_VISIBLE` includes `"rumor"`, so links to rumor entities are
  preserved, not redacted); `relationships → undefined` when ALL relationships are filtered out (the
  `kept.length > 0 ? kept : undefined` branch was only exercised when at least one relationship survived);
  `%%dm%%` in a relationship label stripped (`stripDmFromShippingString` on `r.label`); `%%dm%%` in
  `entity.summary` stripped; `%%dm%%` in `entity.race` stripped; secret marker id containing `"` is
  HTML-escaped in `data-secret-id` attribute (XSS guard). 7 new tests in
  `src/test/content/projectEntityForPlayer-gaps.test.ts`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit 6201ce06 (test(N34): projectEntityForPlayer branch gaps — 7 tests); merged fb94220a. Gate: 7 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).
- [x] **N35. Hygiene / coverage nibble #29** — `src/atlas/sync/SyncPanel.tsx` (K1) had no dedicated
  component tests. `useSyncSettings` fetch branches were covered in N30, but the panel's own
  render/interaction contract was entirely untested: Sync button disabled when no vault path is saved;
  vault path and ignore globs populated from saved settings on mount; Sync button enabled when a vault
  path is loaded; Save button calls `saveSettings` with current vault path and parsed globs; Sync now
  button calls `onSync` prop with the vault root and parsed globs; last-sync timestamp displayed when
  `lastSyncAt` is set. 7 new tests in `src/test/sync-panel.test.tsx` using `vi.mock` for
  `useSyncSettings`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit 0d06fc95 (test(N35): SyncPanel render/interaction contract — 7 tests); merged 43f4012c. Gate: 7 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N36. Hygiene / coverage nibble #30** — `src/atlas/secrets/CharacterKeysPanel.tsx` (P1) had no test
  coverage. The panel's load/add/remove/persist contract was entirely untested: loading indicator shown
  while fetch is pending; empty state on 404; rows populated from saved YAML on mount; Add character adds
  a new row; Remove character removes the row; Save button calls `saveAtlasPatchToLocalFs` with the
  correct path and kind; Save button is disabled while save is in flight; blank-name rows excluded from
  the saved YAML. 8 new tests in `src/test/secrets/CharacterKeysPanel.test.tsx` mocking
  `localFsSave` and `sonner`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit fc323326 (test(N36): CharacterKeysPanel load/add/remove/persist contract — 8 tests); merged 3b2f2fc8. Gate: 8 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N37. Hygiene / coverage nibble #31** — `src/atlas/sound/AudioEngine.ts` (Phase 1a soundscape engine)
  had only 4 tests covering unlock/crossfade/cache/resume. 9 new tests added to the existing
  `src/test/sound/AudioEngine.test.ts` (13 total): `crossfadeTo(same id)` is a no-op; `crossfadeTo(null)`
  fades out active bed; `setMuted(true)` ramps master gain to 0; `setMuted(false)` ramps back to
  masterGain; `setMasterGain()` clamps to [0, 1]; `canPlay` fallback uses `srcFallback` when primary
  format is unsupported; `dispose()` clears context + buffer cache; LRU evicts oldest buffer when cache
  exceeds 4 entries. Pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit 26fa0366 (test(sound): N37 AudioEngine coverage — 9 new tests, 13 total); merged f37a9012. Gate: 13 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N38. Hygiene / coverage nibble #32** — `src/atlas/publish/usePublishFlow.ts` had four untested
  error branches in the `check()` and `confirm()` async state-machine. Existing tests covered HTTP errors
  at the state level but never asserted the `error` string, and the fetch-throw catch blocks were
  completely untested. Branches added: `check()` HTTP non-ok → `error` field = "Check failed (N)";
  `check()` network throw → `error` field = exception message; `confirm()` HTTP non-ok (500) →
  state "error" + `error` field = "Publish failed (500)"; `confirm()` network throw → state "error"
  + `error` field = exception message. 4 new tests (15 total); pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit b9b5ad90 (test(publish): N38 usePublishFlow error branches — 4 new tests). Gate: 15 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).
- [x] **N39. Hygiene / coverage nibble #33** — `src/atlas/sound/soundPrefs.ts` had four untested branches
  in `loadSoundPrefs`: the `!p` guard (stored JSON is `"null"` → `null` after parse, triggers `!p` check),
  the `typeof p !== "object"` guard (stored JSON is a number), the partial-prefs path (only some fields
  present in the stored object → missing fields fall back to per-field defaults), and the non-boolean
  field path (field values are strings/numbers/null → each falls back to its default). All are recovery
  paths that ensure corrupt or migrated localStorage data never leaves `loadSoundPrefs` with a malformed
  state. 4 new tests (7 total); pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit 05a081aa (test(sound): N39 soundPrefs missing branches — null JSON, non-object JSON, partial prefs, non-boolean fields (7 total)). Gate: 7 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N40. Hygiene / coverage nibble #34** — `src/atlas/sound/resolveSoundscape.ts` `selectActiveBed`
  had three untested branch groups: (1) the `viewArea <= 0` early-return path (zero-area viewport →
  returns `prevId` as-is, whether null or a live id); (2) the dead-band floor path (eligible empty,
  prevId set but coverage below `FILL_MIN × HYSTERESIS` → drops to silence, returning null — only the
  within-dead-band and null-prevId cases were previously tested); (3) the equal-size sibling stability
  guard (`prevId` is an eligible peer with the same `bboxArea` as the sort winner → keeps `prevId`
  to prevent flickering — previously only tested with `prevId=null`). 3 new `it` blocks with 5
  assertions total (10 tests in file); pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit 35b8156a (test(sound): N40 selectActiveBed gap coverage — zero-area viewport, below-dead-band drop, sibling stability (10 total)). Gate: 10 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N41. Hygiene / coverage nibble #35** — `src/test/sound/SoundControl.test.tsx` had only 1 test
  (the invite-to-speaker flow). Four untested branches in `SoundControl.tsx`: the dismiss button
  (hides the invite without enabling sound); the muted toggle (aria-label "Mute sound" → "Unmute sound"
  on click); the calm mode button (aria-pressed + text reflects calmMode state); and the post-enable
  invite-hide (invite and dismiss both absent once soundEnabled is true). 4 new tests (5 total);
  pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit dc6014e6 (test(ui): N41 SoundControl branch coverage — dismiss, mute toggle, calm mode, invite-hide (5 total)). Gate: 5 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N42. Hygiene / coverage nibble #36** — `src/test/sound/SoundSettingsProvider.test.tsx` had only
  1 test (calm mode toggle). Four untested branches in `SoundSettingsProvider.tsx`: `enableSound`
  (sets `soundEnabled: true` + persists via `saveSoundPrefs`); `setMuted(true/false)` (updates muted
  value exposed in context); muted state passes through to `engine.setMuted()` via the mirror effect;
  and `engine` ref stability across re-renders (the `useState(() => new AudioEngine(...))` initialiser
  guarantees the same instance, never recreated on state change). 4 new tests (5 total); pure test
  coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit e0b9f1c8 (test(sound): N42 SoundSettingsProvider branch coverage — enableSound, setMuted, engine pass-through, engine stability (5 total)). Gate: 5 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N43. Hygiene / coverage nibble #37** — `src/test/sound/SoundscapeLayer.logic.test.ts` had only
  2 tests for `computeActiveId` (basic area-hit and overview-scale null). Three untested branches in
  `selectActiveBed`: (1) prevId unchanged when it is already the sole eligible winner (`prevId ===
  smallest.id` → stability branch not entered, smallest returned directly); (2) hysteresis dead-band
  — eligible empty but prevId area's coverage is in [FILL_MIN×HYSTERESIS, FILL_MIN) → prevId kept;
  same setup without prevId → null; (3) area switch to a strictly smaller nested area — inner area
  has lower bboxArea than prevId's outer area so `smallest.bboxArea >= prev.bboxArea` is false and
  the new inner id is returned. 4 new `it` blocks (6 tests total); pure test coverage — no source
  changes. Also exports `FILL_MIN` and `HYSTERESIS` from `resolveSoundscape.ts` (they were already
  exported — import added to the test file only).
  - ✅ DONE 2026-06-21 — commit e1f03f50 (test(N43): computeActiveId branch coverage — stable prevId, hysteresis dead-band, area switch (6 tests total)). Gate: 6 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N44. Hygiene / coverage nibble #38** — `src/atlas/sound/readViewport.ts` had only 1 test
  (the basic lat-flip). The function is pure arithmetic (no branches) so the existing test already
  covered the happy path; three additional edge-case inputs were unguarded: (1) `mapHeight=0` — all
  y values become negated lats (cy = -lat, minY = -ne.lat, maxY = -sw.lat); (2) a viewport wider
  than the map (sw.lng negative, ne.lng > map width) — readViewport does NOT clamp, callers own that;
  (3) centre at the northwest corner (lat = mapHeight) → cy = 0 (top of map). 3 new `it` blocks (4
  tests total); pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit e7adfdbf (test(N44): readViewport edge-case coverage — mapHeight=0, oversized viewport, NW corner (4 tests)). Gate: 4 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N45. Hygiene / coverage nibble #39** — `src/atlas/entity/EntityPanel.tsx` CreditBadge
  integration had two untested structural branches: (1) `images.length === 0` — when the entity
  has no images the outer images-section guard (`images.length > 0`) is false, so the badge never
  renders even when `entity.credit` is set; (2) `images.length > 1` — when multiple images are
  present the badge should appear once per image (the `.map()` loop renders a CreditBadge inside
  each image `div`). N31 covered the pure CreditBadge component contract; these two tests cover the
  integration mount logic inside EntityPanel. 2 new tests (5 total in the credit-badge describe
  block); pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit 20a5faeb (test(N45): EntityPanel CreditBadge integration — zero-images guard + multi-image (2 new tests, 5 total)); merged b689a6b9. Gate: 15 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N46. Hygiene / coverage nibble #40** — `scripts/atlas/hashAudioAssets.ts` exports two functions
  but `rewriteAudioSrcs` had zero test coverage despite sitting on the build-atlas sound path
  (`build-atlas.ts:875` — rewrites every sound area's `src`/`srcFallback` to its content-hashed name
  in the published `atlas.json`). Eight branches covered: `src` found in rewrite map → hashed; `src`
  not found → original kept (`??` fallback); `srcFallback` present + found → hashed; `srcFallback`
  present + not found → original kept; no `srcFallback` → key absent from output; empty areas → `[]`;
  multi-area array → all areas rewritten; immutability — original `areas` array untouched. 8 new tests
  (14 total in file); pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit 6fca135c (test(N46): rewriteAudioSrcs branch coverage — 8 new tests, 14 total). Gate: 14 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N47. Hygiene / coverage nibble #41** — `src/atlas/entity/EntityPanel.tsx` (M1 hover-peek
  integration) had zero coverage for the `onPeek?.()`/`onPeekLeave?.()` prop-call bindings on
  backlink ("Mentioned in") buttons and Connections entry buttons. Both surfaces wire four events
  each (mouseEnter/mouseLeave/focus/blur) to the optional peek callbacks, but `EntityPanel.test.tsx`
  never passed either prop and never fired hover or focus events. 6 new tests: backlink mouseEnter
  → `onPeek("ally-npc", rect)`; backlink mouseLeave → `onPeekLeave()`; backlink focus →
  `onPeek("ally-npc", rect)`; backlink blur → `onPeekLeave()`; Connections mouseEnter →
  `onPeek("ally-npc", rect)`; Connections mouseLeave → `onPeekLeave()`. Pure test coverage —
  no source changes.
  - ✅ DONE 2026-06-21 — commit 86ab3321 (test(N47): EntityPanel hover-peek prop bindings — 6 new tests); merge dcd919c3. Gate: 21 tests green (targeted vitest run); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N48. Hygiene / coverage nibble #42** — `src/atlas/deepLink.ts` (`parseDeepLink`) had a latent
  bug: `Number("") === 0`, so empty-string params like `?cx=&cy=` parsed as `center:{x:0,y:0}` and
  `?cz=` parsed as `zoom:0` instead of `null`. The bug can't be triggered by the app's own
  `serializeDeepLink` (which only sets params to non-empty strings or omits them), but a hand-crafted
  URL would silently snap the viewport to the origin. Fixed by switching the three numeric-param checks
  from `cxStr !== null` to plain truthiness (`cxStr ? Number(cxStr) : NaN`), so empty string falls
  through to NaN (treated as absent). 4 new tests: empty map+entity strings → null; empty cx+cy →
  center null; valid cx + empty cy → center null; empty cz → zoom null. Source fix + 4 tests;
  16/16 deep-link tests green. No source changes to serializeDeepLink.
  - ✅ DONE 2026-06-21 — commit a882796d (fix+test(N48): parseDeepLink empty-string params treated as absent); merge 90c5c629. Gate: 16 tests green (targeted vitest); shard 1/4 435 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N49. Hygiene / coverage nibble #43** — `src/atlas/sound/readViewport.ts` had 4 tests (N44)
  covering the lat→y flip, zero-height map, x-direction overflow, and northwest-corner edge case, but
  the y-direction no-clamp contract was untested. The existing x-overflow test used a viewport whose y
  values were exactly at the map boundary (minY=0, maxY=mapHeight), so callers depending on negative
  minY or maxY > mapHeight had no documented proof of the no-clamping guarantee. Added 3 tests:
  (1) viewport north edge beyond map top → minY is negative (not clamped); (2) viewport south edge
  below map bottom → maxY exceeds mapHeight (not clamped); (3) both directions simultaneously out of
  bounds. All 7 readViewport tests green.
  - ✅ DONE 2026-06-21 — commit 036dcff6 (test(N49): readViewport y-direction overflow — 3 tests); merge 25d39ba3. Gate: 7 tests green (targeted vitest); shard 1/4 438 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N50. Hygiene / coverage nibble #44** — `src/atlas/pins/labelVisibility.ts` (`labelVisibilityThreshold`,
  `shouldShowLabel`) had 18 tests (F3) covering the main zoom presets but two gaps in the threshold
  sequence: zoom=-1 (threshold 4, between the tested -2=5 and 0=3) and zoom=1 (threshold 2, between
  the tested 0=3 and 2=1) were never directly asserted. Two `shouldShowLabel` boundary cases were
  also absent: `shouldShowLabel(2, 0)` = false (priority=0 hidden at zoom=2 where threshold=1 —
  documents that zoom 3 is the first zoom where priority-0 labels appear) and `shouldShowLabel(0, 0)`
  = false (priority=0 hidden at zoom=0 where threshold=3). 4 new tests (22 total); pure test
  coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit b79faded (test(N50): labelVisibility boundary gaps — 4 new tests, 22 total); merge 947de000. Gate: 22 tests green (targeted vitest); shard 1/4 438 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N51. Hygiene / coverage nibble #45** — `scripts/atlas/filterSoundscape.ts` (`filterSoundscapeForPlayer`)
  had its existing "preserves masterGain and enabled flag" test covering only the truthy cases (`enabled: true`,
  `masterGain: 0.6`). Three falsy-value gaps were untested: `masterGain: 0` (a valid mute-volume — the spread
  operator preserves it, but future refactors using `if (sc.masterGain)` would silently drop it); `enabled: false`
  (explicitly-disabled soundscape must pass through unchanged); and `sc.areas` being `undefined` (the `?? []`
  guard ensures no crash, producing `areas: []`). All three document the falsy-value contract that the object
  spread in the return must preserve. 3 new tests (13 total); pure test coverage — no source changes.
  - ✅ DONE 2026-06-21 — commit 9f23e1b0 (test(N51): filterSoundscape falsy-value coverage — masterGain:0, enabled:false, areas:undefined (13 total)); merge ef2fbbce. Gate: 13 tests green (targeted vitest); shard 1/4 441 tests green (known RPC timeout flake, all 51 test files pass); tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N52. Hygiene / coverage nibble #46** — `scripts/atlas/filterSoundscape.ts` (`filterSoundscapeForPlayer`)
  spread contract for area shape fields was untested: the `...rest` destructuring (which strips `name` and
  replaces `id`) must preserve all other fields. Two gaps: `regionId` (the ride-on link to a map region — present
  in the source comment "Preserves all other fields (bed src, gain, points, regionId, etc.)" but never asserted
  in tests) and `points` (the own-polygon array for sound-only zones). The `makeArea` helper used in all prior
  tests never passed either field, so both survival contracts were undocumented by tests. 2 new tests (15 total);
  pure test coverage — no source changes.
  - ✅ DONE 2026-06-22 — commit 87405d3e (test(N52): filterSoundscape ...rest spread — regionId + points survive neutralisation (15 total)); merge 7b3ab2a8. Gate: 15 tests green (targeted vitest); shard 1/4 443 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N53. Hygiene / coverage nibble #47** — `src/atlas/sound/resolveSoundscape.ts` (`prepareAreas`)
  skip-guard is `points.length < 3`, so exactly 3 points (a triangle — the minimum valid polygon) must NOT
  be skipped. The existing "skips degenerate polygons" test uses 2 points (caught by `< 3`), but the boundary
  at exactly 3 was untested, leaving the skip-guard's minimum undocumented. 1 new test (6 total in
  prepareAreas.test.ts); pure test coverage — no source changes.
  - ✅ DONE 2026-06-22 — commit 27e08bee (test(N53): prepareAreas triangle-boundary — exactly-3-point polygon is minimum valid (6 tests)). Gate: 6 tests green (targeted vitest); shard 1/4 443 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N54. Hygiene / fix+test nibble #48** — `src/atlas/content/renderEntityMarkdown.ts` (`resolveImageEmbeds`)
  silently passed the entire `![[image.png|Alt text]]` match (including the pipe-alias) as the asset filename,
  producing a broken src path `/atlas/assets/images/image.png|Alt text`. Fixed by splitting on `|` to use the
  left part as the filename and the right part (if present) as the alt text. Matches Obsidian's pipe-alias
  semantics: `![[image.png|Alt text]]` → `![Alt text](/atlas/assets/images/image.png)`. 2 new tests (16 total
  in renderEntityMarkdown.test.ts): pipe-alias uses alias as alt + filename as src; no-pipe behavior unchanged.
  Source fix + tests — build pipeline touched (`resolveImageEmbeds` called from `build-atlas.ts`).
  - ✅ DONE 2026-06-22 — commit 0206c87c (fix+test(N54): resolveImageEmbeds pipe-alias — 2 new tests, 16 total). Gate: 16 tests green (targeted vitest); shard 1/4 443 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings); atlas:publish 12/12 scans clean.

- [x] **N55. Hygiene / coverage nibble #49** — `src/atlas/content/renderEntityMarkdown.ts` pipeline had three
  untested edge cases. `renderEntityMarkdown` with an empty body produced empty html (no crash, no spurious
  tags); `renderEntityMarkdown` with a body that is only a `%%` block produced empty html (full strip +
  `dropOrphanFootnoteRefs` + markdown-to-html chain all produce `""`). `resolveImageEmbeds` called with a
  custom `resolveAsset` that returns an empty string produced `![alt]()` (empty src) — documents that the
  falsy-return contract is the caller's responsibility. 3 new tests (19 total in
  renderEntityMarkdown.test.ts); pure test coverage — no source changes.
  - ✅ DONE 2026-06-22 — commit b818fc45 (test(N55): renderEntityMarkdown edge cases — empty body, %%block-only body, resolveAsset empty-return (19 tests)). Gate: 19 tests green (targeted vitest); shard 1/4 443 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N56. Hygiene / coverage nibble #50** — `src/atlas/geometry/polygon.ts` (`bboxOf`) was only
  exercised by an axis-aligned square, where every vertex contributes to a different extreme by
  construction. A non-axis-aligned triangle documents the min/max contract where the four extremes come
  from different vertices: `[[10,80],[90,20],[50,90]]` → `{minX:10,minY:20,maxX:90,maxY:90}`.
  1 new test (9 total in `src/test/geometry/polygon.test.ts`); pure test coverage — no source changes.
  - ✅ DONE 2026-06-22 — commit d8c08062 (test(N56): bboxOf non-axis-aligned triangle — each vertex contributes a different extreme (9 tests)); merge 92883da0. Gate: 9 tests green (targeted vitest); shard 1/4 443 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N57. Hygiene / coverage nibble #51** — `src/atlas/publish/usePublishFlow.ts` state-machine
  intermediate transitions were implicit but unasserted. `check()` calls `setState("checking")`
  synchronously before the first `await`, and `confirm()` calls `setState("publishing")` similarly;
  both transitions were verifiable only by their final states in existing tests. Added 2 tests using
  a deferred-promise fetch mock to observe the mid-flight state: (1) `idle → checking immediately
  (before fetch resolves)` — asserts state is "checking" right after `act(() => check())` with a
  never-yet-resolved fetch, then resolves and confirms `ready`; (2) `confirm() transitions to
  publishing immediately (before fetch resolves)` — same pattern from the ready state. 2 new tests
  (17 total in `src/atlas/publish/usePublishFlow.test.ts`); pure test coverage — no source changes.
  - ✅ DONE 2026-06-22 — commit b0bc13f9 (test(publish): N57 usePublishFlow intermediate-state coverage — checking + publishing transitions (17 total)); merge e72667e9. Gate: 17 tests green (targeted vitest); shard 1/4 443 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N58. Hygiene / coverage nibble #52** — `src/atlas/ruler/measureDistance.ts` had an untested
  degenerate-scale edge case: a `MapScale` with `unitsPerPixel: 0` would produce a misleading `"0.0 mi"`
  label for any distance (truthy scale object, but multiplying by zero). Added a one-line guard
  (`scale && scale.unitsPerPixel !== 0`) so a zero-rate scale falls back to the plain pixel label, matching
  the `undefined` scale behaviour. 1 new test (7 total in `src/test/ruler/measureDistance.test.ts`).
  - ✅ DONE 2026-06-22 — commit abcd5ed3 (fix+test(N58): measureDistance degenerate-scale guard — unitsPerPixel:0 falls back to px label (7 tests)). Gate: 7 tests green (targeted vitest); shard 1/4 443 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N60. Hygiene / coverage nibble #53** — `src/atlas/tabs/PublishCheckTab.tsx` had no
  component-level tests despite being the primary publish action surface (added in J1). Added 8 tests
  mocking `usePublishFlow` to cover: idle (button enabled, hint visible), checking (spinner text shown,
  button disabled, idle hint absent, ReadinessCard safety verdict absent), published (success message
  shown), error (error string rendered). `PublishedDiffPanel` mocked to prevent fetch calls in jsdom.
  File: `src/test/publish-check-tab.test.tsx`.
  - ✅ DONE 2026-06-22 — commit c061b4a6 (test+nibble(N60): PublishCheckTab spinner/state coverage — 8 tests). Gate: 8 tests green (targeted vitest); shard 1/4 451 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N61. Hygiene / coverage nibble #54** — `src/atlas/tabs/TabFrame.tsx` is the shared frame
  for every DM creator cockpit tab but had no tests. Branches covered: title and YAML-count badge
  always rendered; draft badge shows zero and non-zero counts; blocking badge absent at 0 / present
  when > 0; warning badge absent at 0 / present when > 0; `rawYamlPreview` undefined → toggle
  absent; provided → toggle present, content hidden by default, shown after click, re-hidden after
  second click; empty string → `# (nothing to preview)` placeholder after toggle; children rendered.
  13 tests in `src/test/tabs/TabFrame.test.tsx`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-23 — commit 4731599f (test(N61): TabFrame render branches — 13 tests). Gate: 13 tests green (targeted vitest); shard 1/4 461 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N62. Hygiene / coverage nibble #55** — `src/atlas/tabs/FogTab.tsx` had only 6 tests covering
  the draw-fog section, fog-shapes-list, and feather-control. 14 new tests added in 4 describe blocks:
  **Reveals section** — title "Fog of war" always rendered; "No reveals yet" message when reveals is
  empty; reveal count label ("Reveals (2)") when populated; Clear-all button absent with no reveals,
  present with reveals. **Validation issues** — chips absent when issues is empty; blocking message
  rendered; warning message rendered. **Dirty state** — Discard button absent when not dirty; present
  when dirty and calls reset on click. **Cross-tab convenience reveals** — "Select a region" message
  when regionApi absent; "Reveal selected region" button when regionApi.selectedId is set; "Select a
  route" message when routeApi absent; "Reveal around route" button when routeApi.selectedId is set.
  Pure test coverage — no source changes.
  - ✅ DONE 2026-06-23 — commit 9ee0d2a8 (test(N62): FogTab render branches — 14 new tests); merge 42c4a035. Gate: 20 tests green (targeted vitest, 6 pre-existing + 14 new); shard 1/4 461 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N63. Hygiene / coverage nibble #56** — `src/atlas/tabs/RegionsTab.tsx` had no dedicated component
  tests. Seven describe blocks covering the key conditional render branches: **Empty state** — "No regions
  yet" message when effective is empty. **Region list** — name and point count rendered; "new" badge for
  regions in `draft.added`; "edit" badge for regions with edits (not in added). **Selected region form** —
  name input shown when `selectedId` matches; absent when no selection. **Validation chips** — absent when
  issues empty; blocking message rendered; warning message rendered. **Dirty state** — Discard button
  absent when not dirty; present when dirty and click calls reset. **Drawing mode** — "Draw region" button
  shown when not drawing; "Drawing — N pts" indicator shown when drawing is active. 13 new tests in
  `src/test/tabs/RegionsTab.test.tsx`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-23 — commit d20538d3 (test(N63): RegionsTab render branches — 13 tests); merge 1db982e8. Gate: 13 tests green (targeted vitest); shard 1/4 461 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N64. Hygiene / coverage nibble #57** — `src/atlas/tabs/RoutesTab.tsx` had no dedicated component
  tests. Seven describe blocks covering the key conditional render branches: **Empty state** — "No routes
  yet" message when effective is empty. **Route list** — name and waypoint count rendered; "new" badge for
  routes in `draft.added`; "edit" badge for routes with edits (not in added). **Selected route form** —
  name input shown when `selectedId` matches; absent when no selection. **Validation chips** — absent when
  issues empty; blocking message rendered; warning message rendered. **Dirty state** — Discard button
  absent when not dirty; present when dirty and click calls reset. **Drawing mode** — "Draw route" button
  shown when not drawing; drawing indicator with waypoint count shown when drawing is active. 13 new tests
  in `src/test/tabs/RoutesTab.test.tsx`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-23 — commit 436bcb1c (test(n64): RoutesTab render branches — 13 new tests); merge d5ae6c43. Gate: 13 tests green (targeted vitest); shard 1/4 461 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings). Previous run crashed at 00:00Z after writing commit; resumed at 03:05Z and completed merge.
- [x] **N65. Hygiene / coverage nibble #35** — `src/atlas/tabs/EntitiesTab.tsx` (the entity authoring
  panel) had no dedicated component tests despite being the primary DM data-entry surface. Added 15 tests
  in 7 describe blocks to a new `src/test/tabs/EntitiesTab.test.tsx`: **Empty state** — no entity form
  shown when entities list is empty. **Entity form** — sourcePath rendered when first entity auto-selected.
  **Discard button** — absent with no drafts; present with dirty count; click calls onDraftsChange({}).
  **Import bar** — hidden when neither handler provided; "Import .md files…" button shown with handler;
  "Paste markdown" shown with handler. **Relationship section** — "No relationships yet." empty state; DM
  badge for non-player-visibility relationships; unresolved entity warning; leak warning when player-visible
  relationship targets DM-only entity. **Handout bundle section** — "Print handout bundle" summary always
  rendered. Pure test coverage — no source changes.
  - ✅ DONE 2026-06-23 — commit d2c42bf2 (test(n65): EntitiesTab render branches — 15 new tests); merge
    from run/n65-20260623. Gate: 15 tests green (targeted vitest); shard 1/4 476 tests green; tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings).

- [x] **N66. Hygiene / coverage nibble #59** — `src/atlas/import/inferTypeFromTags.ts` (tag-keyword →
  entity-type resolver used in the import pipeline) had zero test coverage despite being correctness-critical:
  wrong tag mapping routes an NPC under the wrong tab after import. Added 45 tests in 7 describe blocks to
  `src/test/infer-type-from-tags.test.ts`: **non-array inputs** (null/undefined/string/number/object → null);
  **empty/no-match arrays** (empty, non-string items, unrecognized tags → null); **npc synonyms**
  (npc/character/person → "npc"); **faction synonyms** (faction/guild/organization/organisation → "faction");
  **item synonyms** (item/artifact/weapon/armor/armour → "item"); **17 single-keyword types** (event/lore/
  settlement/city/town/village/capital/port/region/ruin/dungeon/cave/temple/shop/hazard/landmark/location);
  **case-insensitive + whitespace-trim** (NPC/"  npc  "/tab-padded all match); **first-recognized-tag wins**
  (unrecognized prefix tags don't block the recognized hit; non-string items skipped). Pure coverage —
  no source changes.
  - ✅ DONE 2026-06-23 — commit b8fa8fde (test(n66): inferTypeFromTags — 45 branch-coverage tests); merge
    from run/n66-20260623. Gate: 45 tests green (targeted vitest); tsc EXIT:0; eslint 0 errors (16
    pre-existing warnings).

- [x] **N67. Hygiene / coverage nibble #60** — `src/atlas/save/canonicalEntitySave.ts` had two untested
  error paths in `buildCanonicalEntityChanges` and three untested edge cases in `entityFrontmatterPatches`.
  `useWorldYamlBaseline.ts` exported `worldYamlPath` (pure path-builder used by the save hook) with zero
  tests. 8 new tests extending `src/test/atlas-entity-save-seam.test.ts` in 4 new describe blocks:
  **worldYamlPath** (2 tests): correct `content/<worldId>/_atlas/world.yaml` format; single-segment id.
  **entityFrontmatterPatches edge cases** (4 tests): draft for unknown entity id silently omitted (not a
  crash); entity with `relationships: []` → `atlas.relationships: undefined` (no empty-array noise written
  to .md files); entity with a relationship preserves it; draft aliases override entity's existing aliases.
  **buildCanonicalEntityChanges error paths** (2 tests): `CanonicalSaveError` when placement references
  unknown entity id; `CanonicalSaveError` when entity has no `sourcePath` (player-mode atlas strips it —
  the "rebuild in DM mode" guard). Pure test coverage — no source changes.
  - ✅ DONE 2026-06-23 — commit b1dec300 (test(N67): canonicalEntitySave error paths + worldYamlPath — 8
    new tests); merge from run/n67-20260623. Gate: 11 tests green (8 new + 3 pre-existing); tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings).

- [x] **N68. Hygiene / coverage nibble #61** — `src/atlas/yaml/buildFullWorldYaml.ts` had three untested
  branch groups in `waterToYamlObject`, `creditsToYamlObject`, and `layerToYamlObject`. (1) **water
  round-trip**: all non-default fields (enabled:true, intensity:0.8, speed:0.6, crestColor:#aabbcc);
  enabled:false path (intensity/speed absent from YAML); default intensity/speed omitted from YAML when
  equal to DEFAULT_WATER values (0.35, 0.3) — documents the contract that callers need `resolveWater`
  to get defaults applied. (2) **credits round-trip**: badges:false + page:false survive serialisation
  (resolveCredits only defaults to true when the key is absent); credits key omitted when opts.credits
  is undefined, and loadWorldConfig then defaults both to true. (3) **layer optional fields**: rotation
  and tileSrc survive the YAML round-trip. 6 new tests; pure coverage — no source changes.
  - ✅ DONE 2026-06-23 — commit a6fc57a7 (test(N68): buildFullWorldYaml water/credits/layer optional
    fields — 6 new tests); merge `43835432`. Gate: 22 tests green (6 new + 16 pre-existing); tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings).

- [x] **N69. Hygiene / coverage nibble #62** — `src/atlas/shell/CommandPalette.tsx` had only 2 tests
  (Ctrl-K open + Escape close). Five interaction branches were untested: Meta-K (Cmd-K) opens the palette
  (the `e.metaKey` path in the keydown handler); ArrowDown advances `sel` — Enter fires `onChoose` on the
  second result; ArrowUp clamps `sel` at 0 — cannot navigate below the first result; clicking the backdrop
  overlay (`onMouseDown` on the outer div) closes the palette; clicking a result button fires `onChoose`
  and closes. `queryPalette` in `useCommandPalette.ts` had two untested branches: `'>'` with an empty
  search term returns all commands without recent-sorting (`commandOnly && !q` path, line 40 — distinct
  from the existing `'>pub'` test); sort-by-match-position — "Overview map" (`'o'` at index 0) ranks
  before "Corven" (`'o'` at index 1), documenting the `indexOf` sort contract. 7 new tests across both
  files; pure test coverage — no source changes.
  - ✅ DONE 2026-06-23 — commit 85dd2b7c (test(N69): CommandPalette + queryPalette branch coverage — 7
    new tests); merge 59a0dd35. Gate: 12 tests green (7 new + 5 pre-existing); tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings).

- [x] **N70. Hygiene / coverage nibble #63** — `src/atlas/yaml/worldYamlSerialize.ts` had a documented
  gap: no test for the case where the existing file contains ONLY header comments and no YAML keys.
  `captureLeadingCommentBlock` must capture every comment line and normalise to exactly one trailing
  blank separator even when there is no YAML body following them. Also untested: leading blank lines
  before the first comment are included in the capture; indented comments (`/^\s*#/`) are captured;
  a YAML key with an inline comment (non-leading `#`) stops the scan; single comment line with no
  trailing newline still gets the blank-line separator before the body.
  - Files: `src/test/world-yaml-serialize.test.ts`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-23 — commit 3e97a8c4 (test(N70): worldYamlSerialize edge-case coverage — 6 new
    tests); merge cce1ef03. Gate: 16 tests green (6 new + 10 pre-existing); tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings).

- [x] **N71. Hygiene / coverage nibble #64** — `scripts/build-atlas.ts` (`deriveTitle`) had six tests
  covering the happy-path but four branch groups were untested: non-string `fmTitle` values (number,
  boolean, object) that should fall through to the slug-derived path (the `typeof fmTitle === "string"`
  guard); multiple consecutive hyphens collapsed by the `/[-_]+/g` regex; mixed hyphens and underscores
  collapsed into spaces; unicode first-letter capitalisation via the `(\p{L})/gu` regex flag; and a
  leading separator producing a leading space that `.trim()` removes. 7 new tests (13 total);
  pure test coverage — no source changes.
  - Files: `src/test/build-atlas-programmatic.test.ts`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-23 — commit 129294e8 (test(N71): deriveTitle branch coverage — 7 new tests,
    13 total); merge bd26c741. Gate: 17 tests green (7 new + 6 pre-existing + 4 other suite tests);
    tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N73. Hygiene / coverage nibble #65** — `src/atlas/entity/EntityReadingView.tsx` had 3 tests
  covering the visibility banner and %%dm%% stripping but five branch groups were untested: the DM-mode
  wikilink resolution path (`byName` title map + `tokenizeWikilinks` + `renderLinkTokens`); the alias
  sub-path in the DM `byName` map; the `PLAYER_VISIBLE.has("rumor")` branch (only "player" was
  previously exercised); the empty-body edge case; and the optional callback props (`onClose`,
  `onShowOnMap`). 7 new tests (10 total); also updated the `ent()` helper to accept `aliases` (was
  hardcoded `[]`). Pure test coverage — no source changes.
  - Files: `src/test/entity/EntityReadingView.test.tsx`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-24 — commit ecc7506a (test(N73): EntityReadingView branch coverage — 7 new tests,
    10 total); merge 583da58d. Gate: 10 tests green (targeted vitest); shard 1/4 489 tests green;
    tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N74. Hygiene / coverage nibble #66** — `src/atlas/publish/PublishedDiffPanel.tsx` had only
  2 tests (entity render + no-changes message) despite the component having 13 untested render
  branches. Covered: header badge counts (entities/pins/maps+overlays each shown when
  `diff.counts` > 0); Placements section (added placement renders entity title + section heading;
  moved placement hint shows before/after coordinates; removed placement hint shows "mapId: removed");
  Maps section (added map renders name under "Maps (N)" heading); Regions & routes section
  (region-added overlay renders name + section heading); entity hint formatting (visibility-changed
  shows "visibility: x → y"; title-changed shows "title: x → y"); collapse toggle (header click
  flips `aria-expanded` and hides/shows content, round-trip verified); loading state (shows
  "Loading baseline…" while fetch is pending via `vi.stubGlobal`); missing baseline (shows "No
  baseline snapshot found." when fetch returns non-OK response). 13 new tests (15 total);
  pure test coverage — no source changes.
  - Files: `src/atlas/publish/PublishedDiffPanel.test.tsx`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-24 — commit bbb90d66 (test(N74): PublishedDiffPanel branch coverage — 13 new
    tests, 15 total); merge bbb90d66. Gate: 15 tests green (targeted vitest); shard 1/4 489 tests
    green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N75. Hygiene / coverage nibble #67** — `src/atlas/publish/ReadinessCard.tsx` had 5 tests
  covering the main happy paths but five branch groups were untested: `onConfirm` callback called
  when "Publish now" is clicked; `build-failed` with no `buildError` → no `<pre>` block rendered
  (the `buildFailed && result.buildError` guard); `locator.file` present in a reason → file path
  shown in mono; `locator.entityId + onGoToEntity` → "Go to entity" button shown, click fires
  callback with the entity id; `locator.entityId` without `onGoToEntity` → "Go to entity" button
  absent. 5 new tests (10 total); pure test coverage — no source changes.
  - Files: `src/atlas/publish/ReadinessCard.test.tsx`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-24 — commit 5f3ef0da (test(N75): ReadinessCard branch coverage — 5 new tests,
    10 total); merge 2a6585f0. Gate: 10 tests green (targeted vitest); shard 1/4 489 tests green;
    tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N76. Hygiene / coverage nibble #68** — `src/atlas/entity/EntityPanel.tsx` had 21 tests
  (Connections, credit-badge, N47 hover-peek) but nine structural/interaction branches were untested:
  the null-entity empty-state render; `entity.summary` quoted paragraph; `entity.aliases` "aka ..."
  line; `entity.visibility === "rumor"` → "Rumored — uncertain" badge; `entity.race` combined with
  type in the kicker ("Person · Human"); `entity.tags` rendered as # links; `placements` non-empty
  → "Show on map" button visible; `onShowOnMap` callback fired with the placement object on click;
  `onClose` callback fired when the X button is clicked. 9 new tests (30 total); pure test coverage
  — no source changes.
  - Files: `src/test/entity/EntityPanel.test.tsx`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-24 — commit e1ca29f2 (test(N76): EntityPanel structural branches — 9 new tests,
    30 total); merge fc68a9c5. Gate: 30 tests green (targeted vitest); shard 1/4 489 tests green;
    tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N77. Hygiene / coverage nibble #69** — `src/atlas/entity/EntityPanel.tsx` had two untested
  internal component branches. `ImageThumb` fires `onError` on image load failure → sets
  `broken=true` → renders "Image missing" placeholder div with the src in its `title` attribute
  (previously the broken state was never exercised in tests). `CopyLinkButton` sets `copied=true`
  after a successful `navigator.clipboard.writeText` → renders the Check icon with `text-green-500`
  class (copied state was never exercised). 3 new tests (33 total); pure test coverage — no source
  changes.
  - Files: `src/test/entity/EntityPanel.test.tsx`; pure test coverage — no source changes.
  - ✅ DONE 2026-06-24 — commit 76a98237 (test(N77): EntityPanel ImageThumb broken-image +
    CopyLinkButton copied state — 3 new tests, 33 total); merge 25b0445f. Gate: 33 tests green
    (targeted vitest); shard 1/4 489 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing
    warnings).

- [x] **N78. Hygiene / coverage nibble #70** — `src/atlas/tabs/PublishCheckTab.tsx` had 8 tests
  (N60) covering idle/checking/published/error publish-flow states. Ten new tests added across two
  describe blocks. **Publish-flow states:** `busy` → button text "Busy — finishing the current
  build" + disabled; `nothing-to-publish` → "Already up to date — nothing new to publish.";
  `git-failed` (no pushReason) → "Couldn't publish automatically" header; `git-failed` +
  pushReason "offline" → "You appear to be offline." sub-message; `git-failed` + pushReason
  "behind" → "Your branch is behind — pull first in GitHub Desktop."; `ready` + safe
  `checkResult` → `ReadinessCard` renders "Safe to publish — no DM-only content is exposed."
  **Issue rendering:** `IssueCard` with `issue.hint` → hint div rendered; `IssueCard` with
  `scope.mapId` + `onGoToMap` callback → "Go to map" button fires callback with mapId; `IssueCard`
  with `scope.entityId` + `onGoToEntity` → "Go to entity" button fires with entityId; `passedChecks`
  with items → "Passed (2)" collapsible header rendered. Also promoted `validateProject` to
  a `vi.mock` factory (preserving all other exports) so issue-rendering tests can control the
  report via `mockReturnValue`. 18/18 total tests green; pure test coverage — no source changes.
  - Files: `src/test/publish-check-tab.test.tsx`.
  - ✅ DONE 2026-06-24 — commit 6bc0c346 (test(N78): PublishCheckTab 10 new tests —
    busy/nothing-to-publish/git-failed/ready states + IssueCard hint/go-to callbacks + passedChecks
    block); merge 6466b258. Gate: 18/18 tests green (targeted vitest); shard 1/4 499 tests green;
    tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N79. Hygiene / coverage nibble #71** — `src/atlas/geometry/polygon.ts` had 9 tests covering
  interior/exterior/degenerate-polygon, square/triangle bboxOf, basic rectArea, and partial-overlap +
  disjoint rectIntersectArea. Seven new tests added to cover the remaining branches. The helpers are
  used by both fog rendering (`effectiveLit.ts`) and soundscape (`resolveSoundscape.ts`), making
  correctness-critical. Branches covered: `pointInPolygon` with empty array → false (length < 3 guard);
  `pointInPolygon` with single-point array → false (same guard); `bboxOf` single-point → collapsed
  bbox where min === max; `rectArea` zero-width (maxX === minX) → 0 via `Math.max(0, ...)` guard;
  `rectArea` inverted axes (maxX < minX) → 0 via same guard; `rectIntersectArea` touching edge
  (a.maxX === b.minX) → 0; `rectIntersectArea` inner rect fully inside outer → inner's area (1200).
  Pure test coverage — no source changes.
  - Files: `src/test/geometry/polygon.test.ts`.
  - ✅ DONE 2026-06-24 — commit 23bfb55b (test(n79): polygon.ts edge cases — 7 new tests); merge
    51b99e4e. Gate: 16/16 tests green (targeted vitest); shard 1/4 499 tests green; tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings).

- [x] **N80. Hygiene / coverage nibble #72** — `src/atlas/save/sourcePathAllowlist.ts` controls which
  paths can receive writes/reads via the dev-only local-FS save endpoint and is security-critical, but
  two functions had significant branch gaps. `isWritableAssetPath` (image upload allowlist) had zero
  test coverage. `isWritableSourcePath` had several untested input-guard branches.

  **isWritableSourcePath — input guards (5 new):**
  - empty string → false (length === 0 guard)
  - absolute path (leading `/`) → false
  - `./`-prefixed path → false
  - backslash (Windows-style) path → false (repo paths are POSIX)
  - `_atlas` branch with non-.yaml/.yml extension (e.g. `.json`) → false

  **isWritableAssetPath (8 new, 0 → 8):**
  - `public/atlas/assets/maps/<file>.png` → true
  - `public/atlas/assets/images/<file>.jpg` → true
  - `.gif` extension → true (animated portraits/tokens are a valid DM use case)
  - empty string → false
  - absolute path → false
  - `audio` bucket → false (only `maps` and `images` are writable)
  - non-image extension (`.yaml`) → false
  - sub-directory path (6 parts, length ≠ 5) → false

  Pure test coverage — no source changes.
  - Files: `src/test/save/sourcePathAllowlist.test.ts`.
  - ✅ DONE 2026-06-24 — commit 3084aca0 (test(N80): sourcePathAllowlist write-path guards — 13 new
    tests, 24 total); merge 70b92f55. Gate: 24/24 tests green (targeted vitest); shard 1/4 499 tests
    green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N81. Hygiene / coverage nibble #73** — `src/atlas/save/newEntitySave.ts` had only 2 tests
  covering the main happy paths. `slugify` is exported but never tested directly. `buildNewEntityChange`
  had four untested branches: summary absent → `atlas.summary` key missing; locations category →
  folder "settlements" + type "settlement"; kind with surrounding whitespace → trimmed before write;
  visibility "rumor" persists in atlas.visibility. 7 new tests (9 total); pure test coverage —
  no source changes.
  - **slugify (3 new):** leading/trailing non-alphanumeric stripped (`"!Hello World!"` → `"hello-world"`);
    apostrophe becomes dash separator between letters (`"Dragon's Lair"` → `"dragon-s-lair"`); multiple
    non-alphanumeric chars collapse to single dash (`"The Hilt & Flagon"` → `"the-hilt-flagon"`).
  - **buildNewEntityChange (4 new):** no summary → `atlas.summary` key absent; locations category →
    path uses `/settlements/` + type `"settlement"`; kind `"  ranger  "` (whitespace) → type `"ranger"`;
    visibility `"rumor"` → persists in atlas block + lore folder path correct.
  - Files: `src/test/save/newEntitySave.test.ts`.
  - ✅ DONE 2026-06-24 — commit 1beb3bc9 (test(N81): newEntitySave branch coverage — 7 new tests, 9
    total); merge 95877761. Gate: 9/9 tests green (targeted vitest); shard 1/4 499 tests green;
    tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N82. Hygiene / coverage nibble #74** — `src/atlas/save/canonicalPlacementSave.ts` had 11 tests
  covering the happy paths and known error conditions, but three branches in `readSourceFile` and
  `mergePlacementsIntoFrontmatter` were untested. 3 new tests (14 total); pure test coverage —
  no source changes.
  - **readSourceFile (2 new):** non-404 server error (status 500) → CanonicalSaveError with status
    in message; malformed response body (`contents: 42`, not a string) → CanonicalSaveError.
  - **mergePlacementsIntoFrontmatter (1 new):** data with no `atlas` key at all → creates atlas block
    from scratch (the `data.atlas ?? {}` coalescing path was never exercised with a bare object).
  - Files: `src/test/canonical-placement-save.test.ts`.
  - ✅ DONE 2026-06-24 — commit 376b1196 (test(N82): canonicalPlacementSave branch coverage — 3 new
    tests, 14 total); merge 376b1196. Gate: 14/14 tests green (targeted vitest); shard 1/4 502 tests
    green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

- [x] **N83. Hygiene / coverage nibble #75** — `src/atlas/tabs/download.ts` had 0 tests despite being
  the shared download helper used by all tab exports (JSON / Markdown / YAML). Two tests cover the
  single code path: anchor created with correct `download` filename, blob has correct `type` and `size`,
  `click()` called, `URL.revokeObjectURL` called with the object URL, and `toast.success` fires with the
  filename. `URL.createObjectURL` / `revokeObjectURL` defined via `Object.defineProperty` (jsdom doesn't
  implement them). Blob content verified via `.size` (jsdom v16 in this setup lacks `Blob.text()`).
  - Files: `src/test/tabs/download.test.ts` (new, 2 tests).
  - ✅ DONE 2026-06-24 — commit d4e2a712 (test(N83): downloadText coverage — 2 tests). Gate: 2/2 tests
    green (targeted vitest); shard 1/4 502 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing
    warnings).

- [x] **N84. Hygiene / coverage nibble #76** — `src/atlas/notes/playerNotes.ts` had 0 test coverage
  despite being the player-side scratchpad (localStorage read/write/export/import) with many
  error-handling branches. 11 tests cover: `loadNote` empty-id guard and missing-note null;
  `saveNote`+`loadNote` round-trip; empty-text deletion; `deleteNote`; `loadAllNotes` corrupt-JSON
  fallback; malformed-entry skip (missing text/updatedAt); `exportNotesJson`/`importNotesJson`
  wrapped-format round-trip; raw NoteMap import; invalid-JSON error; missing-text entry error. Uses
  `_resetNotesForTests()` for isolation (same pattern as `visitedPlaces.ts`).
  - Files: `src/test/notes/playerNotes.test.ts` (new, 11 tests).
  - ✅ DONE 2026-06-24 — commit f588def3 (test(N84): playerNotes coverage — 11 tests). Gate: 11/11 tests
    green (targeted vitest); shard 1/4 502 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing
    warnings). Merge commit 32eb45b3.

- [x] **N85. Hygiene / coverage nibble #77** — `src/atlas/editor/toolbarActions.ts` had two untested
  action cases: `secret:character` and `secret:password`. Both use `crypto.getRandomValues` to generate
  a unique `{{secret:s-...}}` id and call `insertBlock` — the block-insertion contract and uniqueness
  guarantee were undocumented by tests. 4 new tests (25 total): `secret:character` value matches
  `/\{\{secret:s-[a-z0-9]+\}\}/`; `secret:password` matches same regex; `secret:character` inserts
  after existing content as a block (`"intro\n\n{{secret:s-...}}\n"`); two consecutive calls produce
  different ids. Pure test coverage — no source changes.
  - Files: `src/test/editor/toolbarActions.test.ts`.
  - ✅ DONE 2026-06-24 — commit fdc06307 (test(N85): toolbarActions secret:character + secret:password
    — 4 new tests, 25 total). Gate: 25/25 tests green (targeted vitest); shard 1/4 502 tests green;
    tsc EXIT:0; eslint 0 errors (16 pre-existing warnings). Merge commit 0b494617.

- [x] **N86. Hygiene / coverage nibble #78** — `src/atlas/save/canonicalEntitySave.ts`
  `entityFrontmatterPatches` had several untested branches despite being on the critical Save path
  (the function builds the frontmatter patch set that gets written to entity .md files on every Save).
  Branches covered: empty drafts → []; unknown entity id → silently skipped (not thrown, so a stale
  draft for a deleted entity can't crash a Save); type / visibility / summary / aliases / images each
  independently tested for draft-wins vs entity-fallback; empty relationships array (from draft or
  from entity) → stripped to undefined in output; non-empty draft relationships preserved; entity
  relationship fallback when draft has none; draft profile wins over entity profile; entity profile
  used when no draft profile supplied. 11 tests total.
  - Files: new `src/test/save/canonicalEntitySave.test.ts`.
  - ✅ DONE 2026-06-24 — commit f335bde1 (test(N86): entityFrontmatterPatches branch coverage — 11
    new tests). Gate: 11/11 tests green (targeted vitest); shard 1/4 505 tests green; tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings). Merge commit c0856af1.

- [x] **N87. Hygiene / coverage nibble #79** — `src/atlas/editor/pinClickIntent.ts`
  `resolvePinClickIntent` had no test coverage despite being called on every map-pin click in
  the editor. 2-branch pure function: pending=true → place-anchor; pending=false →
  open-entity with entityId. 2 tests total.
  - Files: new `src/test/editor/pinClickIntent.test.ts`.
  - ✅ DONE 2026-06-24 — commit 549b79c4 (test(N87): pinClickIntent branch coverage — 2 new
    tests). Gate: 2/2 tests green (targeted vitest); shard 1/4 504 tests green; tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings). Merge commit d8088cde.

- [x] **N88. Hygiene / coverage nibble #80** — `src/atlas/content/projectMapForPlayer.ts` had 3
  uncovered branches in the player map-projection function (security-critical: wrong behaviour
  here could expose DM content to players).
  1. **Orphan placement** — the `!e` null-guard silently drops a pin whose entityId is not in
     the entities map (stale pin for a deleted entity must not crash and must not appear in
     `foggedEntityIds`). Previously only the `!PLAYER_VISIBLE` branch was tested.
  2. **`rumor`-visibility placement** — `rumor` is in PLAYER_VISIBLE so the pin must be included.
     Tested for routes already; not tested for placements.
  3. **Region with no `visibility` field** — defaults to `"dm"` via `r.visibility ?? "dm"`, so
     an unlabelled region must be excluded from the player projection. The `?? "dm"` default path
     was never exercised.
  3 tests added to existing `src/test/content/projectMapForPlayer.test.ts`.
  - Files: `src/test/content/projectMapForPlayer.test.ts` (3 tests added, no source changes).
  - ✅ DONE 2026-06-24 — commit eafc3472 (test(N88): projectMapForPlayer — 3 untested branches
    covered). Gate: 9/9 tests green (targeted vitest); shard 1/4 507 tests green; tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings). Merge commit 9bbbf031.

- [x] **N89. Hygiene / coverage nibble #81** — `src/atlas/content/projectEntityForPlayer.ts` had
  4 untested branches on the DM-content redaction path (security-critical).
  1. **Orphan `{{secret:id}}` marker** — the `!knownSecretIds.has(id) → return ""` branch drops
     a marker whose id has no matching entry in `entity.secrets` (stale reference after a secret
     is deleted). Explicitly documented in source but never tested.
  2. **`entity.secrets` undefined + secret marker** — `entity.secrets ?? []` yields an empty Set
     so every marker in the body is an orphan and gets dropped. Guards both the null-coalescing
     and the orphan-drop branch together.
  3. **Empty relationships array `[]`** — `relationships.length > 0` is false so the filter block
     is skipped; the output stays `[]` (not `undefined`). Distinct from the "all filtered →
     undefined" case already tested in N34.
  4. **`%%dm%%` in `relationship.description`** — the `r.description` strip branch is the sibling
     of the already-tested `r.label` strip; it was uncovered.
  4 tests added to `src/test/content/projectEntityForPlayer-gaps.test.ts` in a new
  "branch gaps (N89)" describe block. No source changes.
  - Files: `src/test/content/projectEntityForPlayer-gaps.test.ts` (4 tests added, no source changes).
  - ✅ DONE 2026-06-24 — commit 3a88495a (test(N89): projectEntityForPlayer — 4 untested branches
    covered). Gate: 11/11 tests green (targeted vitest); shard 1/4 511 tests green; tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings). Merge commit 5d7b9a53.

- [x] **N90. Hygiene / coverage nibble #82** — `src/atlas/secrets/secretCrypto.ts` had only
  3 tests (round-trip, wrong-passphrase → null, random salt/iv). Three output-contract and
  edge-case branches were untested:
  1. **Output byte-length contract** — `salt` decoded from base64 is exactly 16 bytes; `iv`
     is exactly 12 bytes (AES-256-GCM format contract; callers may depend on these lengths).
  2. **Empty-string plaintext** — `""` encrypts and decrypts back to `""` without error
     (TextEncoder + AES-GCM handle zero-length buffers correctly).
  3. **Unicode / multi-byte plaintext** — emoji and diacritical characters survive the
     TextEncoder → AES-GCM → TextDecoder round-trip intact.
  3 new tests (6 total); pure test coverage — no source changes.
  - Files: `src/test/secrets/secretCrypto.test.ts` (3 tests added, no source changes).
  - ✅ DONE 2026-06-24 — commit f2921ae1 (test(N90): secretCrypto output-format + empty-string +
    unicode — 3 new tests, 6 total). Gate: 6/6 tests green (targeted vitest); shard 1/4 511 tests
    green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings). Merge commit 8e686397.

- [x] **N91. Hygiene / coverage nibble #83** — `src/atlas/yaml/validatePatch.ts` had 4 branches
  left uncovered after N23: the YAML parse-error catch block, the `# entity:` multi-chunk
  separator in `splitYamlChunks` (distinct from the already-tested `# file:` path), and the
  `settings` / `world-map` kind aliases for the map-validation branch.
  1. **YAML parse error** — malformed YAML causes `yaml.loadAll` to throw; catch block sets
     `firstError` and emits "YAML parse error: …" in the errors array.
  2. **`# entity:` separator** — multi-chunk patch using `# entity:` headers splits into 2 valid
     frontmatter blocks, both pass structural validation (`ok: true`).
  3. **`settings` kind alias** — `validatePatchYaml(patch, "settings")` accepts a valid `maps:`
     array (same code path as `"map"`).
  4. **`world-map` kind alias** — `validatePatchYaml(patch, "world-map")` rejects a patch with
     no `maps:` array.
  4 new tests; pure test coverage — no source changes.
  - Files: `src/test/atlas-patch-engine.test.ts` (4 tests added, no source changes).
  - ✅ DONE 2026-06-24 — commit 3c43e1ca (test(N91): validatePatch — 4 uncovered branches).
    Gate: 35/35 tests green (targeted vitest); shard 1/4 511 tests green; tsc EXIT:0;
    eslint 0 errors (16 pre-existing warnings). Merge commit 7258523e.

- [x] **N92. Hygiene / coverage nibble #84** — `src/atlas/import/buildImportChanges.ts` had
  3 untested branches in its inner `readSourceFile` helper and the `needsReview` secrecy-increase
  bypass path (the critical "DM explicitly approved player-visibility for a new entity" gate).
  1. **Non-404 server error in update row** — `readSourceFile` returns status 500 → `ImportCommitError`
     with "Failed to read … status 500" in the message (`!res.ok` branch, not the 404 case).
  2. **Malformed read response in path-collision row** — server returns `{ contents: 42 }` (not a
     string) → `ImportCommitError` (`typeof body.contents !== "string"` guard).
  3. **`needsReview.reason === "secrecy-increase"` in create row** — when the DM explicitly approved
     a visibility upgrade via the sync-map review gate, `resolvedVisibility` (`"player"`) is used
     instead of the default `"dm"` guard. This branch was shadowed by the existing test that set
     `resolvedVisibility: "player"` but omitted `needsReview`.
  3 new tests (10 total); pure test additions — no source changes.
  - Files: `src/test/build-import-changes.test.ts` (3 tests added, no source changes).
  - ✅ DONE 2026-06-24 — commit 79b553f3 (test(N92): buildImportChanges branch coverage — 3 new
    tests, 10 total). Gate: 10/10 tests green (targeted vitest); shard 1/4 511 tests green;
    tsc EXIT:0; eslint 0 errors (16 pre-existing warnings). Merge commit 671f7030.

- [x] **N93. Hygiene / coverage nibble #85** — `src/atlas/content/frontmatterRewrite.ts` had no test
  file at all. Two untested branches: (1) `normaliseTags` receiving a bare string value (`tags: "npc"`)
  rather than an array — the string-input branch that returns `[existing.trim()]`; (2) `patch.summary`
  writing into `atlas.summary` — the field existed in the patch interface but was never exercised.
  Also covered: empty-string and `null` tag inputs (return `[]`), no-duplicate guard when the existing
  string tag equals the added tag, multi-field patch in one call, and preservation of untouched atlas
  fields and existing tag arrays.
  11 new tests (new file); pure test additions — no source changes.
  - Files: new `src/test/frontmatter-rewrite.test.ts` (11 tests, no source changes).
  - ✅ DONE 2026-06-24 — commit bfbacc59 (test(N93): frontmatterRewrite branch coverage — 11 new
    tests). Gate: 11/11 tests green (targeted vitest); shard 1/4 511 tests green;
    tsc EXIT:0; eslint 0 errors (16 pre-existing warnings). Merge commit c1a6fded.

- [x] **N94. Hygiene / coverage nibble #86** — `src/atlas/yaml/dump.ts` had no test file at all.
  Two pure exported functions with zero coverage: `patchHeader` (builds the standard comment
  block prepended to every tool-generated YAML patch) and `dumpYaml` (wraps `js-yaml` with fixed
  serialization options used by all patch builders).
  Branches covered for `patchHeader`: title / subject / applyTo / Generated-timestamp ISO format /
  CANON MODEL boilerplate all present; notes lines appear when `notes` is provided; extra lines
  added vs absent; empty-array `notes` omits the block (same line count as absent); trailing
  newline (blank separator before YAML body). Branches covered for `dumpYaml`: flat object
  serialization; 2-space nested indentation; `sortKeys: false` key-order preservation; array
  dash notation; no YAML document markers (`---` / `...`).
  14 new tests (new file); pure test additions — no source changes.
  - Files: new `src/test/yaml-dump.test.ts` (14 tests, no source changes).
  - ✅ DONE 2026-06-24 — commit ac4d9cbf (test(N94): yaml/dump — patchHeader and dumpYaml branch
    coverage (14 new tests)). Gate: 14/14 tests green (targeted vitest); shard 1/4 518 tests green;
    tsc EXIT:0; eslint 0 errors (16 pre-existing warnings). Merge commit 4cc81424.

- [x] **N95. Hygiene / coverage nibble #87** — `useEntityEditDraft.ts` had a large coverage gap:
  `setField` was completely untested, and the null-draft guard branches in both `setField` and
  `setBody` (the `d ? ... : d` false path when no draft is loaded) were unreachable under the
  existing test suite. `applySnapshot(null)` was also untested.
  5 new tests covering:
  - `setField` marks draft dirty after a field change
  - `setField` updates only the targeted field; all other fields unchanged
  - `setField` no-op when no draft is loaded (null guard false branch)
  - `setBody` no-op when no draft is loaded (null guard false branch)
  - `applySnapshot(null)` clears the draft
  Pure test additions — no source changes.
  - Files: new `src/test/categories/useEntityEditDraft.test.ts` (5 tests, no source changes).
  - ✅ DONE 2026-06-25 — commit 3ca4e6ac (test(N95): useEntityEditDraft — setField + null-draft
    no-op branch coverage (5 new tests)). Gate: 5/5 tests green (targeted vitest); shard 1/4
    525 tests green; tsc EXIT:0; eslint 0 errors (16 pre-existing warnings).

---

### O — Atmosphere soundscape

**Spec:** `docs/superpowers/specs/2026-06-17-atmosphere-sound-design.md`
**Plan (Phase 1a):** `docs/superpowers/plans/2026-06-18-atmosphere-soundscape-phase1a.md`
**Plan (Phase 1b):** `docs/superpowers/plans/2026-06-20-atmosphere-soundscape-phase1b.md`

- [x] **O1. Phase 1a — schema through player-build secrecy (Tasks 1–16).**
  Wires `SoundscapeConfig` schema into `atlas.json`; builds full React sound layer
  (`AudioEngine`, `SoundscapeLayer`, `SoundSettingsProvider`, `SoundControl`); integrates
  into `AtlasViewer`; adds YAML round-trip, player-build secrecy filter + content-hash
  audio filenames, build-time shape assertions, and Workbox audio range-request caching.
  Task 17 (first real sound file) BLOCKED — needs DM-supplied `.ogg`/`.mp3` audio files.
  - ✅ DONE 2026-06-18 — merge commit `c44f5d25`; Tasks 1–16 green; 1683 tests pass (4 shards);
    tsc clean; eslint 0 errors; atlas secrecy gates clean (check-secrets, check-derived, check-shape).
    **Task 17 BLOCKED:** add a sound file to `public/atlas/assets/audio/` and wire it into
    `world.yaml` soundscape config to activate the first live area — see plan Task 17 for exact YAML.

- [x] **O2. Phase 1b — DM sound-authoring UI.** ✅ DONE 2026-07-11 — shipped to main via PR #56 (SoundscapeTab DM sound-authoring panel + SoundAreaLayer wired into the editor); this queue mark was stale.
  **Design:** `docs/superpowers/specs/2026-06-17-atmosphere-sound-design.md` — **read in full first
  (focus on §10.4 editor authoring, §4 decisions, §6 activation, §9 secrecy, §10.1 schema).**
  **Plan:** `docs/superpowers/plans/2026-06-20-atmosphere-soundscape-phase1b.md` — **read in full; follow
  task-by-task.**
  Adds a **"Sound"** rail item to the DM editor so the DM can author soundscapes without hand-editing
  `world.yaml`: give an existing region a sound (ride-on), draw a custom sound zone on the map, pick an
  audio file per area, set Volume and Loudness, and Save. Persistence reuses the Phase 1a YAML
  round-trip (`soundscapeToYamlObject`) through the existing unified Save. No new persistence path, no
  player-runtime changes. All new code is editor-only (`__INCLUDE_EDITOR__`-gated). Real audio files are
  **not** required to build or test — tests use placeholder filenames.
  - **Prerequisite: O1 (Phase 1a, Tasks 1–16) must be merged.** Confirm `src/atlas/sound/` and
    `soundscapeToYamlObject` exist in the working tree before beginning.
  - Phases (order matters): **A** — authoring draft state (`useSoundscapeDraft` hook,
    `soundAreaDraftToConfig` pure helper); **B** — on-map drawing + panel (`SoundAreaLayer` draw-capture,
    `SoundscapeTab` authoring panel, `listAvailableAudio` file-picker helper); **C** — wire into the
    editor shell (Sound rail item in `railRegistry`, mount in `AtlasPlacementEditor`, player-build
    exclusion guard test); **D** — end-to-end verify (author → Save → build → `atlas:publish` green
    with placeholder audio; DM-only zone filtered, player zone survives with neutralised id + hashed
    filename).
  - **Editor gate:** all new code under `src/atlas/sound-editor/` + `src/atlas/tabs/SoundscapeTab.tsx`
    is reachable only from the `__INCLUDE_EDITOR__`-gated `AtlasPlacementEditor`. A structural guard
    test (Phase C, Task 8) asserts no player surface imports the authoring code.
  - **Phase 1a secrecy stays green:** newly drawn sound zones default to `visibility: dm`; Phase D
    re-runs `filterSoundscape` + `checkSoundscapeSecrecy` with authored data; `npm run atlas:publish`
    must be green.
  - Done when: the Sound rail item opens the authoring panel; the DM can give a player region a sound,
    draw a DM-only zone, pick `placeholder.ogg`, Save, and the correct soundscape appears in
    `world.yaml`; player build includes the player area (neutralised id + hashed filename) and excludes
    the DM zone; all Phase 1a secrecy gates green; sharded Vitest + tsc + eslint + atlas:publish green.
    ~3–4 runs.

---

## After the queue empties

Hand back per routine step 7 with candidate wants — do not invent direction. The human refuels the WANTS
section (or blesses nice-to-haves into wants), and the loop continues. The routine's job is execution; the
human's job is direction.

---

## 📥 INBOX — captured 2026-05-30, awaiting human sequencing

> ⚠️ **Do NOT auto-build from this section.** These are new candidates from a live dogfooding pass, parked
> here so they aren't lost. They are deliberately *not* `- [ ]` units and *not* in WANTS — the routine keeps
> popping from WANTS as normal and ignores this list. The human triages these into WANTS / NICE-TO-HAVES
> (with the right gate) after reviewing the ranked backlog.

Full detail + ranking: **`docs/DEVELOPMENT_WANTS.md`**.

- **Crash guard + error boundary** — selecting a location-less entry (e.g. an Event) white-screens the whole app; no error boundary contains it. → proposed WANT (top), no gate.
- **Proper-case entity names** — names render as lowercase file-slugs in search/title/pins. → proposed WANT, no gate.
- **Search snippet casing** — result snippets render lowercased straight from the index. → proposed WANT, no gate.
- **CSS @import order** — `leaflet.css` imported after the Tailwind directives (build warning every start). → hygiene nibble.
- **Editor works on first run** — dev serves the player atlas, so the editor opens with "Save won't work" until a manual build. → proposed WANT; write a short spec first (touches build wiring).
- **Categorize imported notes** — `imports/` NPCs don't appear under Characters or any type tab. → NICE-TO-HAVE, pairs with item B.
- **Image embeds dropped** — `![[image.png]]` vanishes silently in the reading view. → NICE-TO-HAVE (render) or WANT (just flag in Publish Check).
- **Honest player preview** — local view shows DM notes; no faithful redacted "as players see it" preview. → NICE-TO-HAVE, design-check first.
- **Planned/broken wikilinks** — `[[…/Note]]` / `[[Note#Heading]]` render as dead text. → fold into item C + surface in Publish Check.

---

## 📥 DEFERRED CANDIDATE POOL — Refuel 2026-07-14 (NOT yet blessed; parked for the DM)

These 83 additional candidates surfaced in the same discovery pass but were held back to
keep the blessed Q-series at 100. They are **not poppable** — the routine must NOT build these without
the DM promoting one into the WANTS section first (they still need the per-item design-check). Kept here
as a ready-to-promote reserve. Grouped by area.

**Player map/viewer** (5)
- **Stop the credit badge from overlapping the minimap in the corner** _(qol, 1 run)_ — MapCreditOverlay is absolutely positioned at right-2 bottom-2 z-[500] (MapCreditOverlay.tsx:50) while AtlasMinimap defau…
- **Make the minimap responsive: hide or collapse it on small/coarse-pointer viewports** _(qol, 1 run)_ — AtlasMinimap wires only onMouseDown + onWheel (AtlasMinimap.tsx:67-81) with no touch/pointer handlers, so on the player …
- **Give map pins accessible names and a keyboard focus ring** _(a11y, 1 run)_ — pinIconForStyle (AtlasViewer.tsx:83-98) builds Leaflet DivIcons whose SVG has no accessible name, and Markers set no `ti…
- **Center the map on region-linked entities that have no point placement** _(qol, 2-3 runs)_ — openEntity and EntityPanel's 'Show on map' only look up project.placements by entityId (AtlasViewer.tsx:334-338, 733-737…
- **Replace the plain 'Loading atlas…' text with a branded loading state** _(qol, 1 run)_ — The initial viewer load renders bare 'Loading atlas…' text (AtlasViewer.tsx:468-474). Swap in a small, calm branded load…

**Player entity/reading** (6)
- **Make inline body images click-to-zoom via the same lightbox** _(feature, 2-3 runs)_ — Body images (from ![[img]] embeds) currently render as bare <img> with no zoom. Add a delegated click handler on the pro…
- **Make the entity type kicker a link to browse-by-type** _(qol, 1 run)_ — In EntityPanel's header, the type label in the kicker is plain text while tags are already Links to /atlas/tag/<t>. Wrap…
- **Scroll footnote ref/backref jumps within the panel instead of via URL hash** _(qol, 1 run)_ — Footnote refs/backrefs render as <a href="#fn-id">/<a href="#fnref-id"> inside a Radix ScrollArea. Native hash navigatio…
- **Graceful empty-body state for stub entities in the reading panel** _(qol, 1 run)_ — When an entity has a summary/images but an empty body (common for stub/placeholder entries), the prose div renders as bl…
- **Show a hero-sized first image in the reading panel for portrait-led entities** _(qol, 2-3 runs)_ — The gallery renders every image as an equal 96px thumbnail, so an NPC's portrait gets no prominence. When an entity has …
- **Show estimated reading time / length on longer entity entries** _(qol, 1 run)_ — Add a pure helper that estimates reading time from the entity body word count and render a subtle indicator (e.g. '~3 mi…

**Player search/nav** (8)
- **Make Timeline event tags clickable links to their tag page** _(qol, 1 run)_ — Timeline entry cards render tags as plain text (`#{t}`), while Browse cards render them as real links to /atlas/tag/:tag…
- **Add clear button + aria-label to the Browse filter input** _(a11y, 1 run)_ — The Browse 'Filter…' input has no aria-label and no clear (X) button, unlike the Timeline filter which already has both.…
- **Wire the search palette as an accessible combobox/listbox** _(a11y, 2-3 runs)_ — SearchPalette results are plain buttons with data-index; the input is not exposed as a combobox and the active row is no…
- **Add Home/End/PageUp/PageDown navigation to the search palette** _(qol, 1 run)_ — SearchPalette keyboard handling only covers ArrowUp/ArrowDown/Enter. Add Home/End to jump to the first/last result and P…
- **Timeline newest-first / oldest-first sort toggle** _(qol, 1 run)_ — AtlasTimeline hard-sorts ascending by dateValue and groups years ascending. Add a small header toggle (oldest-first / ne…
- **Clamp/validate shared viewport in deep-link parsing** _(infra, 2-3 runs)_ — parseDeepLink accepts any finite cx/cy/cz; a stale or hand-edited share link can fly the viewer to an out-of-bounds cent…
- **Surface 'recently revealed' as a badge on Browse & Timeline cards** _(feature, 3-5 runs)_ — The recently-revealed diff (entities present now but absent from .last-published.json) is computed only inside SearchPal…
- **Timeline footer note for undated entries** _(qol, 1 run)_ — AtlasTimeline silently drops entities without a numeric dateValue, so a DM can't tell how many entries are missing from …

**Player a11y/mobile** (7)
- **Announce entity-open (and Wander) to screen readers on the desktop aside** _(a11y, 2-3 runs)_ — Opening a pin/search result on the desktop <aside> silently swaps panel content — no focus move, no announcement — and E…
- **Expose the Wander discovery meter as a progressbar** _(a11y, 1 run)_ — WanderControl renders the discovery bar as an aria-hidden div with the count only in adjacent text. Give the bar role=pr…
- **Make the map picker shrink instead of overflowing the toolbar on phones** _(qol, 1 run)_ — The map <SelectTrigger> is a fixed w-[180px] and is always rendered (when >1 map), so on ~375px viewports the toolbar (h…
- **Size the player sound controls to a 44px touch target** _(a11y, 1 run)_ — SoundControl's mute toggle is h-10 w-10 (40px, under the 44px comfortable target) and the calm-mode / dismiss controls a…
- **Add an accessible, keyboard-operable close to the image lightbox** _(a11y, 1 run)_ — In EntityPanel the image lightbox closes only by clicking the <img> (mouse) or Radix Escape; there is no visible close b…
- **Let touch/keyboard players read route distances (tap popup)** _(feature, 2-3 runs)_ — Route polylines in WrappedWorld only reveal name + distance + travel time via a Leaflet hover Tooltip, so touch and keyb…
- **Add a color-contrast guard test for player text tokens** _(infra, 2-3 runs)_ — Add a deterministic unit test that parses the HSL design tokens in index.css and computes WCAG contrast for the key play…

**Player sound** (6)
- **Persist the sound-invite dismissal** _(qol, 1 run)_ — The 'Tap to bring the world to life' invite's dismissed state lives only in SoundControl's useState, so a player who dec…
- **Reflect effective muted state when calm mode silences audio** _(qol, 1 run)_ — The provider silences audio via engine.setMuted(muted || calmMode), but the mute button still shows the unmuted 🔊 icon …
- **Consolidate the three floating audio controls into one popover** _(qol, 2-3 runs)_ — SoundControl renders an invite pill, a mute button, and a calm-mode pill as three always-visible bottom-right overlays. …
- **Polish the sound invite copy and accessibility** _(a11y, 1 run)_ — The invite reads 'Tap to bring the world to life' (touch-centric) and the calm pill is small low-contrast text. Neutrali…
- **Prevent audio-control collision with other map overlays on mobile** _(a11y, 1 run)_ — SoundControl is pinned bottom-right and WanderControl bottom-left; on narrow viewports these plus the discovery meter ca…
- **Keep an ambient bed's playback position across re-entry** _(qol, 2-3 runs)_ — crossfadeTo always creates a fresh BufferSource and source.start() from 0, so leaving an area and returning restarts its…

**DM editor** (6)
- **Extract a shared useDrawingKeyboard hook for the draw tabs** _(refactor, 2-3 runs)_ — RegionsTab, RoutesTab, and FogTab each carry a near-identical window keydown effect (skip when focus is in a form field;…
- **Close FormatToolbar dropdowns on outside-click and Escape** _(qol, 1 run)_ — The 'More' and 'Templates' menus in FormatToolbar only close when an item is clicked or the other menu opens; clicking e…
- **Feed recently-opened entities into the command palette** _(qol, 2-3 runs)_ — queryPalette already sorts the empty-query view by a 'recent' id list, but AtlasPlacementEditor always passes recent: []…
- **Keyboard arrow-key nudge for the selected region** _(qol, 2-3 runs)_ — RegionsTab already has a window keydown effect (handling Cmd+Delete to remove the selected region) and on-screen arrow n…
- **Add aria-pressed/labels to the Layers and Regions toolbar toggles** _(a11y, 1 run)_ — The distance-ruler toggle in the editor header sets aria-pressed and aria-label, but the sibling 'Layers' and 'Regions' …
- **Make Tab indent list lines in the body editor** _(qol, 2-3 runs)_ — In EntityEditPanel's body textarea, Tab is only handled when the autocomplete popover is open; otherwise it tabs focus o…

**DM import/Obsidian** (5)
- **Hide bare Obsidian block-id markers (^block-id) in rendered output** _(content-fidelity, 1 run)_ — Obsidian hides trailing block-anchor markers like ' ^abc123' at end of a block in reading view, but the atlas renders th…
- **Reconcile KNOWN_LIMITATIONS.md with the shipped renderer** _(docs, 1 run)_ — docs/KNOWN_LIMITATIONS.md's Obsidian-compat table is stale and contradicts the code + MARKDOWN_PARITY.md: it claims call…
- **Show a pre-commit outcome summary line in the import modal** _(qol, 1 run)_ — ImportStagingModal's footer shows only blocked/conflict counts. Reuse the existing summarizeImport + formatImportSummary…
- **Infer type from nested and scalar Obsidian tags** _(qol, 1 run)_ — inferTypeFromTags requires an array and exact-matches each tag, so real Obsidian usage misses: nested tags ('npc/merchan…
- **Auto-generate a summary for imported notes that lack one** _(qol, 2-3 runs)_ — The live import create-row path (buildImportChanges → rewriteFrontmatter) never sets a summary, so imported notes with n…

**DM publish/backup/assets** (6)
- **Add a filter and 'uncredited only' toggle to the Asset Manager list** _(qol, 1 run)_ — Add a text filter (by src/used-by) and an 'only show images without a credit' toggle to AssetManagerPanel so DMs with la…
- **Give the 'unknown' git-publish failure a plain-language fallback** _(qol, 1 run)_ — In PublishCheckTab the pushReason ternary returns an empty string for the 'unknown' classifyGitFailure case, leaving the…
- **Add an atlas:backup --list command to enumerate existing backups** _(dx, 1 run)_ — There is no way to see what backups exist without shelling into the backups/ folder. Add a --list mode (or a small compa…
- **Record oversize-image warnings in the build report so they show in-editor** _(content-fidelity, 2-3 runs)_ — build-atlas currently emits missingAssets/duplicateSlugs/etc into buildReport but not oversize-image findings, so 1–4MB …
- **Show the baseline publish date in the 'changes since last publish' panel** _(qol, 1 run)_ — AtlasDiff.meta already carries baselinePublishedAt/baselineVersion but PublishedDiffPanel never shows it. Render a small…
- **Make the oversize-image finding suggest a format-specific optimization** _(qol, 1 run)_ — The audit-assets oversize output just prints the size. Enrich the finding (in the CLI report and, if #12 lands, the buil…

**Build/perf** (5)
- **Emit fog-redacted player maps as WebP (.fog.webp) instead of ~3MB PNG** _(perf, 3-5 runs)_ — The 6 shipped map layers are 1448x1086 RGB and ~3MB each (~19MB, the dominant player payload). redactFogMap.redactLayer …
- **Add a total-player-payload budget check to atlas:audit-assets** _(infra, 1 run)_ — audit-assets.ts already sums totals.totalBytes and flags per-file oversize (1MB warn / 4MB error), but nothing bounds th…
- **Rasterize the fog mask once per map instead of once per layer** _(perf, 2-3 runs)_ — redactFogMap.redactLayer (called once per layer from build-atlas.redactMapsForPlayer:1221) rebuilds the full-map SVG mas…
- **Converge the PR-check workflow onto the parallel scan orchestrator** _(infra, 1 run)_ — atlas-pr-check.yml runs the leak scans as separate `npm run atlas:check-secrets/-derived/-shape` steps (each a fresh tsx…
- **Print shipped-artifact byte sizes in the player build report** _(infra, 1 run)_ — The end-of-build report in build-atlas.ts (lines ~1010-1048) prints entity/asset COUNTS but never the byte sizes of what…

**CI/DX** (6)
- **Add a concurrency group to the PR-check workflow** _(infra, 1 run)_ — atlas-pr-check.yml has no concurrency group, so every push to an open PR spawns a fresh full build+scan run while older …
- **Add engines + .nvmrc as the single Node-version source** _(dx, 1 run)_ — Both workflows hardcode node-version "20" and QUICK_START says 'Node 20+', but there is no engines field or .nvmrc. Add …
- **Harden pre-commit test-failure detection** _(dx, 1 run)_ — scripts/pre-commit.sh decides pass/fail by `grep -qE "failed \|"` on vitest's text output — brittle to reporter-format c…
- **Add job timeouts to the CI workflows** _(infra, 1 run)_ — Neither job in atlas-pr-check.yml nor publish-atlas.yml sets timeout-minutes, so a hung build/scan/deploy runs to the 6-…
- **Add a low-noise scheduled npm-audit safety net** _(infra, 1 run)_ — There is no dependency-vulnerability check anywhere in CI. Add a weekly `schedule:` workflow running `npm audit --audit-…
- **Fix QUICK_START drift on the publish safety-scan set** _(docs, 1 run)_ — docs/QUICK_START.md step 5 states the publish workflow 'Runs three safety scanners (atlas:check-secrets, atlas:check-der…

**Code-health/refactor** (7)
- **Extract shared FlatCRS leaflet constant** _(refactor, 1 run)_ — Both src/pages/AtlasViewer.tsx (line 78) and src/pages/AtlasPlacementEditor.tsx (line 143) declare the identical module-…
- **Extract buildDraftPlacements into a pure editor helper** _(refactor, 1 run)_ — AtlasPlacementEditor's buildDraftPlacements useCallback (lines 677-694) maps project.entities → PlacementOverride[] pure…
- **Extract worldYamlDirty dirty-signal aggregation as a pure helper** _(refactor, 1 run)_ — AtlasPlacementEditor lines ~700-724 compute mapMetadataDirty / layersDirty / worldSettingsDirty and OR them with regionD…
- **Dedupe CLI entrypoint guard across scan/build scripts** _(dx, 1 run)_ — Six scripts repeat the same IIFE `const arg1 = process.argv[1] ?? ''; return arg1.endsWith('<name>.ts') || arg1.endsWith…
- **Extract AtlasViewer deep-link URL-sync into a hook** _(refactor, 2-3 runs)_ — AtlasViewer.tsx holds three intertwined URL concerns: the replaceState viewport-sync effect (~lines 188-200), the popsta…
- **Home geometry helpers into geometry/polygon.ts** _(refactor, 1 run)_ — centroid(points) currently lives inside src/atlas/regions/useRegionDraft.ts (line 69) as a private helper on a Point[]. …
- **Consolidate recursive directory walk in scan scripts** _(infra, 2-3 runs)_ — check-derived-secrets.ts (walkMd/walk), check-image-privacy.ts (walkImages), check-no-secrets.ts (scanDir's walk), and c…

**Resilience/errors** (7)
- **Surface silent base-map image load failures on the main viewer** _(infra, 2-3 runs)_ — The main map's base-layer `<ImageOverlay>` elements in WrappedWorld (and OceanBackground layers) have no error handling:…
- **Show actionable technical detail in the crash screen for DM/editor builds only** _(infra, 1 run)_ — ErrorBoundary shows only a generic 'Something went wrong' message; a DM debugging a broken build has to open devtools to…
- **Add a shared toastError helper to standardize error-toast phrasing** _(dx, 2-3 runs)_ — The pattern `toast.error(\`... failed: ${e instanceof Error ? e.message : String(e)}\`)` is hand-repeated across the edi…
- **Configure the Toaster for clearer, persistent error feedback** _(a11y, 1 run)_ — The global `<Toaster/>` (sonner.tsx) uses defaults: no `richColors`, no `closeButton`, and default auto-dismiss. Actiona…
- **Replace OfflineStatus 2-second polling with event-driven cache detection** _(perf, 1 run)_ — Both OfflineStatus and OfflineMenu run a `setInterval(() => setCached(isOfflineReady()), 2000)` that re-reads `navigator…
- **Reuse the in-memory atlas cache when navigating between reader pages** _(perf, 2-3 runs)_ — loader.ts keeps a module-level parsed-project cache, but every reader page calls `loadAtlasContent(true)` with force=tru…
- **Tell the user when a shared deep-link points at a missing entry** _(qol, 1 run)_ — AtlasViewer resolves deep-link and back-navigation entity ids by setting openId and then doing `entityById.get(openId)`;…

**Docs/authoring** (9)
- **Fix editor tab/rail drift in README and WORKFLOWS to match the live rail** _(docs, 1 run)_ — README (line 46) and WORKFLOWS.md (lines 43-53) describe editor tabs as 'Pins, Maps, Regions, Routes, Fog, Sound, Entiti…
- **Remove stale 'Export Patch' workflow from the docs** _(docs, 1 run)_ — The Export Patch flow was removed program-wide (validateProject.ts:552 'The Export Patch flow was removed'; EntitiesTab.…
- **Update README 'Implemented and shipping' status list with shipped flagships** _(docs, 1 run)_ — README lines 27-49 list implemented features but omit ~7 shipped flagships: Player Secrets (sealed reveals + per-charact…
- **Reconcile import-flow docs with what the import wizard actually does** _(docs, 1 run)_ — WORKFLOWS.md lines 103-105 describe import-batch JSON records ('atlas/import-batches/<timestamp>.json') and a 'remove th…
- **Make the editor Help menu open a real in-app help panel instead of github.com** _(feature, 2-3 runs)_ — The editor's Help menu item (EditorMenu.tsx, allow-listed) currently runs window.open('https://github.com') in AtlasPlac…
- **Complete the README frontmatter field reference for under-documented atlas.* keys** _(docs, 1 run)_ — README's 'Important fields' table (lines 154-166) omits several schema fields a hand-authoring DM will hit: atlas.id (st…
- **Remove leftover generated patch/test artifacts from the astrath content _atlas folder** _(infra, 1 run)_ — content/astrath-deeprealm/_atlas/ contains stale cruft not read by the build: placements-patch-astrath-deeprealm-overvie…
- **Make calendar daysPerWeek honest in the docs (stored but not surfaced)** _(content-fidelity, 1 run)_ — world.yaml calendar.daysPerWeek is parsed (loadWorldConfig.ts) and round-tripped (buildFullWorldYaml.ts) but never rende…
- **Add a compact map key/legend to the player viewer** _(feature, 2-3 runs)_ — The player viewer has no legend explaining what pin shapes/colors mean (shapes vary by preset: teardrop/circle/square/di…
