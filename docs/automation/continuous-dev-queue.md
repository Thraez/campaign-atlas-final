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
