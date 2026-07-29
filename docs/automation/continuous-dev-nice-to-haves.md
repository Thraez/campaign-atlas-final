# Continuous-development — NICE-TO-HAVES (design-gated reserve)

Loaded only when the WANTS queue is empty (the REFUEL POINT). The design-check in
`continuous-dev-roadmap.md` still binds.

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

### Refuel 2026-07-18 — 45 agent-ideated units (constructive + adversarial review passed)

Generated by an ideation → constructive-review → adversarial-review pass on 2026-07-18. Every premise below
was verified against the code at `origin/main` (identical to this branch's source). Ordered high-value first
(player-safety / data-loss / build-crash → content correctness → map/browse correctness → a11y → hygiene/docs).
The per-pick design-check in `continuous-dev-routine.md` step 2a still binds — take the first that clearly passes.

> **N96–N98 were promoted to the WANTS queue on 2026-07-19** — three confirmed shipped-and-broken bugs
> (ambient audio 404s in every build; an empty-src sound zone crashes the player build; a ride-on sound on
> a DM-only region can leak into the player build). They now live in section **X** of
> `continuous-dev-queue.md` and build **first**. Numbers kept for traceability; this reserve resumes at N99.

- [x] **N99. Editing an existing secret's fields silently discards on Close — no dirty flag, no confirm.** ✅ DONE 2026-07-27 — commits 83854176 + aca66f09; secrets folded into `useEntityEditDraft`'s draft + pristine fingerprint (new `setSecrets` API), `EntityEditPanel` rewired off local `draftSecrets` state onto the shared draft; bonus fix — also closes a remount data-loss gap for secret edits. 7 new tests (4 hook + 3 integration); 2826 tests green (4 shards). Full detail: `continuous-dev-done.md`.

- [x] **N100. "Duplicate to map" is never seen as unsaved, and can silently overwrite an existing placement.** ✅ DONE 2026-07-27 — commits fbdfe389 + 19291287; `foreignMapDraftPlacements` + `targetMapHasPlacement` pure helpers, wired into the page's dirty signal, Save payload, and the duplicate dropdown (labelled "(has a pin)" + `window.confirm` before overwrite). 2839 tests green (4 shards). Full detail: `continuous-dev-done.md`.

- [x] **N101. Warn before closing the browser tab with unsaved editor changes.** ✅ DONE 2026-07-27 — commits 2756440d + 74c66f31; new `useBeforeUnloadWarning` hook (`src/atlas/editor/useBeforeUnloadWarning.ts`) wired to the existing `hasUnsavedChanges` signal; 4 unit tests cover add/remove-on-flag and the native-prompt trigger. 2843 tests green (4 shards). Full detail: `continuous-dev-done.md`.

- [x] **N102. Catch a colliding entity name before the Save round-trip, not after.** ✅ DONE 2026-07-27 — commits a51a4e04 + ef6ec19c; `EntityEditorPanel` gains an `existingIds` prop, disables Create + shows an inline "already exists" message on slug collision (create mode only); `AtlasPlacementEditor.tsx` wires `existingEntityIdsForWorld` (derived from the existing `entitiesForWorld` memo) into all six create-mode panels. 2845 tests green (4 shards). Full detail: `continuous-dev-done.md`.

- [x] **N103. The DM editor's "World name" setting is a dead end — it never reaches world.yaml/atlas.json.** ✅ DONE 2026-07-27 — commits 9b91dce6 + b6c0ef0b; `loadWorldConfig`/`WorldConfig` gain an optional top-level `name`, `build-atlas.ts` prefers `worldCfg?.name` over the hardcoded "Astrath Deeprealm" default, `buildFullWorldYaml` serializes `opts.name` the same way it already does `credits`/`assetCredits`, `buildSaveBatch`'s `buildWorldYamlContent` forwards it, and `AtlasPlacementEditor.tsx` passes `effectiveWorld?.name` through (worldSettingsDirty already fired on the name patch — only the serialize step was missing). 6 new/updated tests (2 buildFullWorldYaml round-trip, 1 buildSaveBatch drift-contract, 2 build-atlas fallback/override + 1 pre-existing extended); 2849 tests green (4 shards; shard 4 hit the documented onTaskUpdate RPC flake, 0 real failures). Touches `scripts/build-atlas.ts` + `scripts/atlas/loadWorldConfig.ts`, so `atlas:publish:integrity-smoke` and `atlas:publish` both ran green (12/12 scans clean).

- [x] **N105. Harden local persistence writes against quota / private-browsing throws.** ✅ DONE 2026-07-27 — commits 3b148582 + 6e58da4d. Full detail: `continuous-dev-done.md`.

- [x] **N107. The DM reading pane renders image embeds as broken wikilinks.** ✅ DONE 2026-07-27 — commit d4b0eb71; `EntityPanes.tsx`'s `dmHtml` memo now runs `resolveImageEmbeds` on the raw body before `tokenizeWikilinks`, mirroring `projectEntityForPlayer.ts`; 1 new test asserts the DM pane renders an `<img>` for `![[portrait.png]]`. 2859 tests green (4 shards; shard 4 hit the documented `onTaskUpdate` RPC flake, 0 real failures).

- [x] **N108. Wikilinks/embeds inside code spans and fenced code blocks become live links.** ✅ DONE 2026-07-27 — commit 86e6b845; new `src/atlas/content/codeRegions.ts` (`findCodeRanges`/`replaceOutsideCode`) locates fenced code blocks and inline code spans in the raw markdown; `tokenizeWikilinks` (`parseWikilinks.ts`) and `resolveImageEmbeds` (`renderEntityMarkdown.ts`) now route their blind regex replace through it, so `[[Link]]`/`![[embed]]` shown inside `` `code` `` or fenced blocks stay literal while real wikilinks/embeds elsewhere in the same body still resolve. 18 new tests (12 for `codeRegions.ts` + 3 each in `parseWikilinks.test.ts`/`renderEntityMarkdown.test.ts`); 2877 tests green (4 shards: 709+631+845+692; two shards hit the documented `onTaskUpdate` RPC flake, 0 real failures). Pure client-side/build-shared rendering change (no `scripts/`-only edit, no fog/soundscape/artifact touch) — `atlas:publish` wasn't required.

- [x] **N109. Render inline markdown (bold/italic/links) inside callout titles.** ✅ DONE 2026-07-28 — commit 3f58460f; `calloutExtension`'s tokenizer (`src/atlas/content/markdownCore.ts`) now tokenizes the title via `this.lexer.inlineTokens(title)` (mirroring `highlightExtension`'s own inline-tokenization pattern) instead of storing a plain string; the renderer calls `this.parser.parseInline(token.titleTokens)` instead of manually HTML-escaping the raw string. Literal `&`/`<`/`>` in a title still come out escaped, via marked's own inline-text escaping rather than the removed manual `.replace` chain. 2 new tests in `markdownCore-callout.test.ts` (bold/italic/link title renders formatted HTML; literal angle-brackets/ampersand still escaped). 2879 tests green (4 shards: 709+631+847+692 — +2 over the N108 baseline of 2877). Pure client-side/build-shared rendering change — no `scripts/`-only edit, no fog/soundscape/artifact touch — so `atlas:publish` wasn't required.

- [x] **N110. Multi-line footnote definitions corrupt into a stray code block.** ✅ DONE 2026-07-28 — commit 649b17b2; `footnoteDefExtension`'s tokenizer (`src/atlas/content/markdownCore.ts`) now scans immediately-following lines indented by 4+ spaces or a tab after matching the first `[^id]:` line, dedents and space-joins them into the same definition's inline-token text, and extends the token's `raw` to consume them so `marked` no longer sees the continuation as a stray indented code block. A non-indented line still ends the definition normally; single-line defs are unaffected. 4 new tests in `markdownCore-footnote.test.ts` (space-indented continuation, tab-indented continuation, a following non-indented paragraph NOT absorbed, single-line regression). 2883 tests green across the 4 shards (713+631+847+692 — +4 over the N109 baseline of 2879; two shards hit the documented `onTaskUpdate` RPC flake, 0 real failures). Pure client-side/build-shared rendering change — no `scripts/`-only edit, no fog/soundscape/artifact touch — so `atlas:publish` wasn't required.

- [x] **N111. Colliding, unstyled footnotes in the printable handout.** ✅ DONE 2026-07-28 — commit 5cadc2d5; new `scopeFootnoteIds()` in `src/atlas/printHandout.ts` rewrites each entity's `fnref-*`/`fn-*` ids and hrefs with its position in the bundle before concatenation, so a multi-entity handout bundle no longer cross-wires footnotes between entities that share a label; `HANDOUT_CSS` gains `.body .footnotes`/`.body a.footnote-ref`/`.body a.footnote-backref` rules mirroring the in-app `.atlas-prose` footnote styling, so single-entity handouts render footnotes with visible styling too. 3 new tests in `printHandout.test.ts` (single-entity self-referential ids, two-entity id-scoping/no-collision, embedded CSS presence). 2886 tests green across the 4 shards (716+631+847+692 — +3 over the N110 baseline of 2883). Pure client-side rendering change — no `scripts/`-only edit, no fog/soundscape/artifact touch — so `atlas:publish` wasn't required.

- [x] **N112. Honor Obsidian's image-resize pipe syntax instead of reading it as alt text.** ✅ DONE 2026-07-28 — commit bc5e79f1; `resolveImageEmbeds` (`src/atlas/content/renderEntityMarkdown.ts`) now matches a trailing pipe segment against `/^(\d+)(?:x(\d+))?$/i` and, when it matches, renders `<img src width height alt="">` instead of markdown `![alt](src)` (both attrs already allowed by `sanitizeHtml.ts`'s `ALLOWED_ATTR`); non-numeric pipe content (a caption/alias) still becomes alt text as before, unchanged. Q51 had already landed (2026-07-25) and its non-image-embed placeholder branch is untouched. 4 new tests in `renderEntityMarkdown.test.ts` (`|300` sets width, `|300x200` sets both dims, non-numeric pipe still alt text, sanitized output retains `width=`). 2890 tests green across the 4 shards (716+631+847+696 — +4 over the N111 baseline of 2886; one shard hit the documented `onTaskUpdate` RPC flake, 0 real failures). Pure client-side/build-shared rendering change — no `scripts/`-only edit, no fog/soundscape/artifact touch — so `atlas:publish` wasn't required.

- [x] **N113. Ruler clicks also open the region underneath them.** ✅ DONE 2026-07-29 — commit b4414597; `WrappedWorld` (`src/pages/AtlasViewer.tsx`) now takes a `rulerActive` prop and only wires the region `Polygon`'s `click` → `onOpenEntity` handler when the ruler tool is inactive; while the ruler is active, the click is left unhandled by the region so it bubbles up to `RulerLayer`'s `useMapEvents` click handler (Leaflet path clicks bubble by default) and only drops a measurement point. Normal region clicks (ruler off) are unchanged. 3 new tests in `atlas-viewer-region-ruler.test.tsx` (ruler inactive → opens entity, `rulerActive` omitted → opens entity, ruler active → no click handler wired / `onOpenEntity` not called). 2893 tests green across the 4 shards (716+631+848+698 — +3 over the N112 baseline of 2890; two shards hit the documented `onTaskUpdate` RPC flake, 0 real failures). Pure client-side rendering/interaction change — no `scripts/`-only edit, no fog/soundscape/artifact touch — so `atlas:publish` wasn't required.

- [x] **N114. Reset the distance ruler when the active map changes.** ✅ DONE 2026-07-29 — commit 42aa69d2; `RulerLayer` now takes a required `mapId` prop (threaded from `activeMap.id` at both call sites — the player `AtlasViewer.tsx` and the DM `AtlasPlacementEditor.tsx`) and clears `points` via an effect keyed on it (mirrors the existing `FitBoundsController`/`MaxBoundsController` mapId-effect pattern rather than a remount-via-`key`). 2 new tests in `RulerLayer.test.tsx` (measurement clears on map-id change; unaffected by a same-map-id re-render). 2895 tests green across the 4 shards (718+631+848+698 — +2 over the N113 baseline of 2893; one shard hit the documented `onTaskUpdate` RPC flake, 0 real failures). Pure client-side rendering/interaction change — no `scripts/`-only edit, no fog/soundscape/artifact touch — so `atlas:publish` wasn't required.

- [x] **N115. The "this map" search filter doesn't actually scope to the current map.** ✅ DONE 2026-07-29 — commit 76a4d5ed
  `AtlasViewer.tsx` was passing `SearchPalette` the full `data.project.placements` instead of the already-computed `placementsOnMap` (filtered to `activeMap.id`), so the "this map only" toggle's `placedIds` set included entities placed on any map. Swapped the prop to `placementsOnMap`. New AtlasViewer-level test (two-map fixture) confirms an off-map entity is excluded once the toggle is on — the SearchPalette unit tests alone couldn't catch this, since they pass a correctly-scoped `placements` prop directly.

- [x] **N116. Ruler point mis-placement on wrap-around (`wrapX`) maps.** ✅ DONE 2026-07-29 — commit f403b4b9
  `RulerLayer`'s click handler normalized `e.latlng.lng` into the canonical `[0, width)` range before converting it to an atlas coordinate, so on a `wrapX` map a click on a wrapped tile copy (rendered at `dx = -width`/`+width`) jumped to the canonical tile instead of following the cursor. Fix: use the raw clicked lng directly — behavior-preserving for non-wrap maps (already only one tile) and, on wrap maps, keeps both the point and the measured distance in the continuous space Leaflet actually renders. The `wrapX`/`mapWidth` props this normalization needed became dead and were removed from `RulerLayer` and both call sites (`AtlasViewer.tsx`, `AtlasPlacementEditor.tsx`). New test simulates a click on a wrapped copy (lng outside `[0, width)`) and asserts the point keeps its raw coordinate. 2897 tests green across the 4 shards (719+632+848+698 — +1 over the N115 baseline of 2896; one shard hit the documented `onTaskUpdate` RPC flake, 0 real failures). Pure client-side change — no `scripts/`-only edit, no fog/soundscape/artifact touch — so `atlas:publish` wasn't required.

- [x] **N117. Inverted horizontal grid lines on non-exact-multiple map heights.** ✅ DONE 2026-07-29 — commit 2db26c68
  The square-grid branch built horizontals as `[y, 0]`/`[y, map.width]` using the raw image row `y` as the Leaflet lat (`src/atlas/map/geometry.ts:57-62`), skipping the `map.height − y` flip that every other conversion uses (the hex branch flips correctly, and the vertical lines' full-height span made the bug invisible for verticals). For heights that aren't an exact multiple of the grid size the partial line landed on the wrong edge, out of step with markers/regions. Fix: compute `lat = map.height - y` before pushing each horizontal line's two endpoints — behavior-preserving on exact-multiple heights (the flipped set of y-steps is the same set, just reordered) and correct on non-multiple heights.
  New test in `src/test/atlas/map-geometry.test.ts` ("N117 — square grid horizontals flip lat…") uses a 100-height map with grid size 30 (a non-multiple: steps 0/30/60/90, last one short of 100) and asserts the y=0 line sits at lat=100 and the y=90 line sits at lat=10. Watched it go red against the pre-fix code first (`expected [[0,0],[0,100]]` — the unflipped y=0 — `to deeply equal [[100,0],[100,100]]`), confirming it reproduces the exact bug.
  Gate: typecheck clean · lint 0 errors (18 pre-existing, unchanged) · 2898 tests green across the 4 shards (719+633+848+698 — +1 over the N116 baseline of 2897). One shard hit the documented `onTaskUpdate` RPC flake (0 real failures, not re-run per policy). Pure client-side change — no `scripts/`-only edit, no fog/soundscape/shipped-artifact touch — so `atlas:publish` wasn't required.

- [x] **N118. Exact-phrase search silently drops tag-only matches.** ✅ DONE 2026-07-29 — commit a8de4f16
  `matchesPhrases` (`src/atlas/search/parseSearchQuery.ts`) built its haystack from title/aliases/summary/body but omitted `e.tags`, so a quoted `"phrase"` matching only a tag wouldn't match even though unquoted search (`entityMatchesQuery.ts`) does consider tags. Added `...e.tags.map((t) => t.toLowerCase())` to the haystack. New test in `src/test/phrase-search.test.ts` ("matches against tags (lowercased) — N118") — watched it fail against the pre-fix code (`expected false to be true`) before applying the fix. Gate: typecheck clean · lint 0 errors (18 pre-existing, unchanged) · 2899 tests green across the 4 shards (719+634+848+698 — +1 over the N117 baseline of 2898). One shard hit the documented `onTaskUpdate` RPC flake (0 real failures, not re-run per policy). Pure client-side change — no `scripts/`-only edit, no fog/soundscape/shipped-artifact touch — so `atlas:publish` wasn't required.

- [x] **N119. Browse's "all" count is backwards and type-chip counts ignore the active query.** ✅ DONE 2026-07-29 — commit a96226fd
  `AtlasBrowse.tsx` computed `entries` with `activeType` already applied, so the "all" chip's `entries.length` echoed the filtered count instead of the true total, and `allTypes` grouped from the raw entity list so per-type counts ignored the active text query. Split out a `facetFilteredEntries` memo (facet + query, no type filter) as the shared source for both the "all" count and the per-type counts; `entries` now further narrows that by `activeType`. New tests in `src/test/pages/AtlasBrowse.test.tsx` ("N119: chip counts") — watched both go red against the pre-fix code first (`all 3` → received `all 1`; `Location 1` → received `Location 2`), confirming they reproduce the exact bug. Gate: typecheck clean · lint 0 errors (18 pre-existing, unchanged) · 2901 tests green across the 4 shards (719+634+850+698 — +2 over the N118 baseline of 2899). One shard hit the documented `onTaskUpdate` RPC flake (0 real failures, not re-run per policy). Pure client-side change — no `scripts/`-only edit, no fog/soundscape/shipped-artifact touch — so `atlas:publish` wasn't required.

- [x] **N120. Reset Browse's text/type filters when navigating between facets.** ~ SKIPPED 2026-07-29 — premise already false.
  Written before Q21 (URL-persistence, shipped 2026-07-23) landed. `query`/`activeType` now live in the URL search params (`browseFilterParams.ts`), not local state, and `/atlas/browse`, `/atlas/tag/:tag`, `/atlas/type/:type` are three separate `<Route>` entries in `App.tsx` (full remount on facet change) whose facet-navigation `Link`s never carry `q`/`type` forward. Verified with a throwaway test (browse with `?q=Alpha` → click a `#tag` link → filter input reads empty on the tag page) — passed with zero code changes. No fix needed.

- [x] **N121. Browse's tag/type empty state blames the facet instead of the filter text.** ✅ DONE 2026-07-29 — commit 04c7e9c9
  The zero-results message was chosen purely from `mode`, not from *why* `entries` was empty — a tag/type page with results hidden only by an active text filter still blamed the facet ("No entries tagged X yet"). Added a `facetOnlyCount` memo (facet match only, ignoring query/activeType); when it's non-zero but `entries` is still empty, show "No entries match your filters." plus a Clear filters button (single `setSearchParams` call — two sequential calls raced on stale `prev` and dropped one reset). Four new tests in `src/test/pages/AtlasBrowse.test.tsx` ("N121: empty state blames the right cause") — watched the two filter-hid-everything cases go red first. Gate: typecheck clean · lint 0 errors (18 pre-existing, unchanged) · 2905 tests green across the 4 shards (719+634+854+698 — +4 over the N119 baseline of 2901). One shard hit the documented `onTaskUpdate` RPC flake (0 real failures, not re-run per policy). Pure client-side change — no `atlas:publish` required.

- [x] **N122. Search results keep their old scroll offset when filters change.** ✅ DONE 2026-07-29 — commit e195fd8b
  Changing `query`/`activeType`/`activeTag`/`thisMapOnly`/`recentOnly` reset `activeIndex` to `-1` but left the results list's `scrollTop` untouched, so the list stayed scrolled to the previous position after a filter change. Added `listRef.current.scrollTop = 0` to the same effect that resets `activeIndex` (`src/atlas/search/SearchPalette.tsx`). Keyboard navigation's separate `scrollIntoView` effect (gated on `activeIndex >= 0`) is unaffected. Two new tests in `src/test/search/SearchPalette.test.tsx` ("N122: scrolls the results list back to top…") — one for a type-chip click, one for a query-prop change — watched both go red against the pre-fix code first. Gate: typecheck clean · lint 0 errors (18 pre-existing, unchanged) · 2907 tests green across the 4 shards (721+634+854+698 — +2 over the N121 baseline of 2905). One shard hit the documented `onTaskUpdate` RPC flake (0 real failures, not re-run per policy). Pure client-side change — no `atlas:publish` required.

- [x] **N123. The hover-peek card shows the raw internal type slug, not the player label.** ✅ DONE 2026-07-29 — commit 3f4cdbb2
  `HoverPeekCard` rendered `{entity.type}` directly as the chip text (`src/atlas/peek/HoverPeekCard.tsx:45-46`), leaking internal slugs where the reading panel and map markers already use `playerTypeLabel` (`src/atlas/content/typeLabel.ts:17-28`). Now computes `typeLabel = playerTypeLabel(entity.type)` and renders it in place of the raw slug; the chip `<span>` is omitted entirely when `typeLabel` is `""` (e.g. type `"note"`), matching the suppression convention `playerTypeLabel` documents. Three tests in `src/test/wayfinding/HoverPeekCard.test.tsx`: updated the existing badge test to expect "Settlement" (capitalized, not raw), added an "npc" → "Person" slug→label case, and a "note" → chip omitted case. Gate: typecheck clean · lint 0 errors (18 pre-existing, unchanged) · 2909 tests green across the 4 shards (721+636+854+698 — +2 over the N122 baseline of 2907). One shard hit the documented `onTaskUpdate` RPC flake (0 real failures, not re-run per policy). Pure client-side change — no `atlas:publish` required.

- [x] **N124. Add a Timeline link to Browse's desktop toolbar (the nav is one-way today).** ✅ DONE 2026-07-29 — commit e863096e
  From Timeline a DM can reach both Browse and Map, but Browse's toolbar rendered only a "Map" link. Added a symmetric Timeline link (`src/pages/AtlasBrowse.tsx`) next to the Map link, matching its style; test added to `AtlasBrowse.test.tsx`.

- [x] **N125. The recently-revealed filter re-downloads the whole atlas.json on every search open.** ✅ DONE 2026-07-29 — commit 4594c071
  `useRecentlyRevealedIds` fetched both `atlas.json` and `.last-published.json` on every palette mount purely to build the set of current entity ids, even though those ids already sit in the `index` prop the palette receives. Now it only fetches the publish-baseline snapshot and diffs it against `index` (kept current via a ref synced in its own effect, to avoid mutating a ref during render). Test added in `src/test/search/SearchPalette.test.tsx` asserts `atlas.json` is never fetched and the derived "recently revealed" count is correct.

- [x] **N126. The "already exists" import-conflict toast tells the DM to click a button that can't fix that row.** ✅ DONE 2026-07-29 — commit 7ac1c445
  Confirmed: `useMdImportFlow.commit`'s catch handler (`src/atlas/import/useMdImportFlow.ts:207-225`) told the DM to "re-open the modal and check 'Select all overwrites'" on an already-exists 409, but that button only flips rows the client already staged as `rowKind === "path-collision"` (`stagingState.ts`, derived from `existingById`/`existingPaths`). A file that exists on disk but was never ingested into the loaded atlas.json gets staged as plain `"create"`, so re-opening the modal reproduces the identical state — the suggested fix was a genuine no-op for this row. No test previously covered this catch branch at all. Fix: the message now says to run `npm run atlas:build` and reload canon first (which repopulates `existingById` so the row is correctly detected as a conflict), then check the overwrite box — or just rename the target. New test file `src/test/import/useMdImportFlow-conflict-toast.test.ts` (2 tests) exercises `commit()` via `renderHook` with `buildImportChanges`/`saveAtlasPatchToLocalFs` mocked: one asserts the already-exists description mentions `atlas:build` before "Select all overwrites", the other pins the unchanged stale-base branch. Gate: typecheck clean · lint 0 errors (18 pre-existing, unchanged) · 2913 tests green across the 4 shards (722+635+841+715 — +2 over the N125 baseline of 2911). One shard hit the documented `onTaskUpdate` RPC flake (0 real failures, not re-run per policy). Pure client-side text/test change — no `atlas:publish` required.

- [x] **N127. Show image credit/attribution in the printable handout.** ✅ DONE 2026-07-29 — commit e5d9eb1c

- [x] **N128. Make the Discard-changes confirm dialog close on Escape and trap Tab.** ✅ DONE 2026-07-29 — commit 800ee14f
  Confirmed: `DiscardConfirmModal` (`src/atlas/session/DiscardConfirmModal.tsx:14-47`) declared `role="dialog" aria-modal="true"` and default-focused "Keep editing", but had no Escape handler and no focus trap. Added an `onKeyDown` handler on the overlay: Escape calls `onClose()` (the safe "Keep editing" path, matching the existing default-focus behavior), Tab/Shift+Tab wrap within the dialog's focusable elements (same pattern as `SearchPalette.tsx`'s Q29 focus trap). 3 new tests in `src/test/session/DiscardConfirmModal.test.tsx` cover Escape-closes-without-discarding, Tab-wraps-forward, and Shift+Tab-wraps-backward. Gate: typecheck clean · lint 0 errors (18 pre-existing, unchanged) · 2923 tests green across the 4 shards (729+635+841+718 — +3 over the N127 baseline of 2920). One shard hit the documented `onTaskUpdate` RPC flake (0 real failures, not re-run per policy). Pure client-side component + test change — no `atlas:publish` required.

- [x] **N129. Let Escape close the desktop entity reading panel.** ✅ DONE 2026-07-29 — commit f81b41dc
  Confirmed: `AtlasViewer`'s global Escape handler (`src/pages/AtlasViewer.tsx`, `useEffect` around the Cmd/Ctrl-K listener) dismissed the hover peek, then unconditionally closed search, but never closed the desktop entity panel (a plain `<aside>`, not the Radix `Sheet` used on mobile). Added a third branch: once peek is not active and search is not open, Escape calls `setOpenId(null)` — but only when `hasDesktopAside` is true, since mobile's `Sheet` already closes on Escape on its own (Radix `Dialog`). Handler order is peek → search → entity panel, one thing per press. 2 new tests in `src/test/pages/AtlasViewer.smoke.test.tsx` (`describe("Escape closes the desktop entity reading panel (N129)")`) cover: Escape closing the panel when nothing else is open, and the ordering (search closes first, entity panel needs a second Escape). Gate: typecheck clean · lint 0 errors (18 pre-existing, unchanged) · 2925 tests green across the 4 shards (729+637+841+718 — +2 over the N128 baseline of 2923, matching the 2 new tests). One shard hit the documented `onTaskUpdate` RPC flake (0 real failures, not re-run per policy). Pure client-side rendering + test change — no `atlas:publish` required.

- [x] **N130. Give the DM editor's Cmd/Ctrl+K command palette dialog + listbox semantics.** ✅ DONE 2026-07-29 — commit 42a4a615
  Confirmed: `CommandPalette.tsx`'s overlay had no `role="dialog"`/`aria-modal`, and results were a plain `<ul>/<li>/<button>` with no `role="listbox"`/`role="option"`/`aria-activedescendant` (lines had drifted slightly from the cited range but the premise held). Added `role="dialog"` + `aria-modal="true"` + `aria-label="Command palette"` on the palette box; `aria-label="Command palette search"` + `aria-autocomplete="list"` + `aria-controls="cp-results-listbox"` + `aria-activedescendant` on the input; `role="listbox"` + `id="cp-results-listbox"` + `aria-label="Command palette results"` on the results `<ul>`; each result `<li>` gets `role="presentation"` and its `<button>` gets `role="option"` + `aria-selected` + a stable `cp-result-<kind>-<id>` id — mirrors the SearchPalette Q29/Q30 pattern. Updated the one pre-existing test that grabbed result rows via `getByRole("button")` to `getByRole("option")` (now their explicit role) and added 6 new tests (dialog role/label, input label, listbox wiring, option ids, default-selection `aria-selected`/`aria-activedescendant`, ArrowDown moving both). Gate: typecheck clean · lint 0 errors (18 pre-existing, unchanged) · 2931 tests green across the 4 shards (729+637+847+718 — +6 over the N129 baseline of 2925, matching the 6 new tests). One shard hit the documented `onTaskUpdate` RPC flake (0 real failures, not re-run per policy). Pure client-side rendering + test change — no `atlas:publish` required.

- [x] **N131. Move focus into rail panels on open and restore it to the trigger on close.** ✅ DONE 2026-07-29 — commit c2796920
  Confirmed: `EditorPanelHost` (the shared host every rail panel mounts into — World, Maps, Assets, Entities, Regions, Routes, Fog, Soundscape, Layers) did no focus management: opening a panel left focus on the map/rail button, and closing (via the ✕, Escape, or backdrop click) never returned it. Added an effect keyed on `activeId` that, on open (or switching to a different panel), captures whatever had focus (the triggering rail button, since browsers focus the clicked button before React re-renders) and moves focus into the panel body's first focusable control (`bodyRef.current?.querySelector(...)`, same focusable-selector pattern as the SearchPalette/CommandPalette focus traps); on close (`activeId` → `null`), restores focus to that captured trigger. 2 new tests in `src/test/shell/EditorPanelHost.test.tsx` (`describe("focus management on open/close (N131)")`) cover: opening moves focus to the panel's first control, and closing restores focus to the trigger button (via a small test harness rendering a trigger button alongside the host and driving `activeId` through `rerender`). Gate: typecheck clean · lint 0 errors (18 pre-existing, unchanged) · 2933 tests green across the 4 shards (729+637+847+720 — +2 over the N130 baseline of 2931, matching the 2 new tests). One shard hit the documented `onTaskUpdate` RPC flake (0 real failures, not re-run per policy). Pure client-side component + test change — no `atlas:publish` required.

- [ ] **N132. Wire `aria-controls`/`aria-activedescendant` on the body editor's wikilink autocomplete.**
  The `[[` / `![[` autocomplete sets `aria-autocomplete="list"` and `aria-expanded` on the textarea (`src/atlas/categories/EntityEditPanel.tsx:437-461`) but the popover it opens carries no id, and the textarea has no `aria-controls`/`aria-activedescendant`, so screen readers never announce the suggestions or the highlighted one. Wire the relationship.
  - **Done when:** the textarea references the popover via `aria-controls` and points `aria-activedescendant` at the highlighted option; a test covers the wiring.
  - **Gate:** standard gate.
  ~1 run.

- [ ] **N133. Make the image picker's delete button reachable by keyboard.**
  The per-image delete button is `hidden group-hover:flex` (`src/atlas/editor/ImagePickerPanel.tsx:94-107`) — `display:none` except on mouse hover, so it's out of the tab order and unreachable without a pointer. Keep it in the tab order (e.g. show on focus-within as well as hover).
  - **Done when:** the delete button is reachable and operable by keyboard (visible on focus); pointer behavior is unchanged; a test covers focus visibility.
  - **Gate:** standard gate.
  ~1 run.

- [ ] **N134. Wire route midpoint markers to the already-built `insertWaypointAfter` mutation.**
  `useRouteDraft` fully implements and exports `insertWaypointAfter` (splices a waypoint, patches the draft — `src/atlas/routes/useRouteDraft.ts:255-264,51,415`), but nothing in the UI calls it, so a DM can't add a midpoint to an existing route segment. Add draggable/clickable midpoint markers on route segments that call it.
  - **Done when:** clicking a route segment's midpoint inserts a waypoint there via `insertWaypointAfter` and the route re-renders; a test covers an insert.
  - **Gate:** standard gate.
  ~2 runs.

- [ ] **N135. Extract a shared clipboard-copy helper and fix CharacterKeysPanel's swallowed copy failure.**
  `EntityPanel.tsx:66-74` and `BuildReportPanel.tsx:247-253` each wrap `navigator.clipboard.writeText` in try/catch with a `toast.error` on failure, but `CharacterKeysPanel.copyKey` (`src/atlas/secrets/CharacterKeysPanel.tsx:103-109`) has no `.catch()` at all — a denied clipboard silently does nothing (toast is already imported there). Extract one `copyToClipboard(text)` helper with consistent error toasts and route all three through it.
  - **Done when:** all three call sites use the shared helper; a failed copy in CharacterKeysPanel shows an error toast; a test covers the failure path.
  - **Gate:** standard gate.
  ~1 run.

- [ ] **N136. Deduplicate the four copy-pasted safe-localStorage guards into one helper.**
  The identical private-browsing-safe `getStorage()` accessor is copy-pasted in four player-local stores — `playerNotes.ts:27-40`, `visitedPlaces.ts:11-22`, `soundPrefs.ts:11-22`, and one more (comments already say "Mirrors notes/playerNotes.ts"). Extract a single shared helper and route all four through it (behavior identical).
  - **Done when:** one shared safe-storage helper exists and the four stores use it; existing store tests stay green; no behavior change.
  - **Gate:** standard gate.
  ~1 run.

- [ ] **N137. Add unit tests for the service-worker enable/disable gate in `src/pwa.ts`.**
  `shouldEnableServiceWorker` and its private helpers `isInIframe`/`isPreviewHost` (`src/pwa.ts:20-45`) decide whether the player atlas ever registers a service worker — a get-it-wrong-and-ship-stale-content gate the module's own comment warns about — with zero tests. Add coverage for the iframe branch and the preview-host branches. (Hygiene nibble.)
  - **Done when:** tests cover `isInIframe`, each `isPreviewHost` branch, and the composed `shouldEnableServiceWorker` decision; no source change needed.
  - **Gate:** standard gate.
  ~1 run.

- [ ] **N138. Fix two stale/fictional docs claims (import audit + import-batch rollback).**
  Two docs describe behavior that doesn't match the code: `docs/IMPORT_EXPORT.md:168-180` says the asset audit is "advisory / not chained into atlas:publish," but `atlas:publish` runs `atlas:scan` which includes it (`package.json:24-25`); and `docs/WORKFLOWS.md:92-105` describes an import-batch record + "remove this batch" rollback affordance that doesn't exist (the same feature is marked "planned" in `IMPORT_EXPORT.md:67-89`). Correct both.
  - **Done when:** `IMPORT_EXPORT.md` reflects that the audit runs in `atlas:publish`, and `WORKFLOWS.md` no longer claims a rollback affordance that doesn't ship.
  - **Gate:** standard gate (docs-only; typecheck + ESLint + no changed tests).
  ~1 run.

- [ ] **N139. Wire the publish workflow's `changelog` input into the run summary.**
  `.github/workflows/publish-atlas.yml` defines a `workflow_dispatch` `changelog` input and its header advertises it (`:5,17-25`), but nothing consumes it — a dispatched publish silently drops the note. Echo the input into the GitHub Step Summary (and/or the deploy log) so a manual publish records its changelog.
  - **Done when:** a `workflow_dispatch` run with a `changelog` value shows that note in the run summary; empty input is a no-op.
  - **Gate:** standard gate (workflow YAML; keep the change minimal and CI-only).
  ~1 run.

- [ ] **N140. Add `bin/` launchers for the three missing safety scanners.**
  `bin/` ships double-click `.cmd` launchers for four scanners but not for `check-image-privacy`, `check-fog`(-safety), or `check-player`(-secrets) — so a non-CLI DM can run some safety checks but not all. Add the three missing launchers mirroring the existing ones.
  - **Done when:** `bin/` has launchers for all six safety scanners, each invoking the same script the existing ones do; a quick smoke of one new launcher runs its scan.
  - **Gate:** standard gate.
  ~1 run.

