# Continuous-development task queue

**Created:** 2026-05-29
**Read by:** the hourly routine (`continuous-dev-routine.md`) — this is the sequenced backlog.
**Policy lives elsewhere:** `continuous-dev-roadmap.md` holds the guardrails (HAND-BACK / NEVER lists,
the design-check). This file holds the *poppable, ordered units* the routine works through.

## How the routine uses this queue

**This file is WANTS-only** — the poppable, not-yet-done units, in order. Completed units live in
`continuous-dev-done.md` (append-only archive); the design-gated backlog lives in
`continuous-dev-nice-to-haves.md` and is read *only* at the REFUEL POINT.

1. Take the **top WANT unit not marked `✅ DONE`** in the WANTS section. (In normal operation every unit
   here is still open — a `✅ DONE` marker is only a transient state between finishing and step 4.)
2. Confirm it's still valid (the spec it cites hasn't been overtaken).
3. Build it, pass the full gate, merge into `auto/continuous-dev`.
4. **Move the finished unit to `continuous-dev-done.md`** — with its date + commit hash — and remove it
   from the WANTS section here, all in the same merge. Don't leave completed units inline; this keeps the
   file the routine reads each hour small.
5. When **this file has no un-done WANT left** → you've hit the **REFUEL POINT** (below). Do not invent new
   wants. The **routine** (not this file) then decides whether to open `continuous-dev-nice-to-haves.md`
   and take a design-passed nice-to-have, or to hand back to the human.

Each WANT unit cites its authoritative spec/plan — **read that in full** before building; the summary here
is for sequencing, not the whole spec.

---

## ✅ WANTS — sequenced, blessed (build in this order)

> **Refueled 2026-07-14** — section **Q** below (100-task QoL / feature / infra / refactor backlog,
> Q1–Q100) blessed by the DM: this is the **current priority** — build **Q1 first, then in order**.
> Each unit is self-contained and independently shippable; all prior sections (P, M, J, K, L, I, H, G,
> F, E, D, A, B, C) are ✅ DONE. See section **Q**'s own banner for the guardrail recap.

### ‼️ X — Critical bugfixes (promoted from nice-to-haves 2026-07-19 — BUILD THESE FIRST)

> DM-directed: three confirmed shipped-and-broken bugs pulled out of the design-gated reserve so they get
> fixed **before** the Q backlog resumes. Each premise was verified against the code. Build **X1 → X2 → X3,
> then continue with Q2** (Q1 is already ✅ DONE). Same guardrails as every unit: one per run, full gate,
> merge to `auto/continuous-dev` only, then move the finished unit to `continuous-dev-done.md`.

- [x] **X1. Ambient sound 404s in every build — `audioUrl` double-prefixes an already-pathed `src`.** ✅ DONE 2026-07-25 — commit d82d8ba9

- [x] **X2. A sound zone with no file chosen yet crashes the entire player build.** ✅ DONE 2026-07-25 — commit 617789e9

- [x] **X3. A ride-on sound on a DM-only region can survive into the player build.** ✅ DONE 2026-07-25 — commit 613e718a

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

- [x] **Q1. Highlight the currently-open entity's pin on the map.** ✅ DONE 2026-07-22 — commit 2ae89c5d; `openId` threaded through WrappedWorld→PlacementMarkers; `atlas-viewer-pin--active` CSS ring+drop-shadow in index.css; 2417 tests green.
  Thread the open entity's id (`openId` state, `AtlasViewer.tsx:152`) down through `WrappedWorld` (rendered at ~`:669`) into `PlacementMarkers` (`:997`), and when `p.entityId === openId` pass an `"atlas-viewer-pin--active"` extraClass into `pinIconForStyle` (`:83`, which merges extraClass into the DivIcon className). Add an `.atlas-viewer-pin--active` ring/glow rule in `src/index.css` next to the `.atlas-viewer-pin` block (`:69`). Do NOT reuse `pinSvg`'s `pulse` option (`src/atlas/pins/presets.ts:311`): its `atlas-pulse` keyframe is defined only inside `AtlasPlacementEditor.tsx:1971` and is tree-shaken out of player builds, so it would be inert for players — define the ring (and any keyframe) in `index.css`, which ships to players.
  - **Done when:** opening a place via search/wander/deep-link visibly rings that entity's marker(s) on the active map, clearing selection removes the ring, and it renders in the player build (no reliance on editor-only CSS).
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing: operate only on already-projected player data; ring must not rely on `__INCLUDE_EDITOR__`-gated CSS.
  ~2–3 runs.

- [x] **Q2. Fit map to bounds on load + on map switch, plus a Reset-view button.** ✅ DONE 2026-07-22 — commit 02cf2605; FitBoundsController (useMap effect keyed on activeMap.id) calls fitBounds([[0,0],[height,width]]) on map switch; skips when flyTarget is non-null (deep-link pending); useLayoutEffect keeps fitMapRef current for the Reset-view button (Maximize2, bottom-right corner). Select onValueChange clears flyTarget so user-driven switches always fit. 5 new smoke tests (initial-load fit, deep-link skip, button render, button click, two-map Select). Gate: tsc clean · eslint 0 errors (18 pre-existing) · 2422 tests green (4 shards).
  `MapContainer`'s `center`/`zoom` (`AtlasViewer.tsx:635-636`, `zoom={-2}` hardcoded) apply only at mount, so switching maps via the header `Select` (`:538`) keeps the previous viewport — often off-screen for a differently-sized map. Add a small `useMap` controller (mirroring `MapController` at `:100`) with an effect keyed on `activeMap.id` that calls `map.fitBounds([[0,0],[activeMap.height, activeMap.width]])`, plus a map-corner "Reset view" button that re-fits on demand. The mount effect (`:246-267`) sets `flyTarget` from a `?center`/`?entity` deep link — skip the auto-fit while a deep-link/`flyTarget` is pending for that map so shared views still land; only auto-fit on genuine map switches (and manual reset).
  - **Done when:** switching between differently-sized maps reframes to fit each map's extent, a Reset-view button re-fits on click, and deep-linked shared viewports still open where shared.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Bounds cross into Leaflet, so preserve lat = height − y, lng = x (full extent = `[[0,0],[height,width]]`). Uses stock Leaflet `fitBounds` only (no tiling/chunking).
  ~2–3 runs.

- [x] **Q3. Add a dynamic scale bar overlay driven by `map.scale`.** ✅ DONE 2026-07-22 (`0f338883` feat; `d4502eb1` merge)
  Scale bar appears at bottom-centre of the viewer when `activeMap.scale` is set, recomputes on every
  `zoomend`. New modules: `src/atlas/scale/scaleBarUtils.ts` (`niceScaleNumber` pure fn, 7 tests) +
  `src/atlas/scale/ScaleBar.tsx` (`ScaleBarController` inside MapContainer, lifts state via `onChange`).
  AtlasViewer wires both: controller inside MapContainer, visual overlay outside (pointer-events-none,
  z-500, bottom-centre). Maps without `scale` render nothing.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2429 tests green (4 shards).

- [x] **Q4. Add a collapsible pin legend for the active map.** ✅ DONE 2026-07-22 — commit cb83354c; `PinLegend.tsx` derives distinct presets via `resolvePinStyle` + dedup by id; top-right corner overlay, default collapsed, re-derives on map switch; 7 unit tests; 2436 tests green (4 shards).


- [x] **Q6. Constrain panning with `maxBounds` so players can't get lost in the void.** ✅ DONE 2026-07-22 — commit 2c96305c; MaxBoundsController sets extent+10% padding with viscosity 0.75; wrapX maps clear bounds; stableMap mock gains `options`; 3 new smoke tests; 2435 tests green (4 shards).
  `MapContainer` (`AtlasViewer.tsx:633-651`) sets no `maxBounds`, so a player can pan far into empty ocean with no easy way back. Add a `useMap` controller effect keyed on `activeMap.id` that calls `map.setMaxBounds` on the map extent `[[0,0],[activeMap.height, activeMap.width]]` plus a modest padding, with a gentle `maxBoundsViscosity`. Skip the horizontal clamp when `activeMap.wrapX` is true (the world wraps). Ensure deep-link/`flyTo` targets (set via `flyTarget`/`MapController` at `:100-116`) inside the bounds still resolve.
  - **Done when:** players can't pan far past the map edge (bounds gently resist and snap back), `wrapX` maps still scroll horizontally, and deep-linked jumps within the map still land.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Stock Leaflet `maxBounds` (no tiling); bounds cross into Leaflet so preserve lat = height − y, lng = x. Complements Q2 (both add `useMap` controllers keyed on `activeMap.id`).
  ~1 run.

- [x] **Q7. Fix ruler so a third click starts a fresh measurement (plus active-mode hint).** ✅ DONE 2026-07-22 — commit e68bedf6; `RulerLayer.tsx`: third-click branch returns `{ p1: {x,y} }` instead of `prev`; Escape keydown effect clears state + fires onClear; hint overlay portaled into map container when active and < 2 points placed; 7 new unit tests in `src/test/ruler/RulerLayer.test.tsx`; 2442 tests green (4 shards).

- [x] **Q8. Bring hovered pins to the front so they don't hide behind neighbors.** ✅ DONE 2026-07-22 — commit 96e3ae20; `PlacementMarkers` `<Marker>` gains `riseOnHover` + `riseOffset={250}`; `PlacementMarkers` exported for testability; 4 unit tests in `src/test/placement-markers.test.tsx`; 2446 tests green (4 shards).
  Markers in `PlacementMarkers` (`AtlasViewer.tsx:1066-1090`) set `key`/`position`/`icon`/`eventHandlers` but not Leaflet's `riseOnHover`, so in dense clusters a hovered pin and its label can be occluded by adjacent pins/labels. Add `riseOnHover` (and a suitable `riseOffset`) to each `<Marker>` so the pin under the pointer lifts to the top of the marker pane.
  - **Done when:** hovering a pin in a crowded area raises it (and its label) above adjacent markers, with no other behavior change.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.


#### Q-B — Player entity & reading experience

- [x] **Q11. Reset the reading-panel scroll to top when the open entity changes.** ✅ DONE 2026-07-22 — commit 352559ac; `scrollAreaRef` wired to `<ScrollArea>`; `useEffect` keyed on `entity?.id` finds `[data-radix-scroll-area-viewport]` and sets `scrollTop = 0`; 1 new test asserts viewport scrollTop reset on entity id change; 2465 tests green (4 shards).
  The `ScrollArea` in `src/atlas/entity/EntityPanel.tsx` (line ~384) wraps a Radix viewport that is a persistent DOM node, so navigating from a deep scroll in entity A into entity B (via a Connection, backlink, or wikilink) leaves B scrolled partway down. Add a `useEffect` keyed on `entity.id` that finds the panel's viewport (`[data-radix-scroll-area-viewport]`) and sets `scrollTop = 0` on entity change. `src/components/ui/scroll-area.tsx` confirms the Radix `Viewport` emits that data-attribute.
  - **Done when:** opening a different entity resets the reader to the top; a test in `src/test/entity/EntityPanel.test.tsx` asserts the viewport `scrollTop` is reset on `entity.id` change.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.

- [x] **Q16. Replace the handout pop-up-blocked `alert()` with an app toast + pre-flight guard.** ✅ DONE 2026-07-23 `9a8fd856`
  `openPrintWindow` in `src/atlas/printHandout.ts` (line ~149) calls raw `window.alert("Pop-up blocked…")` when `window.open` returns null. Route this through the app's sonner toast — `import { toast } from "sonner"` (already used in `EntityPanel.tsx`) and call `toast.error(...)` with a clear "allow pop-ups to download the handout" hint. Keep the pure `buildHandoutHtml` unchanged. Optionally have `printEntityHandout`/`printEntityBundle` return a boolean so callers can react.
  - **Done when:** a blocked pop-up shows a non-blocking sonner toast (no `window.alert`); `buildHandoutHtml` stays untouched; `src/test/printHandout.test.ts` still passes and, if a return value is added, a test asserts the blocked path.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  ~1 run.


#### Q-C — Player search, timeline & browse

- [x] **Q17. Fix Timeline zero-results empty state (filter vs. no-dates).** ✅ DONE 2026-07-23 — commit ee719cd5

- [x] **Q18. Unify entity text-match across Search, Timeline, and Browse filters.** ✅ DONE 2026-07-23 — commit e8310c10

- [x] **Q23. Highlight the matched substring in search result titles.** ✅ DONE 2026-07-23 — commit a73d0dff

- [x] **Q24. Add a discoverable tag-facet row to the Browse page.** ✅ DONE 2026-07-23 — commit 39584075


#### Q-D — Player accessibility

- [x] **Q25. Give the mobile entity bottom sheet an accessible name (SheetTitle/Description).** ✅ DONE 2026-07-23 — commit 3b0e9fe2

- [x] **Q26. Give map pins accessible names for keyboard and screen-reader users.** ✅ DONE 2026-07-23 — commit 1e71e809

- [x] **Q27. Restore a visible keyboard-focus outline on the map container and controls.** ✅ DONE 2026-07-23 — commit a0c93798

- [x] **Q28. Make map fly animations respect prefers-reduced-motion.** ✅ DONE 2026-07-23 — commit f0120c0b

- [x] **Q29. Add dialog semantics and a focus trap to the search palette.** ✅ DONE 2026-07-23 — commit 277d2698; `role="dialog"` + `aria-modal="true"` + `aria-label="Search the atlas"` on inner palette div; `aria-label="Search"` on Input; Tab/Shift+Tab focus trap wraps within palette; focus restored to trigger on unmount; 5 new tests (24 total); 2558 tests green (4 shards).

- [x] **Q30. Announce search palette results with listbox / aria-activedescendant.** ✅ DONE 2026-07-23 — commit ea6229c9; results container gains `role="listbox"` + `aria-label="Search results"` + `id="sp-results-listbox"`; each result `<button>` gains `role="option"` + `id="sp-result-<entityId>"` + `aria-selected={i === activeIndex}`; Input gains `aria-activedescendant` + `aria-controls`; sr-only `role="status"` `aria-live="polite"` region announces "N result/results" / "No results" (distinct text from visible "N matches" label to keep selectors unambiguous). 7 new tests (31 total); 2565 tests green (4 shards; pre-existing onTaskUpdate RPC flake in shard 4).

- [x] **Q31. Enforce a 24px minimum tap target on filter chips.** ✅ DONE 2026-07-23 — commit 64d4487c; `.filter-chip` class added to `src/index.css` (`inline-flex; align-items: center; justify-content: center; min-height: 1.5rem`); applied to all interactive filter chip buttons/links in SearchPalette.tsx, AtlasBrowse.tsx, AtlasTimeline.tsx; `<code>` spans (px-1) untouched; 2565 tests green.

- [x] **Q32. Add skip-links and `<main>` landmarks to Browse, Timeline, Secrets, Credits.** ✅ DONE 2026-07-23 — commit 8f21258a; skip link + `<main>` added to AtlasBrowse (#browse-main), AtlasTimeline (#timeline-main), CharacterSecretsPage (#secrets-main), AtlasCredits (#credits-main); 8 new tests; 2573 tests green.

#### Q-E — Player soundscape polish

- [x] **Q33. Add a persisted player volume slider.** ✅ DONE 2026-07-23 — commit 0e496814

- [x] **Q34. Suspend the AudioContext when muted, calm, or hidden.** ✅ DONE 2026-07-23 — commit 9343e7d2

- [x] **Q36. Hide sound controls when the active map has no soundscape.** ✅ DONE 2026-07-23 — commit 2b7e49ba

- [x] **Q37. Graceful fallback when Web Audio is unavailable.** ✅ DONE 2026-07-24 — commit 6ce33af0
  `realAudioDeps.createContext` (`src/atlas/sound/realAudioDeps.ts:4`) throws when neither `window.AudioContext` nor `webkitAudioContext` exists, and `enableSound` in `SoundSettingsProvider.tsx:69-72` does `void engine.unlock()` with no `.catch`, so tapping the invite floats an unhandled rejection and leaves a dead mute button. Add a capability probe (a small helper returning whether an AudioContext constructor is present), wrap `engine.unlock()` in try/catch inside `enableSound`, and expose an `audioAvailable` flag so `SoundControl.tsx` suppresses the invite/mute (or marks them unavailable) when Web Audio can't run. The rest of the viewer must keep working.
  - **Done when:** with no AudioContext available the invite/controls are suppressed and no unhandled rejection occurs (unlock failure caught); a unit test using deps whose `createContext` throws asserts the controls hide and `enableSound` does not reject.
  - **Gate:** standard gate (typecheck + ESLint + sharded vitest).
  Player-facing hardening only. ~1 run.

- [x] **Q38. Honor prefers-reduced-motion for calm-mode motion without silencing sound.** ✅ DONE 2026-07-25 — commit 77149da6

#### Q-G — DM import & Obsidian fidelity


#### Q-H — DM publish, backup & assets


#### Q-I — Build & runtime performance


#### Q-J — CI/CD & developer experience

#### Q-K — Code health & refactor

- [x] **Q87. Split EntitiesTab section components into modules.** ✅ DONE 2026-07-27 — commit db3e0b4a


#### Q-L — Resilience & error handling

- [x] **Q89. Degrade gracefully when search-index.json fails to load.** ✅ DONE 2026-07-27 — commit 2b53e85e


#### Q-M — Docs & authoring tooling

- [x] **Q96. Refresh KNOWN_LIMITATIONS.md rows that shipped features contradict.** ✅ DONE 2026-07-27 — commit 36fd6178

- [x] **Q97. Fix QUICK_START seed-world config bug and leading-slash asset anti-pattern.** ✅ DONE 2026-07-27 — commit 1021dc2d

- [x] **Q100. Add a build-smoke test that keeps the documented seed-world path green.** ✅ DONE 2026-07-27 — commit f37b3ef1

### V — Refuel 2026-08-01 (vault publishing, part 2 — blessed by the DM)

> DM-directed refuel after an adversarial review of the 2026-07-31 vault design, which was **withdrawn**:
> it proposed rebuilding the Obsidian sync that already shipped 2026-06-17. What survived review are three
> genuine gaps — nothing detects a vault note that changed after publishing, image embeds are silently
> discarded, and every sync pulls all 2,179 notes into one table.
>
> **Authoritative spec:** `docs/superpowers/specs/2026-08-01-vault-publishing-design.md`
> **Authoritative plan (read in full before building):** `docs/superpowers/plans/2026-08-01-vault-publishing.md`
> Each unit below is one plan task, already TDD-decomposed with test code, exact file paths, and commit
> messages. **Build V1 → V15 in order, one per run.** Phase A (V1–V6) ships on its own; Phase C (V10–V15)
> depends on Phase B (V7–V9).
>
> **Non-negotiable for every unit in this section:**
> - **Never weaken visibility defaults.** `build-atlas.ts:425` defaults a missing `atlas.visibility` to
>   **player**, so an omitted key is a leak, not a neutral state. New entities from vault notes must keep
>   writing `visibility: dm` (June design §5.7).
> - **Never write to the vault.** Every vault path is read-only; `isReadableVaultPath` is the boundary.
> - **Mutation-check every safety test** — break the code deliberately and confirm the test fails before
>   trusting it. A regression test that has never failed proves nothing (audio-prune lesson, 2026-07-30).
> - `.local-atlas/` is gitignored and stays that way; the sync map is machine-local by design.

- [x] **V1. Record what a vault note looked like when it was published.** ✅ DONE 2026-08-01 — commit `b18508b1`. Full write-up in `continuous-dev-done.md`.

- [x] **V2. Leave unchanged notes unticked on re-sync.** ✅ DONE 2026-08-01 — commit `11cd5d5f`. Full write-up in `continuous-dev-done.md`.

- [x] **V3. Detect vault notes that changed since they were published.** ✅ DONE 2026-08-04 — commit `a656afcf`. Full write-up in `continuous-dev-done.md`.

- [ ] **V4. Say plainly what changed.** Plan Task A4 — `VaultSyncSummary` in `src/atlas/sync/SyncPanel.tsx`, leading with changed notes and reducing unchanged ones to a count.
  - **Done when:** `src/test/sync-panel.test.tsx` passes; wording is DM-facing (no "drift", no "hash", no paths).
  - **Gate:** standard gate. ~1 run.

- [ ] **V5. Pin that reworked notes are reported, never auto-applied.** Plan Task A5 — property test plus a **mandatory mutation check**: make `classifyVaultNote` always return `"unchanged"` and confirm the suite fails before reverting.
  - **Done when:** the mutation check demonstrably fails, then passes after revert.
  - **Gate:** standard gate. ~1 run.

- [ ] **V6. Warn before a vault change overwrites an edit made in the atlas.** Plan Task A6 — `syncedFileHash` + `hasLocalEdits` in `syncMap.ts`, a fourth `needsReview` reason `"local-edits"` in `stagingState.ts` (~:126), and the flag set on changed update rows.
  - **Done when:** a note edited in the editor and then changed in the vault comes back unticked and marked for review.
  - **Gate:** standard gate. ~2 runs.

- [ ] **V7. List vault folders with note counts, without reading notes.** Plan Task B1 — `handleVaultFoldersRequest` + `GET /__atlas/vault-folders` in `scripts/vite-plugin-atlas-save.ts`, honouring `isReadableVaultPath`, returning no file contents.
  - **Done when:** `src/test/import/vault-folders.test.ts` passes (4 tests), including the assertion that no note text appears in the response.
  - **Gate:** standard gate **+ `npm run atlas:publish`** (touches the dev-server plugin; the new route must not reach the player bundle — `check-secrets` exit 9 is the signal). ~1 run.

- [ ] **V8. Scan only the folders the DM picked.** Plan Task B2 — third `includeFolders` parameter on `handleVaultScanRequest`, repeated `folder` query params, and `candidateFolders` on `SyncSettings`. Patterns are **built in code, never typed by the DM** — a bare folder name is not a glob and matches nothing.
  - **Done when:** a scan scoped to one folder returns only that folder's notes; an empty list preserves today's whole-vault behaviour.
  - **Gate:** standard gate **+ `npm run atlas:publish`**. ~1 run.

- [ ] **V9. Pick vault folders with tick boxes instead of typing globs.** Plan Task B3 — `VaultFolderPicker` in `SyncPanel.tsx`, wired to `candidateFolders`, with the `onSync` prop widened to a third argument (fix the call site in `AtlasPlacementEditor.tsx`).
  - **Done when:** `src/test/sync-panel.test.tsx` passes and the panel lists real folders with counts against the DM's vault.
  - **Gate:** standard gate. ~2 runs.

- [ ] **V10. Resolve image embeds, refusing anything outside the chosen folders.** Plan Task C1 — new pure `src/atlas/import/resolveVaultImage.ts` (`resolveVaultImage`, `vaultImageTargetName`). An embed can name an image sitting in a DM-only folder; resolution must refuse it and report why.
  - **Done when:** `src/test/import/resolveVaultImage.test.ts` passes (8 tests) **and** the mandatory mutation check (make `inCandidates` always return true) fails the out-of-scope test before revert.
  - **Gate:** standard gate. ~1 run.

- [ ] **V11. Copy vault images out with metadata stripped.** Plan Task C2 — `handleVaultImageCopyRequest` + `POST /__atlas/vault-image-copy`, server-side so image bytes never round-trip through the browser. **The route must strip `publicDir` from the request body** so a request cannot redirect writes.
  - **Done when:** `src/test/import/vault-image-copy.test.ts` passes (3 tests): in-scope copy named from the entity, EXIF gone, out-of-scope refused with nothing written.
  - **Gate:** standard gate **+ `npm run atlas:publish`** (writes into `public/atlas/assets/images/`; `check-image-privacy` must stay clean). ~2 runs.

- [ ] **V12. Bring note images across and rewrite the embeds.** Plan Task C3 — `rewriteEmbeds` in `resolveVaultImage.ts`, wired into the sync commit. A refused image leaves **no broken link and no hint the file exists**; the DM is told how many were skipped and why.
  - **Done when:** an embed with a copied image becomes `![](/atlas/assets/images/…)`, a refused one disappears cleanly, and ordinary `[[wikilinks]]` are untouched.
  - **Gate:** standard gate **+ `npm run atlas:publish`**. ~2 runs.

- [ ] **V13. Keep vault filenames out of suggested asset paths.** Plan Task C4 — `parseObsidian.ts:128` currently slugifies the *source* filename into the target. A vault filename can itself be a spoiler (`the-cabal-lair.png`) and would trip the image-privacy filename scan; the real name comes from the entity id at copy time.
  - **Done when:** a parsed attachment's `suggestedTarget` contains no fragment of the source filename.
  - **Gate:** standard gate **+ `npm run atlas:publish`**. ~1 run.

- [ ] **V14. Correct the stale asset-allowlist comment.** Plan Task C5 — `scripts/vite-plugin-atlas-save.ts:368` claims `asset-binary` lands under `maps/` only, but `isWritableAssetPath` (`sourcePathAllowlist.ts:126-132`) has always permitted `images/` too. Comment-only fix; **no allowlist change is needed or wanted.**
  - **Done when:** the comment matches the code.
  - **Gate:** standard gate. Nibble, <1 run — fold into V13's run if convenient.

- [ ] **V15. Pin that the vault is never written and visibility is always explicit.** Plan Task C6 — hash the whole fixture vault before/after a full scan + image copy and assert byte-identity; assert a new entity from a vault note resolves to `dm`, not `player`.
  - **Done when:** both properties pass **and** the mandatory mutation check (add a stray write into the copy handler) fails the immutability test before revert. **If the visibility test fails, stop and hand back — that is a live secrecy regression, not a test bug.**
  - **Gate:** standard gate **+ `npm run atlas:publish`**. ~1 run.

---

## 🔋 REFUEL POINT — read this when every WANT above is ✅ DONE

The certain, blessed work is finished. **Do not invent new wants.** From here:

1. Prefer a **nice-to-have** below *only if it clearly passes the design-check* (see roadmap step 2a).
2. If nothing passes cleanly, **stop and hand back** (routine step 7): write a short list of candidate
   wants into `ACTIVE.md`, each with a one-line "why it fits the design," and wait for the human to bless.

A run that stops here and asks is a **success**, not a stall.

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
