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
