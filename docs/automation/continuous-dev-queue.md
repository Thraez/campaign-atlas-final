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

### M — Refuel 2026-06-18 (joyful wayfinding — blessed by the DM)

> DM-directed feature refuel from a design session. Build **M1** — one substantial feature in **two halves**:
> Wander (plan Tasks 1–8) ships first and is independently usable; hover-peek (Tasks 9–17) follows.
> **Read the design doc and the plan in full before each phase** — the plan has per-task TDD steps; follow
> them top to bottom and commit per task. Operates only over already-redacted player data → no new secrecy
> surface (re-verified in the spec).

- [ ] **M1. Joyful wayfinding — hover-peek cards + wander button (player site).**
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
  - ⏳ IN PROGRESS 2026-06-18 — Tasks 1–8 done (Wander half: sanitizer, aria-haspopup, visited store, selectWanderTarget, discoveryMeter, useVisitedPlaces hook, pin discovery class + AtlasViewer wiring, WanderControl); merged at b9b6c5b1 (1590 tests green, tsc clean, lint 0 errors). Tasks 9–18 (hover-peek half: Phases 3–5) are next.

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

- [ ] **L1. Asset credits — in-image corner badge + aggregate credits page, DM-toggled at build time.**
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
