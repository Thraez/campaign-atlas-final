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

> **Refueled 2026-05-31** — section **E** below (6 units) was blessed by the human from the ranked inbox in
> `docs/DEVELOPMENT_WANTS.md` (E1–E5 in the Opus refuel session; **E6 added 2026-05-31** during the E1 merge
> session, same human bless). **E is the current priority — build top to bottom.** **E1 is ✅ DONE**
> (merged to main `a7f22fbc`); E2 is next. Each cites a full spec under
> `docs/superpowers/specs/2026-05-31-*.md` — **read it in full first.** Sections D, A, B, C below are all
> ✅ DONE.

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

- [ ] **N1. Phrase search** (`"exact phrase"`) in the player search. Sanctioned in the docs; distinct from
  fuzzy search (which is on the NEVER list). Area: the search index + query path. ~1–2 runs.
- [ ] **N2. Pin de-cluttering at high pin counts** using the existing `pin.priority` field to thin labels
  when a map is crowded. Player-facing readability. ~1–2 runs.
- [ ] **N3. Asset credits** — a `licenses:` frontmatter field + an auto-generated credits page. ~1–2 runs.
- [ ] **N4. Import report polish** — a clearer "what came in / what was skipped" summary after an import. ~1 run.
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
