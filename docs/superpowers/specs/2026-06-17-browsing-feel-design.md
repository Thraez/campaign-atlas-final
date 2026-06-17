# Joyful wayfinding — hover-peek cards & the wander button

**Created:** 2026-06-17 · **Status:** draft — awaiting DM review · **Owner:** the DM
**Source brief:** `docs/superpowers/specs/2026-06-17-browsing-feel-brief.md`
**Grounding:** all claims below are checked against the real code (file:line anchors inline). An
adversarial review of this design was run *before* writing (four parallel reviewers reading the code);
its blockers are folded in as hard requirements in the "Implementation requirements" tables.

---

## 1. Summary

Two player-site upgrades that make poking around the world joyful, built entirely over the
already-published, already-redacted player data:

- **Hover-peek card** — hover (desktop) or tap (phone) any place/person link, Connections entry, or map
  pin and a small card peeks: portrait, type badge, name, one-line summary, and — only when the place has
  a reachable spot — a button that flies the map there. Removes the "click-tax" on curiosity.
- **Wander button + discovery meter** — a dice button flies the player to a random place they can already
  see but haven't opened yet, and a quiet "X of Y places" meter fills as they roam. Manufactures
  serendipity from the entity graph the build already ships. Zero new authoring for the DM.

Both operate purely over player `atlas.json`; **neither adds any new secrecy surface** (§5.4).

North-star fit: *explore richer* without making the build heavier or the share less safe.

---

## 2. Goals / non-goals

**Goals**
- Let players survey the lore web and the map without committing a click.
- Give the map a gentle, self-fueling "what next?" that never reveals hidden content.
- Work on the static GitHub Pages player build (no backend, no accounts) and on phones.
- Stay invisible when data is thin (no portrait, no summary, few places) — degrade, never break.

**Non-goals (explicitly out)**
- Constellation / relationship-graph view (separate roadmap item).
- A full "footprints" history trail or region "doorway" shimmer (cut for scope; the filled-pin trail in
  §4.6 is the cheap subset we keep).
- Fuzzy search, per-party variants, server-backed player state (localStorage only).
- Mobile peek on map pins (a tap on a pin opens it, as today — §3.3).

---

## 3. Feature A — Hover-peek card

### A1. What the card shows

A single small card (the "peek"), with graceful fallbacks because both fields are optional
(`schema.ts:154-181`: `summary?`, `images: string[]`):

| Element | Source | Fallback when absent |
|---|---|---|
| Portrait (52px square, left) | `entity.images[0]` via `normalizeAtlasAssetUrl` (`src/atlas/url.ts:10-16`) | Omit the portrait entirely; card becomes text-only. **Never** render a blank/broken image box. |
| Type badge | `entity.type` | Always present (defaults to `note`). |
| Name | `entity.title` | Always present. |
| One-line summary | `entity.summary` (already DM-scrubbed at build, §5.4) | Omit the summary row; card is badge + name (+ map button). |
| Map button (top-right) | shown only when the entity has ≥1 placement in player data | Omit the button (see A2/§4.2). |

The portrait is the delight but is **content the DM adds over time** — today's sample atlas has 0% image
coverage, so launch cards will frequently be tasteful text-only and bloom into portraits as art lands.
This is expected, not a defect.

### A2. Where it appears (surfaces)

All three surfaces feed **one** card component (single-card invariant, §5.3) through a shared
`showPeek(entityId, anchorRect)` / `hidePeek()` callback:

1. **Links in entry prose** — `<a class="atlas-wikilink" …>` inside the rendered body
   (`parseWikilinks.ts:57`). Attached by **event delegation** on the prose container (A5-1).
2. **Connections / "Mentioned in" lists** — these are React `<button>` elements, **not** `atlas-wikilink`
   anchors (`EntityPanel.tsx`, backlinks/relationships sections). They get hover/focus handlers **directly
   in JSX** (A5-3) — a separate code path from the prose delegation.
3. **Map pins** — Leaflet `<Marker>` (`AtlasViewer.tsx` ~772). Today only `click` is wired; we add
   `mouseover`/`mouseout` (A5-4) and **remove the redundant Leaflet `<Popup>` if present** (it duplicates
   title+summary) so there is one bubble, not two. Keep the `<Tooltip>` quick-label.

### A3. Interaction contract

**Desktop (pointer: fine)**
- `mouseenter` a trigger → start a **200ms** open timer. Cancel it if the pointer moves >5px while pending
  or leaves the trigger (kills "card pops on every word while skimming").
- Card shows via portal (A4). It **persists while the pointer crosses onto it** — a **hover bridge**:
  `mouseleave` of the trigger starts an **80ms** close timer that is cancelled by `mouseenter` of the card.
  The card's own `mouseleave` closes it (same 80ms grace).
- **Card transfer:** if a card is already visible and the pointer enters a *different* trigger, show the
  new one immediately (skip the 200ms wait).
- **Cooling:** suppress re-show for ~400ms after a dismiss so bouncing off a card edge doesn't re-trigger.
- Dismiss on pointer-out (after grace) or **Escape**.

**Mobile (pointer: coarse)**
- Hover triggers are **disabled** (`matchMedia('(pointer: fine)')` guard) to dodge phantom-hover events.
- **Links / Connections:** first tap peeks the card in place; tapping the **name** or the **map button**
  navigates; tapping elsewhere dismisses. Implemented on `pointerdown`/`pointerup` (movement <8px, <300ms)
  with `stopImmediatePropagation()` on the existing click path so the first tap does not immediately
  navigate (A5-7). The dismiss-on-tap-outside is deferred one `requestAnimationFrame` so it cannot race
  the same-gesture show.
- **Pins:** a tap **opens** the entity as today (no peek). The card's primary extra action — "fly to the
  map" — is meaningless when you are already on the map, so peeking a pin on a phone earns nothing.

**Keyboard / screen reader** — see the full a11y contract in §6.

### A4. Positioning & rendering

- Render **one** `<HoverPeekCard>` at the `AtlasViewer` level into a portal targeting
  `#atlas-overlay-root` (a div appended once at the viewer root). This is **mandatory**: the entity body
  lives inside a Radix `<ScrollArea>` whose viewport is `overflow: hidden` (`EntityPanel.tsx`), which would
  clip any in-flow popover.
- Position with `position: fixed`, coordinates from the trigger's `getBoundingClientRect()`.
- **Flip above/below** the trigger based on available space (`rect.top` vs `window.innerHeight`), and clamp
  horizontally to the viewport so the card never covers the hovered line or spills off-screen.

### A5. Implementation requirements (from adversarial review)

| # | Severity | Requirement | Evidence |
|---|---|---|---|
| 1 | BLOCKER | `data-entity-id` is stripped by DOMPurify at render time. **Fix:** add `"data-entity-id"` to `ALLOWED_ATTR`. Handler must **also** fall back to parsing the id from `href="#/entity/{encoded}"` (decodeURIComponent) for resilience. | `sanitizeHtml.ts:46-54`; `parseWikilinks.ts:57` |
| 2 | BLOCKER | No mount mechanism exists. Attach a **delegated** `mouseover`/`mouseout` (+ pointer for mobile) on the prose container ref, matching `e.target.closest('.atlas-wikilink')`. Delegation survives entity navigation (the container div persists); per-node listeners do not. | `EntityPanel.tsx:316-320` |
| 3 | MAJOR | Connections/"Mentioned in" are React `<button>`s without `atlas-wikilink`. Add `onMouseEnter`/`onMouseLeave`/`onFocus` (+ pointer) directly on those buttons, calling `showPeek(b.id, rect)`. | `EntityPanel.tsx` backlinks/relationships sections |
| 4 | MAJOR | Map pins have only `click`. Add `mouseover`/`mouseout` to the `<Marker>` `eventHandlers`; remove the redundant `<Popup>` if present; keep `<Tooltip>`. | `AtlasViewer.tsx` ~768-789 |
| 5 | MAJOR | The card needs the full placements list (to decide the map button and to fly). Drive it from `AtlasViewer` scope where `data.project.placements` lives — do **not** render it inside `EntityPanel` (which only sees the current entity's placements). | `EntityPanel.tsx:24-26` props; `AtlasViewer.tsx` data load |
| 6 | MINOR | Guard `entity.images.length > 0 && entity.images[0]` before building the portrait URL (`normalizeAtlasAssetUrl("")` returns the base path, a wrong image). | `src/atlas/url.ts:10-16` |
| 7 | BLOCKER | Mobile tap model must intercept the existing `e.preventDefault()`+immediate-`openEntity` click delegation; use pointer events + `stopImmediatePropagation`, dismiss-outside deferred 1 rAF. | `AtlasViewer.tsx` link click delegation (~311) |

---

## 4. Feature B — Wander & discovery

### B1. Behavior

Tapping **Wander** flies the player to a random place that is (a) present in their player data — i.e.
visible within their fog by construction (§5.4) — and (b) not yet opened. Per the DM's decision, Wander
**roams the whole revealed world**: if the chosen place is on a different map than the current view, the
view switches to that map and flies there (B3). It never reveals fogged/unreached places — there is
nothing fogged in the data to fly to. If no unopened place remains anywhere revealed, Wander **does not
move** the player; it shows a quiet, transient note ("You've explored everything you can reach — travel
onward to uncover more") and leaves them put.

"Nearest" is **dropped**: per-map coordinate spaces are not comparable across maps
(`schema.ts:183-210`, `FlatCRS` per map), and roam-anywhere does not need it. Selection is uniform-random
over the eligible pool.

### B2. The wander pool

- Pool = **distinct `entityId`s** that have ≥1 placement in `data.project.placements`, **minus** the
  visited set. Built from placements (not entities) so every candidate is guaranteed flyable
  (entities can exist without any pin).
- `data.project.placements` in the player build already excludes secret and fogged placements
  (`build-atlas.ts:654-655`, `:664-665`), so no runtime fog/secrecy filtering is needed or possible
  (fog geometry is not shipped to players — §5.4).
- Dedup by entity: an entity pinned on overlapping maps counts **once** and is flown to via any one of its
  placements.

### B3. Cross-map landing & Back

Today `openEntity(id, fly)` only flies when a placement exists **on the active map**
(`AtlasViewer.tsx` ~294) — flying to a different-map pin would silently no-op. Wander therefore must:

1. Resolve the chosen entity's placement → `{ mapId, x, y }`.
2. If `mapId !== activeMapId`, `setActiveMapId(mapId)` and stage a **pending fly** keyed to
   `(mapId, entityId)` so the fly runs once the new map's controller mounts (avoid the map-switch ↔ flyTo
   race; the fly must not fire before the target map exists).
3. `openEntity(entityId, /*fly*/ true)` to open the panel, animate, and push a deep-link history entry
   (`serializeDeepLink` → `pushState`, `deepLink.ts`).

Back navigation is preserved: the pre-wander view is already in the URL via `replaceState`, and `pushState`
layers the wander target on top, so `popstate` restores the prior place. (Cross-map Back may restore a
slightly stale center; acceptable.)

### B4. The discovery meter

- A slim bar + "**X of Y places**", living by the map's zoom controls (movable later if the DM wants).
- **Y = whole world**: count of distinct `entityId`s present in `data.project.placements` (already
  fog-excluded, so far-off fogged regions are not counted until the DM lifts fog in a future build and
  redeploys — Y grows across deployments, never telegraphing hidden content).
- **X** = how many of those Y places are in the visited set (i.e. visited ∩ placement-entities — visiting
  a person who has no pin does not move the meter).
- A *place* is counted once even if pinned on overlapping maps (dedup by entity, as the pool).

### B5. "Discovered" definition & the visited store

- **Discovered = an entity's panel was opened, by any means** — click, search result, deep-link, Back, the
  hover card's map button, or Wander. (Hover alone does **not** count; otherwise hovering 40 pins would
  instantly read 40/40 and break the feature.)
- **Single write point:** a `useEffect` in `AtlasViewer` watching `openId` calls `markVisited(openId)`.
  This catches every path including direct deep-link/Back restores that set `openId` without going through
  `openEntity` (`AtlasViewer.tsx` ~235). Re-marking an already-visited id is a harmless no-op.
- **Store:** a new module mirroring `src/atlas/notes/playerNotes.ts` exactly — key `atlas-visited-v1`,
  `getStorage()` probe (`playerNotes.ts:13-25`), every read/write wrapped in try/catch (including the
  `setItem` write, to swallow quota-exceeded), shape `Record<string, { visitedAt: string }>`.
- **Reactivity:** keep a `visitedIds: Set<string>` in `AtlasViewer` state, initialised once from storage,
  updated by `markVisited`. Pins and the meter read the **state**, not raw storage, so they update within
  the session (§5.1).
- **Graceful degradation:** if storage is unavailable (private mode / disabled / quota), the store returns
  empty and writes no-op; Wander and the meter still function for the session, just without memory.

### B6. Filled pins (footprints — the cheap subset we keep)

Discovered pins render **filled**; undiscovered pins render **hollow** — the map itself becomes the
progress trail, reusing the same `visitedIds` state. This is the only "footprints" feature in scope.

### B7. Edge & empty states

| Situation | Behavior |
|---|---|
| Brand-new player (empty visited set) | Whole pool is eligible; first Wander flies to a random place. |
| Everything reachable already opened (X = Y) | Wander button becomes a calm "All N places found ✓"; no move on tap. |
| Pool momentarily empty but X < Y (shouldn't occur given Y/pool share a source) | Transient "explored everything you can reach" note; no move. |
| World with 0 places | Hide the Wander button and meter entirely. |
| World with 1 place | First tap flies there; subsequent taps show the all-found state. |

### B8. Implementation requirements (from adversarial review)

| # | Severity | Requirement | Evidence |
|---|---|---|---|
| 1 | BLOCKER | "Discovered" must be hooked at the single `openId` choke point, not on hover. | `AtlasViewer.tsx` ~275-299, ~235 |
| 2 | BLOCKER | Cross-map wander must `setActiveMapId` + staged fly; raw `openEntity` only flies within the active map. | `AtlasViewer.tsx` ~294 |
| 3 | MAJOR | Build the pool & meter from `project.placements`, dedup by entityId. | `schema.ts:183-210` |
| 4 | MAJOR | Drop cross-map "nearest"; uniform random over the pool. | per-map `FlatCRS` |
| 5 | MINOR | Visited set must be React state, not raw localStorage reads in the render path. | `playerNotes.ts` pattern |

---

## 5. Shared architecture

### 5.1 Visited store module (`src/atlas/visited/visitedPlaces.ts`, new)
Copy `playerNotes.ts` structure. Public surface: `loadVisited(): Set<string>`, `markVisited(id): void`,
`isVisited(id): boolean` (or just expose load + a write that returns the new set). Key `atlas-visited-v1`.
All storage access via the `getStorage()` probe + try/catch. No URL involvement (visited state must never
ride in deep-links — it is per-device).

### 5.2 Atlas data access
The card and wander both need `data.project.entities` (by id) and `data.project.placements`. These already
live in `AtlasViewer`. Centralise the card and wander UI at that level (or a small context exposing
`{ entityById, placements, showPeek, hidePeek }`) rather than prop-drilling.

### 5.3 The overlay root & single-card invariant
One `#atlas-overlay-root` portal target; one `<HoverPeekCard>` instance driven by a `peek` state
`{ entityId, anchorRect } | null`. All three surfaces call the same `showPeek`/`hidePeek`. Guarantees a
single card, clean transfer, and clip-free rendering.

### 5.4 Secrecy posture (verified — no new surface)
Confirmed firsthand in the build:
- Secret entities excluded from the player build: `isSecret = !PLAYER_VISIBLE.has(visibility) ||
  publish === false` (`build-atlas.ts:347`); `if (flags.player && isSecret) { … continue; }` (`:409-410`).
- Their placements excluded: `:654-655`; fogged pins excluded: `:664-665` (`isFoggedOnMap`, `:618`).
- Links to secrets redacted in public bodies: `:534`. Fog geometry is stripped from the player atlas and
  the map image is pre-baked alpha-masked, so **no fog polygons ship to players**.
- `summary` is DM-scrubbed at build (`stripField`/`stripDmFromShippingString`).
- Publish scans (`atlas:publish` → `check-no-secrets`, `check-derived-secrets`, `check-image-privacy`,
  `check-fog-safety`, `check-artifact-shape`) cover `dist/` and `public/atlas/`.

Because both features read only the same player `atlas.json` every other consumer reads — no second fetch,
no new field — they introduce **no new way for DM content to leak**. A crafted `?entity=<secret-id>` URL
resolves to `null` (the id isn't in the player `entityById`).

---

## 6. Accessibility contract

- Wikilink anchors gain `aria-haspopup="dialog"` (emitted in `parseWikilinks.ts:57`); Connections buttons
  get the same.
- The card is `role="dialog"`, `aria-label="{title} preview"`, `aria-modal="false"` (a tooltip role cannot
  legally contain the interactive map button).
- **Keyboard:** focusing a trigger shows the card; **Tab** moves focus **into** the card (map button is the
  first focusable element); **Escape** dismisses and returns focus to the originating trigger. The card's
  Escape handler must `stopPropagation` so it does not also close the search palette (the existing Escape
  handler in `AtlasViewer.tsx` ~321-326).
- Map button: `aria-label="Show {title} on the map"`.
- Hover-only triggers are gated behind `(pointer: fine)`; touch uses the tap model — no keyboard/touch user
  is left without a path to the same actions (the link's `href`/open still works as the base layer).
- Respect `prefers-reduced-motion` for the fly animation (an existing rule in `App.css`).

WCAG 2.1 SC 1.4.13 (content on hover/focus): dismissible (Escape), hoverable (the 80ms bridge), persistent
(no auto-timeout) — all satisfied by the contract above.

---

## 7. Testing strategy

Vitest, sharded to avoid OOM: `--shard=N/4 --poolOptions.forks.maxForks=3` (per env notes).

**Unit**
- Visited store: load/mark/isVisited; null-storage path no-ops; quota-exceeded `setItem` is swallowed;
  malformed JSON falls back to empty; `atlas-visited-v1` does not collide with existing keys.
- Wander selection: excludes visited; dedup by entity; empty pool → no-move signal; picks a placement +
  its `mapId`; cross-map target stages a map switch.
- Meter: X/Y counts from placements; all-discovered state; 0/1-place hide.
- Card data: portrait omitted when no image; summary row omitted when no summary; map button shown only
  when a placement exists.
- Sanitizer: `data-entity-id` survives after the allow-list fix; href-fallback parse yields the id.

**Build contract**
- A `--player` `atlas.json` never contains a fogged or secret placement (extend the existing
  `check-fog-safety` coverage); the wander pool derived from it is therefore secret/fog-safe.

**Interaction (jsdom, lighter)**
- Open/close timing guards (200ms open, 5px movement cancel, 80ms bridge, 400ms cooling); Escape order vs
  search palette; pointer-coarse disables hover.

---

## 8. Decisions resolved (log)

- Card = portrait + badge + name + summary + corner map button (variant "B + map icon"); map button only
  when a non-fogged placement exists; clicking the name opens, clicking the button flies.
- Surfaces: prose links, Connections list, **and** map pins (desktop); pins on phone open on tap.
- Mobile: tap-peek then tap-open for links/Connections.
- Wander: **roam anywhere revealed**, uniform-random among visible-unopened places; never reveals fog; a
  quiet no-move note when nothing's left.
- "Discovered" = panel opened by any means; tracked in `atlas-visited-v1`.
- Meter: whole-world, fog-excluded, dedup by place.
- Filled vs hollow pins kept; fuller footprints/doorways/constellation cut.

---

## 9. Out of scope / future

Constellation/relationship-graph view; full footprints history; region "doorway" shimmer; search-flies-to;
mobile peek on pins; any server-backed or cross-device state.

---

## 10. File-touch map (for the implementation plan)

- `src/atlas/sanitizeHtml.ts` — add `data-entity-id` to `ALLOWED_ATTR`.
- `src/atlas/content/parseWikilinks.ts` — add `aria-haspopup="dialog"` to rendered anchors.
- `src/atlas/visited/visitedPlaces.ts` — **new** localStorage store (mirror `playerNotes.ts`).
- `src/atlas/entity/HoverPeekCard.tsx` — **new** card component (portal, fallbacks, a11y, map button).
- `src/pages/AtlasViewer.tsx` — overlay root + portal host; `peek` + `visitedIds` state; `showPeek`/
  `hidePeek`; prose-delegation adapter; pin `mouseover`/`mouseout` + remove `<Popup>`; `openId`→visited
  effect; Wander button + meter; cross-map staged fly.
- `src/atlas/entity/EntityPanel.tsx` — hover/focus handlers on Connections/"Mentioned in" buttons calling
  `showPeek`.
- Tests under the existing Vitest layout for the store, wander/meter logic, card fallbacks, and the
  sanitizer fix.
