# Continuous-development — DONE archive

Completed units moved out of `continuous-dev-queue.md` so the hourly routine reads a small queue.
**Append-only history** — nothing here is deleted; new completions are appended by the routine (see
`continuous-dev-routine.md` step 6). Units keep their original date + commit hash and are grouped under
their original section letter/date.

## Refuel history (archived banners)

Historical "Refueled …" banners for the sections below, moved verbatim from the WANTS intro. They
record which sections were blessed when; the sections they describe are all ✅ DONE.

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

---

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

### Q — Refuel 2026-07-14 (100-task QoL / feature / infra / refactor backlog)

- [x] **Q4. Add a collapsible pin legend for the active map.** ✅ DONE 2026-07-22 — commit cb83354c
  New `src/atlas/pins/PinLegend.tsx`: derives distinct pin presets from `placementsOnMap` via
  `resolvePinStyle` + dedup by preset id; renders a collapsible top-right corner overlay (default
  collapsed) with `pinSvg` swatches + preset labels; re-derives on map switch via `useMemo`.
  `AtlasViewer.tsx`: import + `<PinLegend placements={placementsOnMap} entityById={entityById} />`.
  `src/test/pins/PinLegend.test.tsx`: 7 unit tests (no-placements null, expand/collapse toggle,
  dedup, multi-preset, unknown-entity fallback).
  Gate: typecheck clean · eslint 0 errors (18 pre-existing) · 2436 tests green (4 shards).

- [x] **Q5. Use the real world name instead of hardcoded "Astrath Atlas".** ✅ DONE 2026-07-22 — commit d954e7d7
  `AtlasNavMenu.tsx`: added `worldName?: string` prop; sheet title renders `{worldName ?? "Atlas"}`.
  `AtlasViewer.tsx`: derive `worldName = data.project.worlds[0]?.name ?? "Atlas"`, pass to
  `AtlasNavMenu` and replace hardcoded span in toolbar logo link.
  `AtlasBrowse.tsx`, `AtlasTimeline.tsx`: extract `worldName` after null-project guard, pass to
  `AtlasNavMenu` and inline toolbar link.
  `src/test/atlas/AtlasNavMenu.test.tsx`: 3 unit tests (worldName renders, omitted falls back to
  "Atlas", undefined falls back to "Atlas").
  Gate: typecheck clean · eslint 0 errors (18 pre-existing) · 2432 tests green (4 shards).

- [x] **Q6. Constrain panning with `maxBounds` so players can't get lost in the void.** ✅ DONE 2026-07-22 — commit 2c96305c
  `src/pages/AtlasViewer.tsx`: new `MaxBoundsController` component inside `<MapContainer>`, keyed on
  `mapId`. Sets `map.setMaxBounds` to full extent plus 10 % padding (based on larger dimension) with
  `maxBoundsViscosity: 0.75`. `wrapX: true` maps call `setMaxBounds(undefined)` to clear bounds.
  `src/test/helpers/reactLeafletMock.tsx`: added `options: {}` to `STABLE_MAP`.
  `src/test/pages/AtlasViewer.smoke.test.tsx`: 3 new smoke tests (standard padding, asymmetric map,
  wrapX clears bounds).
  Gate: typecheck clean · eslint 0 errors (18 pre-existing) · 2435 tests green (4 shards).

- [x] **Q7. Fix ruler so a third click starts a fresh measurement (plus active-mode hint).** ✅ DONE 2026-07-22 — commit e68bedf6
  `src/atlas/ruler/RulerLayer.tsx`: third-click branch in the `setPoints` updater now returns
  `{ p1: { x, y } }` instead of `prev`, so measuring is continuous without toggling the tool.
  Added `useMap` + `createPortal` to render a "Click two points to measure" hint overlay in the
  Leaflet container while the ruler is active and fewer than two points are placed. Added a
  `keydown` Escape handler (registered only while active) that clears state and fires `onClear`.
  `src/test/ruler/RulerLayer.test.tsx`: 7 new unit tests (hint on active/p1-set/inactive; hint
  hidden at p2; third-click resets; Escape restores hint; Escape fires onClear).
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2442 tests green (4 shards).

- [x] **Q8. Bring hovered pins to the front so they don't hide behind neighbors.** ✅ DONE 2026-07-22 — commit 96e3ae20
  `src/pages/AtlasViewer.tsx`: added `riseOnHover` and `riseOffset={250}` to every `<Marker>` in
  `PlacementMarkers`; also exported `PlacementMarkers` so it can be unit-tested directly.
  `src/test/placement-markers.test.tsx`: 4 new unit tests verifying `data-rise-on-hover="true"` and
  a positive `data-rise-offset` are present on every rendered marker (via a custom Marker mock that
  forwards those props as data attributes).
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2446 tests green (4 shards).

- [x] **Q9. Surface the player profile block (known_for / visible_traits / rumors) in the reading panel.** ✅ DONE 2026-07-22 — commit e32cea9e
  `src/atlas/entity/EntityPanel.tsx`: added `PlayerProfileBlock` component that reads
  `entity.profile?.player` and renders three sub-sections — "Known for" (single line), "Visible
  traits" (bulleted list), and "Rumors" (bulleted list) — beneath the entity summary. Renders
  nothing when `profile.player` is absent or all three fields are empty. Only `profile.player` is
  read; `profile.dm` is never referenced. Import of `PlayerProfile` type added from profileTypes.
  `src/test/entity/EntityPanel.test.tsx`: 8 new unit tests covering absent profile, absent
  profile.player, empty profile.player, each field individually, all three together, and asserting
  no `profile.dm` value surfaces in the output.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2454 tests green (4 shards).

- [x] **Q10. Prev/next + keyboard nav + image counter in the entity lightbox.** ✅ DONE 2026-07-22 — commit 401bc2d0
  `src/atlas/entity/EntityPanel.tsx`: changed lightbox state from `{ src, url } | null` to
  `number | null` (index into `entity.images`). Added `goNext`/`goPrev` `useCallback`s with
  wrap-around modulo logic; a `useEffect` that registers an `ArrowRight`/`ArrowLeft` `keydown`
  listener on `window` only while the lightbox is open (cleaned up on close). Left/right chevron
  buttons (`ChevronLeft`/`ChevronRight` from lucide-react) appear only when `imageCount > 1`.
  An "n / total" counter overlay (`data-testid="lightbox-counter"`) sits absolute top-right.
  `resolveImageCredit` is now called with the current-index src so `CreditBadge` tracks the
  displayed image across navigation. Single-image behavior (no buttons, no counter) unchanged.
  `src/test/entity/EntityPanel.test.tsx`: 10 new tests — open, buttons shown/hidden for multi/single
  image, counter text, next/prev click, wrap-around from last to first, ArrowRight/ArrowLeft
  keydown, and credit-badge tracking across navigation.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2464 tests green (4 shards).

- [x] **Q11. Reset the reading-panel scroll to top when the open entity changes.** ✅ DONE 2026-07-22 — commit 352559ac
  `src/atlas/entity/EntityPanel.tsx`: added `scrollAreaRef = useRef<HTMLDivElement>(null)` and wired
  it to the `<ScrollArea>` element. Added a `useEffect` keyed on `entity?.id` that queries
  `[data-radix-scroll-area-viewport]` within the ref and sets `scrollTop = 0`, resetting the reader
  to the top whenever the DM or player navigates to a different entity.
  `src/test/entity/EntityPanel.test.tsx`: 1 new test — uses `Object.defineProperty` to spy on the
  viewport `scrollTop` setter, rerenders with a different entity id, and asserts the setter was
  called with 0.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2465 tests green (4 shards).

- [x] **Q12. Style GFM tables, ordered lists, inline code/pre, hr, and h4–h6 in entity prose.** ✅ DONE 2026-07-22 — commit 254671df
  Added `.atlas-prose` CSS rules in `src/index.css` for every element that was emitted by the GFM
  renderer but previously unstyled: bordered/striped tables with padded th/td, decimal ordered lists,
  inline `<code>` (monospace, muted bg, border, rounded), `<pre>` fenced-code blocks (dark bg, border,
  horizontal scroll; `pre code` resets to inherit the block), a themed `<hr>` rule, and h4/h5/h6
  with progressively smaller sizes and muted colors. Also removed the dead `prose prose-sm
  dark:prose-invert` classes from `EntityPanel.tsx:503` — `@tailwindcss/typography` is not installed
  so those classes were inert.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2465 tests green (4 shards).

- [x] **Q13. "On this page" section-jump list for long entity entries.** ✅ DONE 2026-07-22 — commit a8cbfedd
  `src/atlas/entity/paneScrollSync.ts`: exported new `TocItem` interface + `buildToc(text)` function
  that pairs each `buildAnchors` id with the raw heading display text (same slug/dedup logic, line-
  aligned with buildAnchors so index positions match the DOM order).
  `src/atlas/entity/EntityPanel.tsx`: `tocItems` memoized via `buildToc(entity.body)` keyed on
  `entity.body`; a `useEffect` keyed on `tocItems` injects `data-anchor-id` attributes onto rendered
  body headings (mirrors the EntityPanes.tsx pattern); `scrollToAnchorById` uses
  `getBoundingClientRect` delta to set the Radix viewport's `scrollTop`; a `[tocOpen, setTocOpen]`
  state (reset to true on entity change) drives a collapsible `<nav aria-label="On this page">` that
  renders only when `tocItems.length >= 2`.
  `src/test/entity/EntityPanel.test.tsx`: 7 new tests — renders list when ≥2 headings, hidden for <2
  headings or none, collapse/expand toggle, data-anchor-id injection verified in DOM, scroll click
  assigns scrollTop without throwing, and TOC resets to open on entity navigation.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2473 tests green (4 shards).


- [x] **Q14. Include a Connections section in the printable handout.** ✅ DONE 2026-07-22 — commit 6b64f993
  `src/atlas/printHandout.ts`: `renderEntitySection` gains an `entitiesById: Map<string, Entity>`
  param; when `entity.relationships?.length`, a `<div class="connections">` block is appended after
  the gallery listing each relationship's `r.label ?? r.type` and the resolved target title (falling
  back to the raw entity id). `buildHandoutHtml` gains the same param defaulting to an empty map
  constant so existing call sites and `printEntityBundle` compile unchanged. `printEntityHandout`
  exposes the param and forwards it through. Connections CSS added to `HANDOUT_CSS`.
  `src/atlas/entity/EntityPanel.tsx`: call site updated to pass `entityById` prop so the panel's
  pre-loaded entity map drives title resolution.
  `src/test/printHandout.test.ts`: 5 new tests — no block when no relationships, resolved target
  title, label override, raw-id fallback, and HTML-escaping of both label and target.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2478 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).


- [x] **Q15. De-duplicate and group Connections vs "Mentioned in".** ✅ DONE 2026-07-23 — commit a63ff812
  `src/atlas/entity/EntityPanel.tsx`: two new `useMemo` values — `connectionTargetIds` (Set of
  relationship target entity IDs) and `connectionGroups` (array of `{label, rels}` preserving
  insertion order). The "Mentioned in" backlink chips now filter out any backlink whose `id` is in
  `connectionTargetIds`, so entities already shown under Connections are not repeated. The Connections
  section renders grouped rows: all relationship targets sharing the same `r.label ?? r.type` appear
  on one row under that label, instead of repeating the label for each target.
  `src/test/entity/EntityPanel.test.tsx`: 4 new tests — overlap suppressed + "Mentioned in" heading
  hidden when all backlinks deduped; non-overlapping backlink kept; same-label grouping (label
  appears once, both targets present); two-label separate-row rendering.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2482 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).


- [x] **Q16. Replace the handout pop-up-blocked `alert()` with an app toast + pre-flight guard.** ✅ DONE 2026-07-23 — commit 9a8fd856
  `src/atlas/printHandout.ts`: added `import { toast } from "sonner"`; `openPrintWindow` now calls
  `toast.error("Pop-ups are blocked. Please allow pop-ups for this site to download the handout.")`
  instead of `window.alert()` when `window.open` returns null, and returns `boolean` (false = blocked,
  true = opened). `printEntityHandout` and `printEntityBundle` both updated to return `boolean`.
  `buildHandoutHtml` is unchanged.
  `src/test/printHandout.test.ts`: 4 new tests in "Q16: pop-up guard — toast instead of alert" describe
  block — blocked path calls toast.error + returns false (printEntityHandout); allowed path skips toast +
  returns true + writes HTML; same two for printEntityBundle.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2486 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).


- [x] **Q17. Fix Timeline zero-results empty state (filter vs. no-dates).** ✅ DONE 2026-07-23 — commit ee719cd5
  `src/pages/AtlasTimeline.tsx`: the single `groups.length === 0` branch is replaced with two distinct
  states: when `dated.length > 0` but `groups.length === 0` (filter excluded everything), shows "No events
  match your filter." plus a "Clear filter" Button that calls `setQuery("")` and `setActiveType(null)`;
  when `dated.length === 0` shows the existing onboarding copy ("No dated entries yet. Add atlas.date…").
  `src/test/pages/AtlasTimeline.test.tsx`: new test file with 3 tests — onboarding copy shows when no
  dated entries, filter-no-match message shows when entries exist but filter excludes all, clear-filter
  button resets query and restores entries.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2489 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).

- [x] **Q18. Unify entity text-match across Search, Timeline, and Browse filters.** ✅ DONE 2026-07-23 — commit e8310c10
  New `src/atlas/search/entityMatchesQuery.ts`: pure `entityMatchesQuery(entity, q)` helper that
  matches title, aliases, summary, and tags (case-insensitive substring); empty query always matches.
  `src/pages/AtlasTimeline.tsx`: replaced inline 3-field filter (title/summary/tags, missing aliases)
  with `entityMatchesQuery(e, query)`.
  `src/pages/AtlasBrowse.tsx`: replaced inline 3-field filter (title/summary/aliases, missing tags)
  with `entityMatchesQuery(e, query)`. SearchPalette's richer phrase/scoring path left untouched.
  `src/test/search/entityMatchesQuery.test.ts`: 8 unit tests covering empty query, each field
  individually, no-match, undefined summary, and whitespace trimming.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2497 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).

- [x] **Q19. Show result count in the search palette.** ✅ DONE 2026-07-23 — commit 904e8873
  `src/atlas/search/SearchPalette.tsx`: results useMemo restructured from a plain array to
  `{ items, total }` — `items` is the capped display list (≤40), `total` is the pre-slice pool
  size. `countLabel` helper produces "1 match" or "N matches". A thin count line renders between
  the filter bar and the results list; it is hidden when there are no results. The "(showing first
  40)" note appears only when total > 40.
  `src/test/search/SearchPalette.test.tsx`: 4 new tests — pool-under-cap count, singular "1 match",
  pool-over-40 cap note, no count on no-results screen.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2501 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).

- [x] **Q20. Search palette empty state surfaces 'Recently viewed'.** ✅ DONE 2026-07-23 — commit 4a65c5e8
  `src/atlas/visited/visitedPlaces.ts`: new `loadVisitedOrdered()` returns entity ids newest-first
  from stored `visitedAt` ISO timestamps; stale ids are filtered at the call site.
  `src/atlas/search/SearchPalette.tsx`: empty-query path checks `loadVisitedOrdered()`, builds a
  recently-viewed pool filtered to the current index, and returns `isRecentlyViewed: true`. The
  count bar is suppressed in this mode; a "Recently viewed" section label is rendered at the top of
  the list instead. When no entities have been visited the existing index-order fallback is used
  unchanged. Typed query always bypasses the recently-viewed path.
  `src/test/wayfinding/visitedPlaces.test.ts`: 2 new tests for `loadVisitedOrdered` newest-first
  ordering and empty-store fallback.
  `src/test/search/SearchPalette.test.tsx`: 5 new Q20 tests — label shown + correct order, count
  bar suppressed, index-order fallback when no history, stale-id filtering, query dismissal.
  Existing Q19 count-bar tests unaffected (no visited history seeded in beforeEach).
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2508 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).

- [x] **Q21. Persist Browse/Timeline filter state in the URL.** ✅ DONE 2026-07-23 — commit 7458aaf0
  `src/atlas/browse/browseFilterParams.ts`: new pure parse/serialize helper for `q` and `type`
  URL search params; round-trip tested (12 unit tests).
  `src/pages/AtlasBrowse.tsx`: replaces `useState` for query/activeType with `useSearchParams`;
  reads params on mount, writes with `{ replace: true }` (no history entry per keystroke); uses
  functional updater form `(prev) => ...` to avoid stale-closure bugs when both params change in
  one event handler.
  `src/pages/AtlasTimeline.tsx`: same URL sync; the "Clear filter" button calls `setSearchParams`
  once atomically so both params reset together without a stale-closure race.
  `src/test/browse/browseFilterParams.test.ts`: 12 tests covering parse, serialize, and round-trip.
  `src/test/pages/AtlasBrowse.test.tsx`: 4 integration tests — URL restore on mount for ?q= and
  ?type=, filter interaction updates view, clearing type chip restores all entries.
  `src/test/pages/AtlasTimeline.test.tsx`: 3 new URL-state tests — restore from ?q=, input change
  filters consistently, clear-X button clears query.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2531 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).

- [x] **Q22. Sticky A–Z jump rail on the Browse page.** ✅ DONE 2026-07-23 — commit 20c96de5
  `src/pages/AtlasBrowse.tsx`: added `ALL_LETTERS` constant (A–Z + #) and `sectionId()` helper;
  derived `activeLetters` set from `grouped`; added `scrollToSection()` using `scrollIntoView`;
  attached `id` attributes to each `<section>`; rendered a `<nav>` rail in a flex row alongside the
  content (hidden on < 640 px via `hidden sm:flex`). Disabled letter buttons are dimmed and
  non-clickable; active letters jump to their section on click. No new data or persistence.
  `src/test/pages/AtlasBrowse.test.tsx`: 5 new tests — active letter enabled, absent letter disabled,
  click calls scrollIntoView, # bucket active for non-letter titles, section id present; all 4
  pre-existing URL-state tests preserved.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2533 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).

- [x] **Q23. Highlight the matched substring in search result titles.** ✅ DONE 2026-07-23 — commit a73d0dff
  `src/atlas/search/snippet.ts`: exported `escapeHtml`; factored the mark class into a shared `MARK`
  constant; added `export function highlightMatch(text, q)` that wraps every case-insensitive
  occurrence of `q` in `<mark class="bg-primary/30 text-foreground rounded-sm px-0.5">` (same
  styling as the body snippet). `snippet()` updated to use the shared constant.
  `src/atlas/search/SearchPalette.tsx`: imported `highlightMatch`; added `titleHtml` alongside `snip`
  in the scored-results branch of the `useMemo`; render title via `dangerouslySetInnerHTML` +
  `sanitizeAtlasHtml` when `titleHtml` is non-null, plain `{r.title}` otherwise (empty-query and
  recently-viewed lists stay plain text).
  `src/test/atlas-viewer-snippet.test.ts`: 7 new `highlightMatch` tests — match, no-match,
  case-insensitivity, empty text, empty query, HTML-escaping of `&`, multiple occurrences.
  `src/test/search/SearchPalette.test.tsx`: updated "typing a query" test to use `toHaveTextContent`
  since `getByText` cannot traverse `<mark>`-split text nodes.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2540 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).

- [x] **Q24. Add a discoverable tag-facet row to the Browse page.** ✅ DONE 2026-07-23 — commit 39584075
  `src/pages/AtlasBrowse.tsx`: added `TAG_FACET_CAP = 15` / `TAG_FACET_INITIAL = 8` module constants;
  `allTags` useMemo tallies all entity tags in browse mode (sorted by frequency, capped at 15);
  `showAllTags` state; a new tag-facet row renders only in `mode === "browse"` showing the first 8 chips
  as `<Link to="/atlas/tag/:tag">` links, plus a "+N more" button that reveals the rest on click.
  `src/test/atlas-browse-links.test.tsx`: 4 new tests — facet row visible in browse mode with correct
  tag hrefs; row absent in tag mode; row absent in type mode; "+N more" expand reveals hidden chips
  (verified via `within()` scoping to the facet row). Existing card-chip test updated to
  `getAllByRole` (facet row adds a second chip link for the same tag).
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2544 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).

- [x] **Q25. Give the mobile entity bottom sheet an accessible name (SheetTitle/Description).** ✅ DONE 2026-07-23 — commit 3b0e9fe2
  `src/pages/AtlasViewer.tsx`: expanded Sheet import to include `SheetTitle` and `SheetDescription`;
  added `<SheetTitle className="sr-only">{openEntity_?.title ?? ""}</SheetTitle>` and
  `<SheetDescription className="sr-only">Entity details</SheetDescription>` inside `<SheetContent>`
  before `<EntityPanel>`. Removes the Radix missing-Title console warning; no visible layout change.
  `src/test/accessibility-labels.test.tsx`: new "Q25 — mobile entity bottom sheet accessible name"
  describe block asserting `getByRole("dialog", { name: "Tideshore" })` resolves.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2545 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).

- [x] **Q26. Give map pins accessible names for keyboard and screen-reader users.** ✅ DONE 2026-07-23 — commit 1e71e809
  `src/pages/AtlasViewer.tsx`: added `playerTypeLabel` import; updated `pinIconForStyle` to accept
  `ariaLabel?: string` — when provided, injects `role="img"` and `aria-label` directly onto the SVG
  element via string replace. In `PlacementMarkers`, builds `a11yLabel` from the entity title +
  `playerTypeLabel(ent.type)` (appended with ", " when non-empty) and passes it as both `title` on
  `<Marker>` (Leaflet applies this to the icon container for SR fallback) and `ariaLabel` in the icon.
  `src/index.css`: added `.atlas-viewer-pin:focus-visible` outline rule (2px --ring token, 2px offset,
  border-radius 50%) so keyboard-focused pins are visually distinct.
  `src/test/accessibility-labels.test.tsx`: updated the react-leaflet mock to include `Marker` (exposes
  `data-title`) and `Tooltip`; added top-level `await import("@/pages/AtlasViewer")` for PlacementMarkers;
  added "Q26 — map pins accessible names" describe block with two guards: title includes type label when
  present (e.g. "Goblin Cave, Dungeon"), title is entity title only when playerTypeLabel returns "".
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2547 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).

- [x] **Q27. Restore a visible keyboard-focus outline on the map container and controls.** ✅ DONE 2026-07-23 — commit a0c93798
  `src/index.css`: removed blanket `outline: none` from `.leaflet-container`; added
  `.leaflet-container:focus-visible` (2px `--ring` outline, -2px offset) and
  `.leaflet-container:focus:not(:focus-visible) { outline: none }` so mouse drags stay clean.
  Same `:focus-visible`/`:focus:not(:focus-visible)` pattern applied to `.leaflet-control-zoom a`
  (the +/– zoom buttons). Pure CSS, no new surface. Satisfies WCAG 2.4.7.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2547 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 3).

- [x] **Q28. Make map fly animations respect prefers-reduced-motion.** ✅ DONE 2026-07-23 — commit f0120c0b
  New `src/hooks/use-prefers-reduced-motion.ts`: reads `matchMedia('(prefers-reduced-motion: reduce)')`
  and updates reactively on change, following the `useHasDesktopAside` pattern.
  `src/pages/AtlasViewer.tsx`: `MapController` imports `usePrefersReducedMotion`; when reduced motion
  is preferred, uses `map.setView([lat, lng], targetZoom, { animate: false })` instead of
  `map.flyTo([lat, lng], targetZoom, { duration: 0.6 })`. Coordinate flip (lat = height − y) preserved.
  Editor `flyTo` is untouched (scope: player viewer `MapController` only).
  `src/test/use-prefers-reduced-motion.test.ts`: 4 unit tests — false when no preference, true when
  active, reactive update to reduced, reactive update back to no-preference.
  `src/test/pages/AtlasViewer.smoke.test.tsx`: 2 new smoke tests — `setView({animate:false})` called
  (not `flyTo`) when reduced motion active; `flyTo({duration:0.6})` called (not `setView`) when absent.
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2553 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 4).

- [x] **Q29. Add dialog semantics and a focus trap to the search palette.** ✅ DONE 2026-07-23 — commit 277d2698 (feat) + e5db120c (merge).
  `src/atlas/search/SearchPalette.tsx`: inner palette `<div>` gains `role="dialog"` + `aria-modal="true"` +
  `aria-label="Search the atlas"`; `<Input>` gains `aria-label="Search"`. Focus trap: `handleKeyDown`
  intercepts Tab/Shift+Tab, queries all focusable descendants of the dialog `ref`, and wraps focus at
  the edges (`last→first` on Tab, `first→last` on Shift+Tab). Focus restoration: `triggerRef` captures
  `document.activeElement` at init time (before `autoFocus` fires); a cleanup-only `useEffect` restores
  focus to that element on unmount.
  `src/test/search/SearchPalette.test.tsx`: 5 new tests in `describe("dialog semantics and focus trap (Q29)")` —
  dialog role/aria-modal/aria-label on container; accessible label on input; Tab wraps last→first;
  Shift+Tab wraps first→last; focus restored to trigger on unmount. Total: 24 tests (19 pre-existing + 5 new).
  Gate: typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2558 tests green (4 shards;
  pre-existing onTaskUpdate RPC flake in shard 4).

---

### Q30 — Announce search palette results with listbox / aria-activedescendant (2026-07-23)

**Commit:** `ea6229c9` · **Merge:** `1169146a` · **Branch:** `run/q30-20260723`

**What shipped:** The search palette results overlay (`src/atlas/search/SearchPalette.tsx`) now
has full screen-reader semantics for its keyboard-navigable list. The results container
(`listRef` div) gains `role="listbox"` + `aria-label="Search results"` + `id="sp-results-listbox"`.
Each result `<button>` gains `role="option"` + a stable `id` of the form `sp-result-<entityId>` +
`aria-selected={i === activeIndex}`. The `<Input>` gains `aria-activedescendant` (pointing to the
active option's id, undefined when nothing is selected) and `aria-controls="sp-results-listbox"`.

A sr-only `role="status"` `aria-live="polite"` region announces the result count whenever it
changes: "N result/results" or "No results". The live-region deliberately uses "result/results"
(not "match/matches") to keep its text distinct from the visible count label, so tests can target
each element unambiguously via role or text.

**Tests:** 7 new tests in `describe("listbox semantics and activedescendant (Q30)")` in
`src/test/search/SearchPalette.test.tsx`. Total: 31 tests.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2565 tests green
(4 shards; pre-existing onTaskUpdate RPC flake in shard 4).

---

### Q31 — Enforce a 24px minimum tap target on filter chips (2026-07-23)

**Commit:** `64d4487c` · **Merge:** `a606fbb3` · **Branch:** `run/q31-tap-targets`

**What shipped:** Every interactive filter chip on the three player-facing surfaces (Search palette,
Browse, Timeline) now meets the WCAG 2.5.8 AA 24 px minimum tap target requirement. Previously the
chips used `py-0.5` (2 px vertical padding) giving ~18 px height — too small on phones.

**Implementation:**
- `src/index.css`: new `.filter-chip` utility class — `display: inline-flex; align-items: center;
  justify-content: center; min-height: 1.5rem` (24 px).
- `src/atlas/search/SearchPalette.tsx`: class applied to all 5 chip variants (this-map, recent, all,
  type, tag).
- `src/pages/AtlasBrowse.tsx`: class applied to type chip buttons, tag Link chips, and "+N more" button.
- `src/pages/AtlasTimeline.tsx`: class applied to type chip buttons.
- Inline `<code>` spans (`px-1 py-0.5`) left untouched per spec.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2565 tests green
(4 shards; pre-existing onTaskUpdate RPC flake in shard 4).

---

### Q32 — Add skip-links and `<main>` landmarks to Browse, Timeline, Secrets, Credits (2026-07-23)

**Commit:** `8f21258a` · **Merge:** `bc9bface` · **Branch:** `run/q32-skip-links`

**What shipped:** Four player-facing pages — Browse, Timeline, Character Secrets, and Credits — now have
a keyboard-reachable skip link and a labelled `<main>` landmark, matching the pattern AtlasViewer already
used. Keyboard and screen-reader users can now bypass the repeated toolbar on every page.

**Implementation:**
- `src/pages/AtlasBrowse.tsx`: `<a href="#browse-main" className="skip-to-main">` before `<header>`;
  `<ScrollArea>` wrapped in `<main id="browse-main" aria-label="Browse entities">`.
- `src/pages/AtlasTimeline.tsx`: same pattern — `#timeline-main`, `aria-label="Timeline events"`.
- `src/atlas/secrets/CharacterSecretsPage.tsx`: skip link before `<AtlasNavMenu>`; content `<div>`
  promoted to `<main id="secrets-main">`.
- `src/pages/AtlasCredits.tsx`: same as Secrets — `<main id="credits-main">`.
- All four reuse the existing `.skip-to-main` class from `src/index.css` (no new CSS surface).
- 8 new tests (2 per page) asserting the landmark id and skip-link href + class; 2573 total.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2573 tests green
(4 shards; pre-existing onTaskUpdate RPC flake in shard 4).

---

### Q33 — Add a persisted player volume slider (2026-07-23)

**Commit:** `0e496814` · **Merge:** `991296c3` · **Branch:** `run/q33-volume`

**What shipped:** Players can now control loudness with a compact range slider that persists across
page reloads. The effective master gain the AudioEngine uses is now `playerVolume × mapMasterGain`
instead of the raw map gain, so both player preference and DM-authored scene gain compose correctly.

**Implementation:**
- `src/atlas/sound/soundPrefs.ts`: added `volume: number` (0..1, default 0.8) to `SoundPrefs`,
  `DEFAULT_PREFS`, and `loadSoundPrefs` (range-guarded: must be a number in [0, 1]).
- `src/atlas/sound/SoundSettingsProvider.tsx`: added `mapMasterGain` state (internal, not persisted,
  default 0.6); new `setVolume` and `setMapMasterGain` on the context interface; new effect pushes
  `engine.setMasterGain(prefs.volume × mapMasterGain)` whenever either changes.
- `src/atlas/sound/SoundscapeLayer.tsx`: replaced `engine.setMasterGain(...)` with
  `setMapMasterGain(...)` so the provider (not the layer) owns the combined gain computation.
- `src/atlas/sound/SoundControl.tsx`: renders a compact `<input type="range">` (aria-label "Volume")
  alongside the mute button when sound is enabled; onChange calls `setVolume`.
- 10 new tests: soundPrefs (+5 — persistence, boundary values, out-of-range/non-number degradation);
  SoundControl (+3 — slider absent before enable, default value, change persists); SoundSettingsProvider
  (+2 — setVolume persists, combined-gain effect calls engine.setMasterGain(volume × mapGain)).

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2583 tests green
(4 shards; pre-existing onTaskUpdate RPC flake in shard 4).

---

### Q34 — Suspend AudioContext when muted, calm, or hidden (2026-07-23)

**Commit:** `9343e7d2` · **Merge:** `e113543c` · **Branch:** `run/q34`

**What shipped:** The AudioContext is now suspended after the 0.2 s gain ramp settles whenever the
player mutes or enables calm mode, so the browser can reclaim CPU/battery while silent. Unmuting
resumes the context immediately (if the page is visible). The existing visibilitychange handler was
updated to skip the resume() call while muted/calm so the two suspend paths don't interfere.

**Implementation:**
- `src/atlas/sound/SoundSettingsProvider.tsx`: replaced the single `engine.setMuted(silenced)` call
  in the mute/calm effect with a branch: when silenced, a 250 ms `setTimeout` calls `engine.suspend()`
  after the ramp; when unsilenced, calls `engine.resume()` immediately (only if page is visible).
  The `visibilitychange` handler gains `prefs.muted && prefs.calmMode` deps and guards its `resume()`
  behind `!prefs.muted && !prefs.calmMode`.
- 3 new tests in `src/test/sound/SoundSettingsProvider.test.tsx` (Q34 describe block): suspend fires
  after ramp delay (fake timers), resume fires on unmute, visibilitychange skips resume while muted.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2586 tests green
(4 shards; pre-existing onTaskUpdate RPC flake in shard 4).

---

### Q35 — Add player-safe 'ambience playing' now-playing affordance (2026-07-23)

**Commit:** `574f3dbb` · **Merge:** `ad719e19` · **Branch:** `run/q35`

**What shipped:** Players now see a subtle "♪ Ambience playing" pill in the sound controls while
a soundscape bed is actually playing (sound enabled, not muted, not calm). When they mute or enable
calm mode the indicator disappears instantly. An always-rendered `role="status" aria-live="polite"`
region announces the same state change to screen readers. No DM-derived area name is used — the label
is a hardcoded generic string, keeping filterSoundscape.ts's area-name stripping intact.

**Implementation:**
- `src/atlas/sound/SoundSettingsProvider.tsx`: added `ambiencePlaying: boolean` + `setAmbiencePlaying`
  to the `SoundSettings` interface and context. State is initialized false; `ambiencePlaying` is
  included in the `useMemo` deps so the context value updates on change.
- `src/atlas/sound/SoundscapeLayer.tsx`: calls `setAmbiencePlaying(next !== null)` in the settle timer
  when the active bed changes. Cleanup paths (soundEnabled change, map switch) call
  `setAmbiencePlaying(false)`. Both effects updated with `setAmbiencePlaying` in their deps arrays.
- `src/atlas/sound/SoundControl.tsx`: derives `ambienceActive = soundEnabled && ambiencePlaying &&
  !muted && !calmMode`. Renders an always-present sr-only `role="status" aria-live="polite"` span
  (text: "Ambience playing" or empty) and a visible pill inside the `soundEnabled` block when active.
- 4 new tests in `src/test/sound/SoundControl.test.tsx` (Q35 describe block): live region announces
  when active, clears on mute, stays empty before sound is enabled, contains only the generic label.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2590 tests green
(4 shards; pre-existing onTaskUpdate RPC flake in shard 4).

### Q36 — Hide sound controls when the active map has no soundscape (2026-07-23)

**Commit:** `2b7e49ba` · **Merge:** `08185731` · **Branch:** `run/q36`

**What shipped:** `SoundControl` now accepts a `hasSoundscape` prop (default `true`). When `false`,
the invite button, mute toggle, and volume slider are hidden — so maps with no soundscape config (or
`soundscape.enabled === false`, or zero areas) no longer promise ambience that never plays. The Calm
mode toggle stays visible on all maps because it also governs ocean motion. `AtlasViewer` computes
`hasSoundscape` from `activeMap.soundscape` and passes it down.

**Implementation:**
- `src/atlas/sound/SoundControl.tsx`: added `SoundControlProps { hasSoundscape?: boolean }` (default
  `true`). Both the invite block (`!soundEnabled && !dismissed`) and the active-sound block
  (`soundEnabled`) are gated behind `hasSoundscape &&`. The Calm mode button is unconditional.
- `src/pages/AtlasViewer.tsx`: computes `hasSoundscape = activeMap.soundscape?.enabled !== false &&
  (activeMap.soundscape?.areas?.length ?? 0) > 0` and passes it to `<SoundControl>`.
- `src/test/sound/SoundControl.test.tsx`: updated `renderControl()` helper to accept an optional
  `{ hasSoundscape? }` prop spread; added Q36 describe block with 3 tests: invite + mute hidden when
  false, Calm mode visible when false, all controls present when true.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2593 tests green
(4 shards; pre-existing onTaskUpdate RPC flake in shard 4).

### Q37 — Graceful fallback when Web Audio is unavailable (2026-07-24)

**Commit:** `6ce33af0` · **Merge:** `e0467b21` · **Branch:** `run/q37-web-audio-fallback`

**What shipped:** On browsers where neither `window.AudioContext` nor `webkitAudioContext` exists,
the sound invite and mute/volume controls are now silently absent (instead of showing controls that
throw an unhandled rejection when tapped). The Calm mode button (CSS-only ocean motion) remains
visible on all maps. An `engine.unlock()` failure (e.g. context creation throws) now rolls back
`soundEnabled` to false via a `.catch` handler, so tapping the invite on a partially-supported
browser leaves a clean state instead of a dead mute button.

**Implementation:**
- `src/atlas/sound/probeWebAudio.ts` (new): `isWebAudioAvailable()` — checks for
  `window.AudioContext || webkitAudioContext`, guarded for SSR.
- `src/atlas/sound/SoundSettingsProvider.tsx`: imported probe; added `audioAvailable: boolean` to
  `SoundSettings` interface; added `audioAvailable?` prop to provider (default = probe result,
  injectable in tests); `enableSound` now calls `.catch(() => update({ soundEnabled: false }))` on
  `engine.unlock()` so a failed unlock self-heals.
- `src/atlas/sound/SoundControl.tsx`: destructures `audioAvailable` from context; both the invite
  block and the active-sound block are gated behind `audioAvailable &&`; Calm mode unconditional.
- `src/test/sound/probeWebAudio.test.ts` (new): 3 tests covering AudioContext present, only
  webkitAudioContext present, and neither present.
- `src/test/sound/SoundSettingsProvider.test.tsx`: added Q37 describe block — `audioAvailable` prop
  exposed in context; `enableSound` rolls back soundEnabled when unlock() rejects (2 tests).
- `src/test/sound/SoundControl.test.tsx`: updated `renderControl` and `renderWithAmbience` helpers
  to pass `audioAvailable={true}` so existing tests are environment-independent; added Q37 describe
  block — invite hidden, mute/volume hidden, Calm mode visible when audioAvailable false (3 tests).

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2601 tests green
(4 shards; pre-existing shard-3 RPC flake; 33 targeted tests green).

- [x] **Q38. Honor prefers-reduced-motion for calm-mode motion without silencing sound.** ✅ DONE 2026-07-25 — commit 77149da6

**Implementation:**
- `src/atlas/sound/prefersReducedMotion.ts` (new): SSR-safe helper `readPrefersReducedMotion()` reads
  `matchMedia('(prefers-reduced-motion: reduce)').matches` once at mount, guarded for SSR/missing
  matchMedia.
- `src/atlas/sound/SoundSettingsProvider.tsx`: added `motionReduced?: boolean` injectable prop
  (default = probe result); `data-calm` effect now gates on `prefs.calmMode || motionReduced` so
  the ocean stills for reduced-motion visitors; `engine.setMuted` remains driven by
  `muted || calmMode` only — the motion flag never mutes audio. `motionReduced` added to
  `SoundSettings` interface and exposed in context value.
- `src/test/sound/SoundSettingsProvider.test.tsx`: added Q38 describe block — motionReduced=true sets
  data-calm without muting engine; motionReduced=false leaves data-calm absent; calmMode=true still
  mutes engine even when motionReduced=true; prop exposed in context (4 new tests; 16 total in file).

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · ~2605 tests green
(4 shards; pre-existing shard-3 RPC flake).

- [x] **X1. Ambient sound 404s in every build — `audioUrl` double-prefixes an already-pathed `src`.** ✅ DONE 2026-07-25 — commit d82d8ba9

**Implementation:**
- `src/atlas/sound/AudioEngine.ts`: `audioUrl()` now also treats a src already starting with the
  `atlas/assets/audio/` dir prefix as already-resolved (alongside the existing absolute-path and
  `http`/`https` checks), so the hashed src `rewriteAudioSrcs` writes at build time is no longer
  re-prefixed a second time at playback — the previous 404 (`atlas/assets/audio/atlas/assets/audio/<hash>.ogg`)
  is fixed.
- `src/test/sound/AudioEngine.test.ts`: 2 new tests — a bare filename (`ocean.ogg`) still gets
  prefixed once; an already-pathed src (`atlas/assets/audio/deadbeef.ogg`) is left unchanged
  (reproduced the double-prefix before the fix, confirmed the fix after).

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2607 tests green (4 shards;
pre-existing `onTaskUpdate` RPC flake in shards 1 and 3) · `npm run atlas:publish:integrity-smoke`
5/5 scans green.

- [x] **X2. A sound zone with no file chosen yet crashes the entire player build.** ✅ DONE 2026-07-25 — commit 617789e9

**Implementation:**
- `scripts/atlas/hashAudioAssets.ts`: `hashAudioAssets` now skips blank/whitespace `bed.src` and
  `bed.srcFallback` when collecting files to copy/hash, instead of trying to read them (the previous
  `path.join(publicDir, "")` resolved to the public dir itself and threw `EISDIR`).
- `scripts/atlas/filterSoundscape.ts`: `filterSoundscapeForPlayer` now also drops any area with no
  file chosen yet (blank/whitespace `bed.src`) before it ever reaches `hashAudioAssets`, so a
  half-configured sound zone is simply omitted from the player build.
- `src/test/sound/hashAudioAssets.test.ts` + `src/test/sound/filterSoundscape.test.ts`: new tests
  cover the empty/whitespace-src cases; reproduced the `EISDIR` crash first (TDD), confirmed the fix
  after.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2612 tests green (4 shards;
pre-existing `onTaskUpdate` RPC flake in shard 3) · `npm run atlas:publish:integrity-smoke` 5/5
scans green.

- [x] **X3. A ride-on sound on a DM-only region can survive into the player build.** ✅ DONE 2026-07-25 — commit 613e718a

**Implementation:**
- `scripts/atlas/filterSoundscape.ts`: `filterSoundscapeForPlayer` now accepts the map's `regions`
  array. For any area with a `regionId` (a ride-on area, which never carries its own `visibility`
  field), it resolves effective visibility by looking the region up in `regions` and drops the area
  if the region is `dm`/`hidden` or the `regionId` no longer resolves to any region. Sound-only areas
  (own polygon + own `visibility` field) are filtered exactly as before.
- `scripts/build-atlas.ts`: the player-strip call site now passes `m.regions` (already attached to
  each map earlier in the build) alongside `m.soundscape`.
- `src/test/sound/filterSoundscape.test.ts`: 8 new cases cover dm/hidden/player/rumor region
  resolution, a dangling `regionId`, an area's own `visibility` being ignored when `regionId` is
  set (region wins), and the no-regions-passed defensive default; one pre-existing test updated to
  pass a matching region instead of relying on the area's own (now-ignored) `visibility` field.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2620 tests green (4 shards;
pre-existing `onTaskUpdate` RPC flake in shards 1 and 3) · `npm run atlas:publish` 12/12 scans green
(leak-surface fix, full publish gate per spec).

- [x] **Q39. Fix AudioEngine buffer-cache leak and add engine unit tests.** ✅ DONE 2026-07-25 — commit b5226da7

**Implementation:**
- `src/atlas/sound/AudioEngine.ts` `touch()`: when the LRU eviction loop would shift the currently
  active source's buffer off `lru`, it now pushes that entry back onto the tail (keeping it tracked)
  instead of `continue`-ing without re-adding it — the old code let the active buffer fall out of
  `lru` permanently while staying in the `buffers` map, so the cache grew past `BUFFER_CAP` over a
  long session. The loop now evicts a genuinely inactive entry each pass and still terminates.
- `src/test/sound/AudioEngine.test.ts`: 2 new tests — one drives `touch()` directly with a simulated
  active buffer that would otherwise be the least-recently-touched entry, loading more than
  `BUFFER_CAP` other buffers and asserting `buffers.size` stays capped and the active buffer remains
  tracked in `lru` (reproduced the leak red before the fix, green after); one locks in the existing
  "a newer crossfade supersedes an older one that resolves its decode late" behavior with
  controlled/deferred `fetchAudio` promises (already correct, now covered). `canPlay` Ogg→fallback
  selection was already covered by an existing test.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2622 tests green (4 shards;
pre-existing `onTaskUpdate` RPC flake in shard 3). Codebase-health only — no build/scan pipeline
touched, so `atlas:publish` not required.

- [x] **Q40. Add Cmd/Ctrl+S keyboard shortcut to save.** ✅ DONE 2026-07-25 — commit e9900255

**Implementation:**
- `src/atlas/shell/useEditorKeyboardShortcuts.ts`: new third global `keydown` effect intercepting
  Cmd/Ctrl+S. Always calls `e.preventDefault()` first (suppresses the browser Save dialog even when
  focus is in an input/textarea — deliberately NOT gated by the `isEditableTarget` check the undo/redo
  effect uses), then invokes the new `onSave` callback only when the new `canSave` flag is true.
  `onSave`/`canSave` added to `UseEditorKeyboardShortcutsArgs` (both required).
- `src/pages/AtlasPlacementEditor.tsx`: wired `onSave: onSaveClick` and
  `canSave: !(saveModalOpen || session.status === "clean")` into the hook call (~line 990), mirroring
  the existing Save button's `disabled` condition so the shortcut no-ops exactly when the button would
  be disabled (clean session or save-review modal already open).
- `src/test/shell/useEditorKeyboardShortcuts.test.ts`: extended all existing cases with the new
  required `onSave`/`canSave` args and added 6 new cases — Ctrl+S and Cmd+S call `onSave`; Ctrl+S still
  fires (and prevents default) with focus in an input; `canSave: false` still prevents default but
  skips `onSave`; a bare `s` does nothing; unmount removes the new listener too.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2627 tests green (4 shards:
660+566+814+587; pre-existing `onTaskUpdate` RPC flake in shards 1 and 3). Editor-only
(`__INCLUDE_EDITOR__`-gated) — no build/scan pipeline touched, so `atlas:publish` not required.
Deviation: built directly in the main working copy (already `auto/continuous-dev`, up to date with
origin) rather than an isolated worktree — noted for the record, no impact since gates fully passed
before commit.

- [x] **Q41. Wire Cmd+B / Cmd+I / Cmd+K formatting shortcuts in the body editor.** ✅ DONE 2026-07-25 — commit 3eaf3393

**Implementation:**
- `src/atlas/categories/EntityEditPanel.tsx` `handleBodyKeyDown`: before the existing
  `if (!acCtx) return;` guard, when the autocomplete popover is closed (`!acCtx`) and a Cmd/Ctrl
  modifier is held, maps `b→"bold"`, `i→"italic"`, `k→"wikilink"` (existing `ToolbarActionId`s),
  calls `e.preventDefault()`, and routes through the existing `handleToolbarAction(id)` — the same
  pipeline the toolbar buttons use (`applyToolbarAction` against the live textarea selection). With
  the popover open the combo is left alone so it doesn't fight suggestion navigation (ArrowUp/Down,
  Enter/Tab, Escape).
- `src/atlas/editor/FormatToolbar.tsx`: `ALWAYS` entries for Bold/Italic/Wikilink gained an optional
  `title` ("Bold (Ctrl+B)" / "Italic (Ctrl+I)" / "Wikilink (Ctrl+K)"), rendered as the button's `title`
  attribute; buttons without a defined shortcut render no `title`.
- Tests: `src/test/categories/EntityEditPanel.test.tsx` — Ctrl+B wraps the selection bold, Ctrl+K wraps
  as a wikilink, Cmd+I (metaKey) applies italic, and Ctrl+B is a no-op while the wikilink-autocomplete
  popover is open (typed `[[` first). `src/test/editor/FormatToolbar.test.tsx` — asserts the tooltip
  text on Bold/Italic/Wikilink and that untouched buttons (Highlight, Callout) get no `title`.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2633 tests green (4 shards:
660+568+818+587; pre-existing `onTaskUpdate` RPC flake, seen twice in shard 3 this run — likely more
frequent because a concurrent scheduled run (`run/q42-confirm-dialog`, its own isolated worktree) was
competing for CPU at the same time; no real failures). Editor-only (`__INCLUDE_EDITOR__`-gated) — no
build/scan pipeline touched, so `atlas:publish` not required. Same worktree deviation as Q40 (built
directly in the main working copy); confirmed via `git worktree list` that the concurrent scheduled run
was isolated in its own worktree/directory, so no filesystem collision occurred.

- [x] **Q42. Replace native confirm() dialogs with an in-app confirm.** ✅ DONE 2026-07-25 — commit 702c6067

**Implementation:**
- `src/atlas/tabs/ConfirmDialog.tsx` (new): a reusable confirm built on the existing Radix
  `AlertDialog` primitives (`src/components/ui/alert-dialog.tsx`, already used once in
  `MapLayerPanel.tsx`) rather than hand-rolled like `DiscardConfirmModal` — this gets default-focus on
  Cancel and Escape-to-dismiss for free from Radix (verified: `AlertDialogContent`'s
  `onOpenAutoFocus` focuses the Cancel ref; Escape closes via the underlying Dialog primitive), which
  neither reinvents nor inherits the gap flagged in nice-to-have N128 (`DiscardConfirmModal` itself has
  no Escape handler / focus trap). Takes `trigger`, `title`, `description`, optional
  `confirmLabel`/`cancelLabel`, and `onConfirm`; wraps `AlertDialog` + `AlertDialogTrigger asChild` so
  each call site just swaps its old `<Button onClick={() => confirm(...) && action()}>` for
  `<ConfirmDialog trigger={<Button .../>} .../>` with no local open-state needed.
- Swapped in at all four cited sites: `RegionsTab.tsx` (delete region), `RoutesTab.tsx` (delete route),
  `FogTab.tsx` (clear all reveals, clear all fog shapes). No `window.confirm` calls remain in any of
  the four.
- Tests: `src/test/tabs/ConfirmDialog.test.tsx` (new) — closed until trigger click, title/description
  render, Cancel closes without calling `onConfirm`, confirm action calls `onConfirm`, Escape dismisses
  without calling `onConfirm`, custom confirm/cancel labels render. `src/test/tabs/RegionsTab.test.tsx`
  gained an integration pair on the delete-region site — trigger opens the dialog and Cancel leaves
  `remove` uncalled; trigger then confirm calls `remove(id)`.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2641 tests green (4 shards:
663+568+769+641; pre-existing `onTaskUpdate` RPC flake in shards 1 and 3, no real failures — re-run
after merging Q41 on top since this run forked its worktree from the pre-Q41 tip). Editor-only
(`__INCLUDE_EDITOR__`-gated) — no build/scan pipeline touched, so `atlas:publish` not required.

**Concurrency note:** this run's worktree (`run/q42-confirm-dialog`) forked from `auto/continuous-dev`
before an interactive session merged Q41 on top. Confirmed via `git worktree list` there was no
filesystem collision (separate directories); re-fetched origin before merging and merged
`run/q42-confirm-dialog` onto the current `a4f92fbe` tip (post-Q41) rather than the stale fork point —
a clean 3-way merge with no conflicts (Q41 touched `EntityEditPanel.tsx`/`FormatToolbar.tsx`; Q42
touched `ConfirmDialog.tsx`/`RegionsTab.tsx`/`RoutesTab.tsx`/`FogTab.tsx` — disjoint). Full gate
re-run on the merged tree (above) before pushing, not just on the pre-merge branch.

- [x] **Q43. Replace placeholder Help link with an in-editor shortcuts panel.** ✅ DONE 2026-07-25 — commit 0d7483b6

**Implementation:**
- `src/atlas/shell/HelpPanel.tsx` (new): a static panel listing the editor's current keyboard
  shortcuts (⌘/Ctrl K command palette, ⌘/Ctrl S save, ⌘/Ctrl Z undo, ⌘/Ctrl Shift Z / Ctrl Y redo, Esc
  cancel placement, and the Q41 body-editor formatting shortcuts — ⌘/Ctrl B bold, ⌘/Ctrl I italic,
  ⌘/Ctrl K wikilink) plus a short "Quick tips" list, styled to match the existing small side panels
  (`CharacterKeysPanel.tsx`-style header/body/footer layout).
- `src/pages/AtlasPlacementEditor.tsx`: `onHelp` now calls `setActivePanel("help")` instead of
  `window.open("https://github.com", "_blank")`; added a `"help": <HelpPanel />` entry to the `panels`
  record and a `help: "Keyboard shortcuts"` entry to `menuPanelTitle` so the existing menu-reachable-panel
  fallback (used by `world`/`maps`/`assets`) renders it with a title in the flyout host. No new rail icon
  — reached only via the ☰ menu, same as before.
- Tests: `src/test/shell/HelpPanel.test.tsx` (new, 3 cases) — all shortcut descriptions render, the
  quick-tips list renders, and the panel heading is present. No existing test depended on the old
  `window.open` behavior (`EditorMenu.guardrail.test.tsx` only asserts the menu label/handlers wiring).

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2644 tests green (4 shards:
663+568+769+644; pre-existing `onTaskUpdate` RPC flake in shard 3, no real failures). Editor-only
(`__INCLUDE_EDITOR__`-gated) — no build/scan pipeline touched, so `atlas:publish` not required.
`manifest.json` churned LF→CRLF only after running tests (no content diff) — reverted before commit.
Clean merge into `auto/continuous-dev` (no concurrent runs — origin tip matched the run's fork point at
merge time, confirmed via `git fetch` immediately before merging).

- [x] **Q44. Surface an undo/redo toast with the action label.** ✅ DONE 2026-07-25 — commit 7bc18bf8

**Implementation:**
- `src/atlas/useUndoStack.ts`: `undo()`/`redo()` now return the acted action's `label` (or `undefined`)
  instead of `void`, so callers learn what was just undone/redone without any new state or duplicate
  bookkeeping — the label was already recorded on `push`, just discarded at the read side.
- `src/atlas/shell/useEditorKeyboardShortcuts.ts`: the Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z / Ctrl+Y handlers
  now show a `sonner` `toast.info("Undid: <label>")` / `toast.info("Redid: <label>")` when a label is
  present; unlabelled actions show no toast (keeps the noise-free stack entries, e.g. plain
  `push({undo, redo})` calls in tests, silent).
- `src/pages/AtlasPlacementEditor.tsx`: the toolbar Undo/Redo buttons' `onClick` handlers do the same —
  capture the returned label and toast it, so the label surfaces identically whether the DM used the
  keyboard or clicked the button.
- Audited every `undoStack.push` site (`AtlasPlacementEditor.tsx`, `usePinOverrideMutations.ts`,
  `useMapLayers.ts`, `useRouteDraft.ts`, `useRegionDraft.ts`, `useSoundscapeDraft.ts`, `useFogDraft.ts`):
  all already pass a human label (`compute, label: string` is a required param at every wrapper, or a
  fixed string like `"fog"`/`"save (cleared local drafts)"`) — no site needed a label added.
- Tests: `src/test/use-undo-stack.test.tsx` gained 4 cases (undo/redo return the pushed label; both
  return `undefined` for an unlabelled action and for an empty stack). `src/test/shell/
  useEditorKeyboardShortcuts.test.ts` gained 3 cases (Ctrl+Z / Ctrl+Shift+Z toast the label via a mocked
  `sonner`; Ctrl+Z shows no toast when the label is absent). The toolbar-button path reuses the identical
  `undo()`/`redo()` contract already covered at the hook level, so no separate full-page render test was
  added (`AtlasPlacementEditor.smoke.test.tsx` is deliberately kept shallow).

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2651 tests green (4 shards:
663+572+769+647; pre-existing `onTaskUpdate` RPC flake in shards 1 and 3, no real failures). Editor-only
(`__INCLUDE_EDITOR__`-gated) — no build/scan pipeline touched, so `atlas:publish` not required.
`manifest.json` churned LF→CRLF only after running tests (no content diff) — reverted before commit.
Clean merge into `auto/continuous-dev` (no concurrent runs — origin tip matched the run's fork point at
merge time, confirmed via `git fetch` immediately before merging); typecheck re-verified on the merged
tree before pushing.

- [x] **Q45. Add Shift-coarse / default-fine nudge with a visible step.** ✅ DONE 2026-07-25 — commit 1f20968d

**Implementation:**
- `src/atlas/nudgeStep.ts` (new): `NUDGE_FINE = 100`, `NUDGE_COARSE = 500`, and a pure `nudgeStep(shiftKey)`
  helper that resolves which one applies.
- `src/atlas/NudgeButtons.tsx` (new): a shared arrow-pad control (label + 4-direction grid) that reads
  `e.shiftKey` on each arrow's `onClick` and calls `onNudge(dx, dy)` already scaled by the resolved step,
  preserving each direction's sign. Renders the active step sizes next to the label, e.g.
  `Nudge (100 · ⇧500)`.
- `src/pages/AtlasPlacementEditor.tsx`: the pin popover's inline 4-button nudge grid (hardcoded ±100)
  replaced with `<NudgeButtons onNudge={(dx, dy) => onNudge?.(dx, dy)} />`.
- `src/atlas/tabs/RegionsTab.tsx`: the "Nudge whole region" inline 4-button grid (same hardcoded ±100)
  replaced with `<NudgeButtons label="Nudge whole region" onNudge={(dx, dy) => translate(selected.id, dx, dy)} />`.
  Both call sites now share one implementation instead of two near-duplicate JSX blocks.
- Coordinates stay in raw map units throughout — no Leaflet lat/lng flip in this path.
- Tests: `src/test/nudgeStep.test.ts` (3 cases, the pure helper). `src/test/atlas/NudgeButtons.test.tsx`
  (5 cases: step hint renders, default/custom label, plain-click fine step in all 4 directions,
  Shift-click coarse step in all 4 directions). `src/test/tabs/RegionsTab.test.tsx` gained 2 integration
  cases (plain click → `translate("r1", 0, 100)`; Shift-click → `translate("r1", 500, 0)`) proving the
  RegionsTab wiring specifically. The pin-popover wiring is a one-line pass-through of the same
  `NudgeButtons` component already covered directly, so no separate popover-interaction test was added
  (would require driving the Radix `Popover` open state, which no existing test in this codebase does).

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2661 tests green (4 shards:
666+577+821+597; pre-existing `onTaskUpdate` RPC flake in shard 3, and a one-off `buildSecrets.test.ts`
cross-test-pollution flake in shard 2 that passed both standalone and on a shard re-run — no real
failures). Editor-only (`__INCLUDE_EDITOR__`-gated) — no build/scan pipeline touched, so `atlas:publish`
not required. `manifest.json` churned LF→CRLF only after running tests (no content diff) — reverted
before commit. Clean merge into `auto/continuous-dev` (no concurrent runs — origin tip matched the run's
fork point at merge time, confirmed via `git fetch` immediately before merging).

- [x] **Q46. Show a '+N more' overflow indicator on validation chips.** ✅ DONE 2026-07-25 — commit ae8021dd

**Implementation:**
- `src/atlas/tabs/ValidationChips.tsx`: after the sliced chip list, when `issues.length > limit` renders
  a muted, non-interactive `+N more` row (`text-[11px] text-muted-foreground`) with `N = issues.length -
  limit`. No row at or below the limit. Shared by all three call sites (Regions/Routes/Fog tabs) with no
  per-tab change needed.
- Tests: `src/test/atlas/ValidationChips.test.tsx` (2 cases — overflow row with correct N above the
  limit; no row at or below the limit).

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2663 tests green (4 shards:
666+577+771+649; pre-existing `onTaskUpdate` RPC flake in shard 3 confirmed via a clean re-run, 0 real
failures both times). Editor-only (`__INCLUDE_EDITOR__`-gated) — no build/scan pipeline touched, so
`atlas:publish` not required. Clean merge into `auto/continuous-dev` (no concurrent runs — origin tip
matched the run's fork point at merge time, confirmed via `git fetch` immediately before merging).

- [x] **Q47. Add a 'No matches' empty state to the command palette.** ✅ DONE 2026-07-25 — commit 2f15a7b8

**Implementation:**
- `src/atlas/shell/CommandPalette.tsx`: the results `<ul>` now renders a single muted, non-selectable
  row (`No matches for "<query>"`, `text-muted-foreground`) when `results.length === 0`, instead of an
  empty list. The normal result buttons render unchanged whenever there's at least one match.
- Tests: `src/test/shell/CommandPalette.test.tsx` gained 2 cases — the empty-state row appears with the
  query echoed on a no-match search, and is absent when results exist. The other 7 pre-existing cases
  stayed green untouched.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2665 tests green (4 shards:
666+577+773+649; pre-existing `onTaskUpdate` RPC worker-communication timeout in shard 3, 0 tests failed
— known flake signature, not a real failure). Editor-only (`__INCLUDE_EDITOR__`-gated) — no build/scan
pipeline touched, `atlas:publish` not run. Clean merge into `auto/continuous-dev` (no concurrent runs —
origin tip matched the run's fork point at merge time, confirmed via `git fetch` immediately before
merging).

- [x] **Q48. Resolve heading-anchor wikilinks in the navigable path (heading anchors only).** ✅ DONE 2026-07-25 — commit ddb9b3c3

**Implementation:**
- `src/atlas/content/parseWikilinks.ts` (`tokenizeWikilinks`): computes `filePart` = the target text
  before the first `#` and resolves via `ctx.resolveByName(filePart)` instead of the full target, so
  `[[Note#Heading]]` now renders a navigable `<a data-entity-id>` to Note in both player and DM builds
  (all consumers — `build-atlas.ts`, `projectEntityForPlayer.ts`, `EntityPanes.tsx`,
  `EntityReadingView.tsx` — share this one implementation, `scripts/atlas/parseWikilinks.ts` is just a
  re-export). `[[Note#^blockid]]` resolves the note the same way — the block ref is never used for
  resolution (explicit non-goal). `[[#Heading]]` (empty file part, same-note anchor) is never resolved
  and renders an inert `<span class="atlas-wikilink-anchor">` (`renderLinkTokens`, keyed off
  `link.target.startsWith("#")`) instead of the dead planned-link span. Display text falls back to the
  file part (or the text after `#` for the empty-file-part anchor case) when no alias is given.
  CRITICAL for safety: `link.target` is kept as the full original trimmed string (e.g.
  `SecretNote#Heading`) unchanged, so the existing player leak-scan redaction regexes in
  `build-atlas.ts:553-559` and `projectEntityForPlayer.ts:104-107` (both built from `l.target`) still
  match and redact `[[SecretNote#Heading]]` verbatim.
- `src/index.css`: added a minimal `.atlas-prose .atlas-wikilink-anchor { color: inherit; }` rule
  alongside the existing planned-link styles.
- Tests: `src/test/content/parseWikilinks.test.ts` gained 8 cases (heading-anchor resolve + alias +
  unresolvable-file-part + same-note-anchor + block-ref + both render paths). `src/test/content/
  projectEntityForPlayer-gaps.test.ts` gained 2 cases — a regression proving `[[SecretNote#Heading]]`
  (dm-only) is redacted from `body`/`bodyHtml`/`links` through the player projection's existing
  secret-leak path, and that a same-note `[[#Heading]]` anchor is never treated as a leak.
  `parseWikilinks-parity.test.ts` and `projectEntityForPlayer-build-parity.test.ts` stayed green
  unmodified.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2674 tests green (4 shards:
668+577+780+649; pre-existing `onTaskUpdate` RPC worker-communication timeout in shard 3, 0 tests failed
— known flake signature, not a real failure). Touches the build pipeline (`parseWikilinks.ts` feeds
`build-atlas.ts`) — `npm run atlas:publish:integrity-smoke` (all 5 planted faults still caught) and
`npm run atlas:publish` (all 12 orchestrator scans clean; player build unaffected) both green. Build
artifacts regenerated in the worktree during the publish gate (`atlas.json`/`search-index.json`
version/publishedAt stamp, audio `manifest.json` LF/CRLF) were reverted before commit — no artifact
diff carried into the merge. Clean merge into `auto/continuous-dev` (no concurrent runs — origin tip
matched the run's fork point at merge time, confirmed via `git fetch` immediately before merging).

- [x] **Q49. Resolve folder-path wikilinks [[Folder/Note]] by basename.** ✅ DONE 2026-07-25 — commit 4c132233

**Implementation:**
- `src/atlas/content/parseWikilinks.ts` (`tokenizeWikilinks`): when `ctx.resolveByName(filePart)` is
  undefined and `filePart` contains `/`, falls back to `ctx.resolveByBasename?.(basename)` where
  `basename` is the trailing path segment. `ResolveContext` gained an optional `resolveByBasename` field
  so existing callers that only pass `resolveByName` (e.g. `EntityPanes.tsx`, `EntityReadingView.tsx`)
  are unaffected. The fallback is only attempted when the full-string resolution failed AND the target
  contains `/` — an already-resolving link never triggers it.
- `scripts/build-atlas.ts` + `src/atlas/content/projectEntityForPlayer.ts`: both builders now track
  `nameOwners` (a `Map<lowercase name, Set<entity id>>`) alongside their existing
  `crossRefNameIndex`/`nameIndex` construction, via an identical `registerName` helper. `resolveByBasename`
  looks up the name in the index but returns `undefined` when `nameOwners.get(key).size > 1` — an
  ambiguous basename (owned by more than one distinct entity) never resolves, so a folder-path link with
  a duplicate-title target stays broken rather than guessing the wrong note. Both builders construct this
  identically, keeping the parity contract that locks build/client wikilink resolution together.
  CRITICAL for safety: `link.target` is unchanged (still the full original string, e.g.
  `02_Regions/SecretNote`), so the existing player leak-scan redaction regexes in
  `build-atlas.ts:553-559`/`projectEntityForPlayer.ts:104-107` still match and redact
  `[[Folder/SecretNote]]` verbatim.
- Tests: `src/test/content/parseWikilinks.test.ts` gained 8 cases (unique-basename rescue, no-fallback
  backward-compat, ambiguous-basename-stays-broken, fallback never called when already resolved or when
  the target has no `/`, alias display preserved, nested folder path, and the `[[Folder/]]` empty-basename
  edge case). `src/test/content/projectEntityForPlayer-gaps.test.ts` gained 3 cases — the critical
  `[[Folder/SecretNote]]` (dm-only) redaction regression through the player projection's existing
  secret-leak path, an ambiguous-basename case (two player-visible entities sharing a title never resolve
  via the fallback), and an unambiguous folder-path link resolving normally with no redaction.
  `parseWikilinks-parity.test.ts` and `projectEntityForPlayer-build-parity.test.ts` stayed green
  unmodified.

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2685 tests green (4 shards:
671+577+788+649; pre-existing `onTaskUpdate` RPC worker-communication timeout in shard 3, 0 tests failed
— known flake signature, not a real failure). Touches the build pipeline (`parseWikilinks.ts` feeds
`build-atlas.ts`) — `npm run atlas:publish:integrity-smoke` (all 5 planted faults still caught) and
`npm run atlas:publish` (all 12 orchestrator scans clean; player build unaffected — pre-existing
oversize-map/orphan-asset warnings only) both green. Build artifacts regenerated in the worktree during
the publish gate (`atlas.json`/`search-index.json`, audio `manifest.json` LF/CRLF) were reverted before
each commit — no artifact diff carried into the merge. Clean merge into `auto/continuous-dev` (no
concurrent runs — origin tip matched the run's fork point at merge time, confirmed via `git fetch`
immediately before merging).

- [x] **Q50. Vault scan should only return .md files.** ~ SKIPPED 2026-07-25 — premise already false.
  `isReadableVaultPath` (`src/atlas/save/sourcePathAllowlist.ts:102-108`) already enforces `/\.md$/i` on
  every candidate path, and `processFile` (`scripts/vite-plugin-atlas-save.ts`) calls it BEFORE the
  `fs.stat`/size accounting the queue entry worried about. Verified by temporarily reverting a
  case-insensitive `.md` guard added at the top of `processFile` and re-running
  `src/test/import/vault-scan.test.ts` — its existing "returns only .md files from the vault root" test
  (writing `world.yaml`/`image.png` alongside `.md` files and asserting they're excluded) passed
  identically with and without the guard, proving the exclusion already holds via
  `isReadableVaultPath`, not something the queue entry's premise credited. The redundant guard was
  reverted (never committed) rather than landed, per the routine's "don't add things beyond what's
  needed" discipline. No code change, no gate run needed — the done-when criteria in the queue entry
  were already satisfied by pre-existing code at the endpoint's original commit (`e2330aa7`).

- [x] **Q51. Stop turning non-image ![[embeds]] into broken images.** ✅ DONE 2026-07-25 — commit 5d2aeaf3

**What shipped:** `resolveImageEmbeds` (`src/atlas/content/renderEntityMarkdown.ts`) used to convert ANY
`![[...]]` embed into a markdown `<img>`, so `![[Some Note]]` or `![[doc.pdf]]` rendered as a broken image
in the DM build, the player build, and the editor's live preview (all three share this one function, via
`build-atlas.ts:559` and `projectEntityForPlayer.ts:106`). Non-image embeds now render
`<span class="atlas-embed-missing">embedded note not shown</span>` instead — an inert placeholder, not
transclusion (an explicit non-goal). `![[image.png]]` (and jpg/jpeg/gif/webp/svg/avif, case-insensitive)
is unaffected.

**Implementation:**
- `src/atlas/content/renderEntityMarkdown.ts`: `resolveImageEmbeds` gained an `IMAGE_EXT_RE` check on the
  embed's filename (before the pipe-alias split's alt text is used) — image extensions still produce
  `![alt](resolved/path)`; anything else short-circuits to the placeholder span, never calling
  `resolveAsset`. `link.target`/filename handling for the image branch is byte-identical to before.
- `src/index.css`: `.atlas-embed-missing` styled muted + italic, matching the existing
  `.atlas-wikilink-anchor` inert-token pattern.
- Tests: `src/test/content/renderEntityMarkdown.test.ts` gained 6 cases — non-image note embed →
  placeholder (no `<img>`, no leftover `![`), `.pdf` embed → placeholder, pipe-alias on a non-image embed
  still placeholders, case-insensitive `.PNG` still resolves as an image, the placeholder surviving the
  full `renderEntityMarkdown` → sanitize pipeline, and a `%%`-wrapped `![[Secret Note]]` redaction
  regression (proves `stripDmBlocks` running before `resolveImageEmbeds` — already the ordering in both
  `build-atlas.ts` and `projectEntityForPlayer.ts` — means a DM-only note name never reaches the placeholder
  or any other output).

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2691 tests green (4 shards:
671+577+788+655; pre-existing `onTaskUpdate` RPC worker-communication timeout in shard 3, 0 tests failed —
known flake signature, not a real failure). Touches the build pipeline (both builders call
`resolveImageEmbeds`) — `npm run atlas:publish:integrity-smoke` (all 5 planted faults still caught) and
`npm run atlas:publish` (all 12 orchestrator scans clean; player build unaffected — pre-existing
oversize-map/orphan-asset warnings only) both green. Build artifacts regenerated during the publish gate
and again by the pre-commit hook's `vitest run --changed` (`atlas.json`/`search-index.json`
version/publishedAt stamp, audio `manifest.json` LF/CRLF) were reverted each time before/after commit — no
artifact diff carried into the merge. Clean merge into `auto/continuous-dev` (no concurrent runs — origin
tip matched the run's fork point at merge time, confirmed via `git fetch` immediately before merging).

- [x] **Q52. Expand folder-name to entity-type inference coverage.** ✅ DONE 2026-07-25 — commit 3a6c98d7

**What shipped:** `FOLDER_TYPE_MAP` (`src/atlas/import/inferType.ts`) was missing many common vault folder
names that `TAG_TYPE_MAP` (`inferTypeFromTags.ts`) and `categoryForType` (`entityCategory.ts`) already
understand, so notes under folders like `Cities/`, `Temples/`, `People/` fell through to the generic
`"note"` type instead of a specific one. Added plural+singular mappings: cities/city→city,
towns/town→town, villages/village→village, temples/temple→temple, shops/shop→shop, caves/cave→cave,
ports/port→port, people/persons/person→person, places/place/landmarks/landmark→location,
capitals/capital→capital, guilds/guild/organizations/organization/organisations/organisation→faction,
deities/deity/gods/god→deity — reusing the exact same type strings `categoryForType` already recognizes
(`person` and `deity` are literal type keys there; `deity`/`god` fall through to the default `lore`
category, which the queue entry called out as acceptable). No change to `categoryForType`/
`entityCategory.ts` itself.

**Implementation:**
- `src/atlas/import/inferType.ts`: 30 new entries added to `FOLDER_TYPE_MAP`; `inferTypeFromPath`'s
  walk-parents-closest-wins logic is untouched.
- Tests: `src/test/infer-type.test.ts` gained 13 new cases, one per new type group, each covering both the
  plural and singular (and British-spelling, for faction) folder spellings.

**Gate:** standard gate only (no build-pipeline change — `inferType.ts` is import/editor-side, not
consumed by `build-atlas.ts` or `projectEntityForPlayer.ts`). typecheck clean · eslint 0 errors (18
pre-existing warnings) · 2703 tests green (4 shards: 671+577+788+667). Known non-real `onTaskUpdate` RPC
worker-communication timeout appeared in shard 1 this run (0 tests failed — same documented flake
signature as prior runs, just a different shard this time). Clean merge into `auto/continuous-dev` (no
concurrent runs — origin tip matched the run's fork point at merge time, confirmed via `git fetch`
immediately before merging).

- [x] **Q53. Don't offer a visibility choice on new-import rows that is silently ignored.** ✅ DONE
  2026-07-25 — commit 75ef0b58

**What shipped:** `buildImportChanges` forces create/path-collision rows to `dm` visibility unless the row
was flagged `needsReview.reason === "secrecy-increase"`, but `ImportStagingModal`'s Visibility `<Select>`
was only disabled for `update` rows — a DM who picked `player` on a create row had it silently overwritten
back to `dm` at commit time with no indication. The Select is now also disabled on `create` and
`path-collision` rows (unless flagged for secrecy-increase review), with a `title` tooltip: "New imports
are saved DM-only for safety — publish later in the editor." Update-row behavior (including the existing
secrecy-increase-review enabled case) is unchanged.

**Implementation:**
- `src/atlas/import/ImportStagingModal.tsx`: the Visibility `<Select>` cell now computes
  `visibilityLocked = (rowKind === "create" || rowKind === "path-collision") &&
  needsReview?.reason !== "secrecy-increase"` and adds it to the existing `disabled` condition; the
  `SelectTrigger` gets a conditional `title` when locked. `buildImportChanges` (the write path) is
  untouched — this is purely surfacing the existing forced-visibility rule in the UI.
- Tests: `src/test/import-staging-modal.test.tsx` +2 cases (create row disabled + tooltip text,
  path-collision row disabled + tooltip text). The pre-existing 13 cases (including the "regular
  (non-vault) update row — visibility select is enabled" and "needsReview row" cases) stayed green
  unmodified.

**Gate:** standard gate only (editor-only, `__INCLUDE_EDITOR__`-gated; no build/scan pipeline touched).
typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2705 tests green (4 shards:
671+579+788+667). Known non-real `onTaskUpdate` RPC worker-communication timeout appeared in shard 1
again this run (0 tests failed — same documented flake signature). Clean merge into `auto/continuous-dev`
(no concurrent runs — origin tip matched the run's fork point at merge time, confirmed via `git fetch`
immediately before merging).

- [x] **Q54. Warn when frontmatter tags/aliases are a comma-jammed scalar string.** ✅ DONE 2026-07-25 —
  commit 5c696246

**What shipped:** `toStringArray` (`scripts/atlas/parseFrontmatter.ts`) silently turned a scalar like
`tags: npc, smuggler` into a single bogus tag `['npc, smuggler']` with no signal to the DM, corrupting
tag-based filtering/inference. `parseFrontmatter` now pushes a build warning
(`"<path>: atlas.tags should be a YAML list, not a comma-separated string — treated as one value"`) when
`atlas.tags`/`data.tags` or `atlas.aliases`/`data.aliases` arrive as a comma-containing string.
Warn-only — the value is still wrapped as a single-entry array exactly as before (no split), so nothing
downstream needs a new shape and already-list tags/aliases are provably byte-identical. The same signal
is surfaced in the import staging flow (`src/atlas/import/stagingState.ts`) as a
`frontmatterWarning` field on `StagingRow`, shown in `ImportStagingModal` as an amber badge + tooltip
("Comma-separated tags/aliases").

**Implementation:**
- `scripts/atlas/parseFrontmatter.ts`: new `toStringArrayWarnIfCommaJammed` wraps the existing
  `toStringArray`, used at the `aliases` and `tags` call sites only (`images` stays on the original
  `toStringArray` — untouched, not in scope).
- `src/atlas/import/stagingState.ts`: new `commaJammedWarning(rawTags, rawAliases)` helper mirrors the
  same detection; `extractStagingFields`/`buildStagingRow` thread it onto a new
  `StagingRow.frontmatterWarning` field. `updateStagingRow` already spreads `...row` first, so the field
  survives DM edits with no extra wiring needed.
- `src/atlas/import/ImportStagingModal.tsx`: renders the warning as a `Tooltip`-wrapped amber `Badge`
  in the row's status column, alongside the existing parse-error/allowlist/collision/review badges.
- Tests: `src/test/atlas-parser.test.ts` +6 cases (warns on comma-jammed `atlas.tags`, flat `tags`, and
  `atlas.aliases`; does NOT warn on a proper list or a single no-comma tag; already-list tags/aliases stay
  byte-identical with zero warnings). `src/test/import-staging-state.test.ts` +3 cases (flags
  `frontmatterWarning` for jammed tags, jammed aliases, and absent for a clean list).
  `src/test/import-staging-modal.test.tsx` +2 cases (badge shown/absent).

**Gate:** typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2716 tests green (4 shards:
674+581+794+667). Known non-real `onTaskUpdate` RPC worker-communication timeout in shard 3 (0 tests
failed — same documented flake signature). Touches the build pipeline (`parseFrontmatter.ts` feeds
`build-atlas.ts` and tags ship in `atlas.json`) — `npm run atlas:publish:integrity-smoke` (all 5 planted
faults caught) and `npm run atlas:publish` (all 12 orchestrator scans clean; player build unaffected —
pre-existing oversize-map/orphan-asset warnings only) both green. Build artifacts regenerated during the
publish gate and the pre-commit hook's `vitest run --changed` (`atlas.json`/`search-index.json`
version/publishedAt stamp, audio `manifest.json` LF/CRLF) were reverted before/after commit — no artifact
diff carried into the merge. Clean merge into `auto/continuous-dev` (no concurrent runs — origin tip
matched the run's fork point at merge time, confirmed via `git fetch` immediately before merging).

- [x] **Q55. Tell the DM up front when Sync needs a DM build loaded.** ✅ DONE 2026-07-25 — commit
  0da5f497

**What shipped:** `openWithVaultScan` threw `DmBuildRequiredError` only AFTER the DM clicked "Sync now"
when `existingById` was empty, surfacing as a late toast with no warning beforehand. `SyncPanel` now takes
a `hasDmBuild` prop; when false it renders an inline amber note ("Rebuild in DM mode first — Sync merges
against the full DM atlas.") right under the Sync button and disables the button, so the precondition is
visible and actionable before the DM ever clicks Sync.

**Implementation:**
- `src/atlas/sync/SyncPanel.tsx`: new optional `hasDmBuild` prop (default `true`, so every existing
  call site/test keeps its current behavior with zero changes). The Sync button's `disabled` condition
  gained `|| !hasDmBuild`; the inline note renders only when `!hasDmBuild`.
- `src/pages/AtlasPlacementEditor.tsx`: the `sync` panel mount now passes
  `hasDmBuild={importExistingById.size > 0}` — reusing the same `existingById` map
  `useMdImportFlow`'s `assertDmBuildLoaded` already checks, so the UI and the late-throw guard read the
  identical signal.
- Tests: `src/test/sync-panel.test.tsx` +2 cases (note shown + Sync disabled when `hasDmBuild=false`;
  note absent + Sync enabled when `hasDmBuild=true`). The 7 pre-existing cases (none of which pass the new
  prop) stayed green unmodified, confirming the default is backward-compatible.

**Gate:** standard gate only (editor-only, `__INCLUDE_EDITOR__`-gated; no build/scan pipeline touched).
typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2718 tests green (4 shards:
676+581+794+667). Known non-real `onTaskUpdate` RPC worker-communication timeout in shard 3 (0 tests
failed — same documented flake signature). Clean merge into `auto/continuous-dev` (no concurrent runs —
origin tip matched the run's fork point at merge time, confirmed via `git fetch` immediately before
merging).

- [x] **Q56. Fix false-orphan warnings for `![[embed]]` images in the asset auditor.** ✅ DONE 2026-07-25 —
  commit 929cbe46

**What shipped:** `collectReferences` in `scripts/atlas/audit-assets.ts` only harvested `![alt](path)`
and frontmatter `atlas.images` refs, so an image referenced solely via an Obsidian `![[image.png|alt]]`
embed was reported as an orphan. A new `extractEmbedImageRefs` helper mirrors the `EMBED_RE`/
`IMAGE_EXT_RE`/`DEFAULT_RESOLVE_ASSET` trio in `src/atlas/content/renderEntityMarkdown.ts` (the Q51
non-image-embed change is the direct prior art) so the reference matches exactly what the build ships:
strips any `|alt` suffix, resolves via `/atlas/assets/images/<filename>`, and skips any embed whose
target lacks an image extension — so note transclusions (`![[Some Note]]`) and other non-image embeds
are never swept up as asset references.

**Implementation:**
- `scripts/atlas/audit-assets.ts`: local `EMBED_RE`/`IMAGE_EXT_RE` consts (kept as a local copy, not
  imported, matching this file's existing self-contained-extractor pattern) + `extractEmbedImageRefs`,
  wired into `collectReferences`'s per-file `raws` array alongside the two existing extractors.
- Tests: `src/test/asset-audit.test.ts` +10 cases — 4 orphan-integration cases (plain embed, pipe-alias,
  subfolder embed, and a transclusion-alongside-a-real-embed case asserting only the image embed is
  collected) + 6 extractor-level unit cases (plain, pipe-alias, subfolder, case-insensitive extension,
  non-image-only ignored, mixed image/non-image collects only images).

**Gate:** touches the build/scan pipeline (`audit-assets.ts` runs inside `publish-orchestrator.ts`), so
both `npm run atlas:publish:integrity-smoke` (all 5 planted faults caught) and `npm run atlas:publish`
(all 12 orchestrator scans clean) were run in addition to the standard gate. typecheck clean · eslint 0
errors (18 pre-existing warnings) · 2728 tests green (4 shards: 686+581+794+667). Known non-real
`onTaskUpdate` RPC worker-communication timeout in shard 3 (0 tests failed — same documented flake
signature). The real vault content surfaced two previously-invisible embed references
(`content/astrath-deeprealm/imports/corven.md` → `Corven.png`, `edric.md` → `Edric.png`) as info-level
"BROKEN REF" lines during the publish gate — confirming the extractor now tracks embeds that were
silently invisible to the auditor before, without blocking the build (broken-ref reporting stays
info-only per the auditor's existing design). Build artifacts regenerated during the publish gate
(`atlas.json`/`search-index.json` version/publishedAt stamp, audio `manifest.json` LF/CRLF) were reverted
with `git checkout --` before the merge — no artifact diff reached `auto/continuous-dev`. Clean merge (no
concurrent runs — origin tip matched the run's fork point at merge time, confirmed via `git fetch`
immediately before merging).

- [x] **Q57. Correct the audit-assets publish-block message to match its real oversize trigger.** ✅ DONE
  2026-07-26 — commit 753c36b9

**What shipped:** `runPublishScans` (`scripts/atlas/publishScan.ts`) calls `runAuditAssets` non-strict, so
the only path that returns the blocking exit code `13` is `sizeErrors.length > 0` — an image over the
4 MB hard cap (`audit-assets.ts` line 493). Orphans and broken refs are warn/info only in this mode. But
`MSG["audit-assets"]` said "referenced but missing (or an unused image needs cleanup)", which never
describes the actual block reason a DM would see. Rewritten to "An image is larger than the 4 MB limit
and must be optimized before publishing."

**Implementation:**
- `scripts/atlas/publishScan.ts`: `MSG` exported (was module-private) so the new message string is
  directly testable without mocking the scan pipeline; only the `audit-assets` entry's text changed.
- Tests: `scripts/atlas/publishScan.test.ts` +1 case asserting the message mentions the 4 MB limit and
  does NOT mention "missing"/"unused".
- Scoped rescope from the queue's own "optionally add an `audit-assets-oversize` reason variant" —
  skipped as genuinely optional; the done-when criteria only required the message text and a test, and
  adding a second `PublishScanReason["scan"]` value would touch `publishTypes.ts` plus every consumer of
  the union for no behavior change this run needs.

**Gate:** touches the publish safety-scan adapter, so both `npm run atlas:publish:integrity-smoke` (all 5
planted faults caught) and `npm run atlas:publish` (all 12 orchestrator scans clean) were run in addition
to the standard gate. typecheck clean · eslint 0 errors (18 pre-existing warnings) · 2729 tests green (4
shards: 686+581+794+668). Known non-real `onTaskUpdate` RPC worker-communication timeout in shard 3 (0
tests failed — same documented flake signature). Build artifacts regenerated during the publish gate
(`atlas.json`/`search-index.json`, audio `manifest.json` LF/CRLF) were reverted with `git checkout --`
before the commit — no artifact diff reached `auto/continuous-dev`. Clean merge (no concurrent runs —
origin tip matched the run's fork point at merge time, confirmed via `git fetch` immediately before
merging).

- [x] **Q58. Show real file size and an oversize flag per image in the Asset Manager.** ✅ DONE
  2026-07-26 — commit 3d5ae23d

**What shipped:** `AssetManagerPanel.tsx` (editor-only) now fetches each listed asset's served byte size,
caches it in local state keyed by src, and renders it next to the row (e.g. "3.18 MB"). Rows over the
existing audit thresholds (1 MB warn / 4 MB error) get a colored size line plus an inline "— optimize
this image (over 1 MB / over the 4 MB limit)" hint. A failed fetch is caught and simply omits the size —
never crashes the panel or shows a stale/error value.

**Implementation:**
- Rescoped from the queue's literal suggestion of importing `SIZE_WARN_BYTES`/`SIZE_ERROR_BYTES` straight
  from `scripts/atlas/audit-assets.ts`: that module imports `node:fs`/`node:path`/`js-yaml` at the top
  level, so pulling it into browser-bundled editor code would try to ship Node built-ins to the client.
  Instead extracted a new dependency-free `src/atlas/assets/assetSize.ts` (`SIZE_WARN_BYTES`,
  `SIZE_ERROR_BYTES`, `formatBytes` — the exact same values/logic `audit-assets.ts` used to define
  locally) and had `audit-assets.ts` import from it instead, re-exporting the two constants for backward
  compatibility with its one existing consumer (`src/test/asset-audit.test.ts`). This matches the
  established direction in this codebase — `scripts/atlas/*.ts` already import pure logic from `src/`
  (e.g. `parseFrontmatter.ts` imports schema types via a relative path) — rather than the reverse.
- `AssetManagerPanel.tsx`: new local `useAssetSizes(srcs)` hook — one `fetch(normalizeAtlasAssetUrl(src))
  .then(blob).size` per asset on mount/src-list-change, async/await + try/catch so both a synchronous
  fetch throw (e.g. an unparseable relative URL under Node) and a rejected promise land in the same error
  path; a `cancelled` flag from the effect cleanup prevents a late `setSizes` after unmount. A small
  `AssetSizeInfo` component renders the size + oversize hint, or nothing while pending/on error.
- Tests: `src/test/assets/AssetManagerPanel.test.tsx` +2 cases (mocked oversize fetch → size + hint shown
  on both fixture rows; mocked fetch rejection → no size text, panel still renders normally). The 4
  pre-existing cases now get a `beforeEach` that stubs `global.fetch` with a never-resolving promise by
  default (restored via `afterEach: vi.unstubAllGlobals()`) so they don't attempt a real network fetch or
  produce an act-wrapping warning from an unrelated async state update; the two new tests override the
  stub per-test.

**Gate:** touches `scripts/atlas/audit-assets.ts` (part of the publish safety-scan pipeline), so both
`npm run atlas:publish:integrity-smoke` (all 5 planted faults caught) and `npm run atlas:publish` (all 12
orchestrator scans clean, output identical in shape to Q57's run — pre-existing oversize-map/orphan-asset
warnings only) were run in addition to the standard gate. typecheck clean · eslint 0 errors (18
pre-existing warnings, no new ones) · 2731 tests green (4 shards: 686+583+794+668). Known non-real
`onTaskUpdate` RPC worker-communication timeout in shard 3 (0 tests failed — same documented flake
signature). Build artifacts regenerated during the publish gate (`atlas.json`/`search-index.json`, audio
`manifest.json` LF/CRLF) were reverted with `git checkout --` before the commit — no artifact diff reached
`auto/continuous-dev`. Clean merge (no concurrent runs — origin tip matched the run's fork point at merge
time, confirmed via `git fetch` immediately before merging).

- [x] **Q59. Add bulk credit actions to the Asset Manager and fix the uncontrolled credit input.** ✅ DONE
  2026-07-26 — commit 321c109c

**What shipped:** `AssetManagerPanel.tsx`'s credit `<input>` used `defaultValue={entry.credit}`, so a
programmatic bulk-apply or external `assetCredits` update never reflected in the field once the input had
mounted — converted to a controlled `value={entry.credit}`. Added three bulk controls, all calling
`onPatch` over the whole registry: a per-row "Apply to all" button (copies that row's current credit
string onto every asset, preserving each asset's own `enabled` flag) and two panel-wide buttons, "Enable
all badges" / "Disable all badges" (flip every entry's `enabled`, preserving each asset's own credit
text).

**Implementation:**
- `AssetManagerPanel.tsx`: `applyCreditToAll(credit)` and `setAllEnabled(enabled)` helpers alongside the
  existing per-row `setEntry`, each building the full next registry and calling `onPatch` once. Reused the
  shared `Button` component (`@/components/ui/button`, already used elsewhere in the editor) for the three
  new controls instead of raw `<button>` tags, matching the codebase's existing convention.
- No `AssetCredit` schema change — `src/atlas/content/schema.ts` untouched, per the queue entry.
- Tests: `src/test/assets/AssetManagerPanel.test.tsx` +4 cases (controlled input reflects an external
  `assetCredits` prop update across a rerender; "Apply to all" copies one row's credit onto every asset
  while preserving each `enabled` flag; "Enable all badges" / "Disable all badges" flip every `enabled`
  flag while preserving each credit string). The 6 pre-existing cases stayed green unmodified.

**Gate:** editor-only panel, no build/scan pipeline touched — standard gate only (no `atlas:publish`).
typecheck clean · eslint 0 errors (18 pre-existing warnings, no new ones) · 2735 tests green (4 shards:
686+587+794+668). Known non-real `onTaskUpdate` RPC worker-communication timeout in shard 3 (0 tests
failed — same documented flake signature, not re-run). No build artifacts touched by this run (editor-only
change never invoked the build pipeline) — the `public/atlas/assets/audio/manifest.json` LF/CRLF churn
that running tests produced was reverted with `git checkout --` before the commit. Clean merge (no
concurrent runs — origin tip matched the run's fork point at merge time, confirmed via `git fetch`
immediately before merging).

- [x] **Q60. Distinguish a first-ever publish from "no changes" in the diff panel.** ✅ DONE
  2026-07-26 — commit 3613c53f

**What shipped:** `computeAtlasDiff(null, current)` returned the same `hasChanges:false` shape whether the
publish had a genuine prior baseline to compare against or none at all (a first-ever publish), so
`PublishedDiffPanel` told the DM "No changes since last publish." even when their whole world was about to
go live for the first time. `AtlasDiff` gained a `hadBaseline: boolean` field (false only when the
baseline snapshot passed to `computeAtlasDiff` was `null`); `PublishedDiffPanel.tsx` now renders "First
publish — your whole world will go live." instead of the no-changes copy when `!hasChanges && !hadBaseline`.
`ReadinessCard.tsx` needed no change — it already just forwards `result.diff` to the panel.

**Implementation:**
- `src/atlas/publish/computeAtlasDiff.ts`: `AtlasDiff.hadBaseline` added; the early-return branch (either
  side null) sets it from `baseline != null`; the full-diff branch always sets it `true`.
- `src/atlas/publish/PublishedDiffPanel.tsx`: the no-changes render branch split in two, gated on
  `diff.hadBaseline`.
- `scripts/atlas/runPublishCheck.ts`'s unrelated `EMPTY_DIFF` build-failure fallback and two integration
  test fixtures (`ReadinessCard.test.tsx`, `runPublishPush.integration.test.ts`) gained `hadBaseline: true`
  to keep typecheck green — none of those exercise the first-publish path.
- Tests: `src/test/atlas-diff.test.ts` — the existing null-baseline case now asserts `hadBaseline` is
  `false`, plus a new case asserting a genuine no-op diff between two populated snapshots keeps
  `hadBaseline: true`. `PublishedDiffPanel.test.tsx` +1 case (first-publish message renders, and the
  no-changes copy does not, when `hadBaseline: false`).

**Gate:** editor-only UI + a diff-computation module used only by the (dev-server-only) publish-check
endpoint — standard gate only (no `atlas:publish`; the shipped player build/scan pipeline is untouched).
typecheck clean · eslint 0 errors (18 pre-existing warnings, no new ones) · 2737 tests green (4 shards:
686+588+795+668). Known non-real `onTaskUpdate` RPC worker-communication timeout in shard 3 (0 tests
failed — same documented flake signature, not re-run). The `public/atlas/assets/audio/manifest.json`
LF/CRLF churn that running tests produced was reverted with `git checkout --` before the commit. Clean
merge (no concurrent runs — origin tip matched the run's fork point at merge time, confirmed via
`git fetch` immediately before merging).

**Deviation note (self-correction, same recurring class as Q49/Q51/Q59's):** this run again edited files
directly in the main working copy before creating the worktree. Caught before any commit — the
uncommitted edits were `git stash push -u`'d, a fresh worktree was created from the (unaffected) main
copy's clean tip, and the stash was popped there. No incorrect state reached any commit or the remote.

- [x] **Q61. Post-publish confirmation: show what shipped plus the commit id.** ✅ DONE
  2026-07-26 — commit c1e3f3c4

**What shipped:** `usePublishFlow.confirm()` discarded `data.pushedAt`/`data.commit` from a successful
`/__atlas/publish-push` response, so `PublishCheckTab`'s "published" panel only ever said "Your players
will see the changes in a couple of minutes." with no sign of what actually shipped. The hook now captures
a `pushResult` field (`{ pushedAt, commit }`) on a `"published"` result, and the panel renders a concrete
summary built from the check's `diff.counts` plus the short commit sha, e.g. "Published 5 entities and 3
pins (commit a1b2c3d)." Degrades gracefully: a zero count is omitted from the list (all-zero → bare
"Published."), and a missing commit drops the parenthetical entirely.

**Implementation:**
- `src/atlas/publish/usePublishFlow.ts`: new `PublishPushSummary` type + `pushResult` state, set from
  `data.pushedAt`/`data.commit` in the `"published"` branch of `confirm()`, returned from the hook.
- `src/atlas/publish/publishSummary.ts` (new): pure `shortCommit(commit)` (7-char abbreviation) and
  `formatPublishSummary(counts, commit?)` — singularizes "1 entity"/"1 pin", omits a zero count, and drops
  the commit parenthetical when absent.
- `src/atlas/tabs/PublishCheckTab.tsx`: the `state === "published"` block gained a summary line calling
  `formatPublishSummary(publish.checkResult?.diff.counts ?? { entities: 0, placements: 0 },
  publish.pushResult?.commit)`, above the existing "couple of minutes" copy (kept unchanged).
- Tests: `src/atlas/publish/publishSummary.test.ts` (new, 7 cases covering truncation, pluralization,
  zero-count omission, all-zero degrade, and missing-commit degrade). `usePublishFlow.test.ts` +2 cases
  (pushResult captured on published; stays `null` when confirm() resolves to a non-published status).
  `src/test/publish-check-tab.test.tsx` +1 case (checkResult counts + pushResult commit render the exact
  summary string) and one existing assertion (`/published/i`) tightened to `/published ✓/i` to disambiguate
  from the new summary text, which also contains the word "Published".

**Gate:** editor-only publish UI + a diff/hook module used only by the dev-server publish-check endpoint —
standard gate only (no `atlas:publish`; nothing in the shipped build/scan pipeline touched). typecheck
clean · eslint 0 errors (18 pre-existing warnings, no new ones) · 2747 tests green (4 shards:
687+588+797+675). Known non-real `onTaskUpdate` RPC worker-communication timeout in shard 3 (0 tests
failed — documented flake signature, not re-run). `public/atlas/assets/audio/manifest.json` LF/CRLF churn
from running tests reverted with `git checkout --` before the merge — no artifact diff reached
`auto/continuous-dev`. Clean merge (no concurrent runs — origin tip matched the run's fork point at both
worktree-creation and merge time, confirmed via `git fetch` immediately before each).

- [x] **Q62. Add backup retention pruning (`--keep N`) to `atlas:backup`.** ✅ DONE
  2026-07-26 — commit ff5e2ec9

**What shipped:** `scripts/atlas/backup.ts` wrote `backups/<ISO-timestamp>.zip` on every run with no
cleanup, so the folder grew unbounded. Added an opt-in `--keep N` flag: after writing the new zip, the
oldest `.zip` files in `backups/` beyond the newest N are deleted. Omitting the flag preserves the exact
prior behavior (no deletion).

**Implementation:**
- `scripts/atlas/backup.ts`: new exported pure `zipsToPrune(filenames, keep)` (filters to `.zip`, sorts —
  ISO-timestamp names sort lexicographically = chronologically — and slices off everything past the
  newest `keep`) and `parseKeepFlag(argv)` (reads `--keep N`, `undefined` if absent/non-integer/negative).
  New private `pruneOldBackups(dir, keep)` calls `zipsToPrune` over `fs.readdirSync(dir)` and unlinks only
  the selected `.zip` names inside that directory. `main()` calls it after the write, only when
  `parseKeepFlag` returned a value. The bare `main().catch(...)` at module scope (which ran unconditionally
  on import, making the pure helpers untestable without triggering a real backup) is now gated behind an
  `isMainModule` CLI-shim check (`process.argv[1] === fileURLToPath(import.meta.url)`), mirroring the
  existing pattern in `snapshot-baseline.ts`.
- Tests: `scripts/atlas/backup.test.ts` (new, 8 cases) — `zipsToPrune` for keep=0 (prunes all), keep≥count
  (prunes none), keep=1/2 (keeps newest N), non-`.zip` entries ignored, and an unsorted input list;
  `parseKeepFlag` for absent flag, valid values (including 0), and invalid values (missing, non-numeric,
  negative, fractional).

**Gate:** standard gate only per the queue spec (backup tooling, not the shipped build/scan/artifact
pipeline — no `atlas:publish`). typecheck clean · eslint 0 errors (18 pre-existing warnings, no new ones)
· 2755 tests green (4 shards: 687+588+803+677; baseline 2747 + 8 new). Known non-real `onTaskUpdate` RPC
worker-communication timeout in shard 3 (0 tests failed both times it was run — documented flake
signature). `public/atlas/assets/audio/manifest.json` LF/CRLF churn from running tests reverted with
`git checkout --` before the merge. Clean merge — no concurrent runs (origin tip matched the run's fork
point at both worktree-creation and merge time, confirmed via `git fetch` immediately before each).

- [x] **Q63. Add a non-destructive restore that extracts a backup into a fresh folder.** ✅ DONE
  2026-07-26 — commit ce8f3ef8

**What shipped:** `scripts/atlas/backup.ts` had no restore counterpart to `atlas:backup`. Added
`--restore <zip> --out <dir>`: extracts the chosen backup into `<dir>`, refusing to write anything if
`<dir>` already exists and is non-empty, then reports the extracted file count verified against the
backup's own MANIFEST.md "Files:" line. New `atlas:restore` npm script.

**Implementation:**
- `scripts/atlas/backup.ts`: new exported pure `parseRestoreFlag(argv)` (reads `--restore <zip> --out
  <dir>`, `undefined` unless both flags are present with a value — a lone flag falls through to the
  normal backup path) and `parseManifestFileCount(manifestText)` (extracts the `Files: N` line,
  `undefined` if missing/malformed). New exported `restoreBackup(zipAbsPath, outAbsDir)` takes absolute
  paths (mirroring `snapshot-baseline.ts`'s injectable-root pattern so it's testable via `mkdtempSync`
  without touching the real repo): throws before any write if the zip is missing or the output dir
  exists non-empty, otherwise extracts every zip entry (MANIFEST.md excluded from the returned count, to
  match how the manifest itself is written) and returns `{ extracted, expected }` for the caller to
  compare. `main()` checks `parseRestoreFlag` first and branches into a new `runRestoreCli` before the
  existing backup path runs; the top-level CLI-shim catch message widened to "atlas:backup/restore
  failed" since it now covers both modes.
- Tests: `scripts/atlas/backup.test.ts` extended (not replaced) — `parseRestoreFlag` (absent, one-flag,
  both-flags in either order, missing/flag-shaped values), `parseManifestFileCount` (valid, missing,
  malformed), and `restoreBackup` integration tests against real `mkdtempSync` dirs + real JSZip fixture
  zips (extracts + verifies count, refuses a non-empty out dir with nothing written, succeeds into an
  existing-but-empty dir, missing-zip error, and an unmanifested zip reporting `expected: undefined`).

**Gate:** standard gate only per the queue spec (backup tooling, not the shipped build/scan/artifact
pipeline — no `atlas:publish`). typecheck clean · eslint 0 errors (18 pre-existing warnings, no new ones)
· 2767 tests green (4 shards: 687+588+815+677; baseline 2755 + 12 new). Known non-real `onTaskUpdate` RPC
worker-communication timeout in shard 3 (0 tests failed — documented flake signature, not re-run).
`public/atlas/assets/audio/manifest.json` LF/CRLF churn from running tests reverted with `git checkout --`
twice (once pre-commit, once after the pre-commit hook's own `vitest run --changed` re-touched it) — no
artifact diff reached `auto/continuous-dev`. Clean merge (no concurrent runs — origin tip matched the
run's fork point at both worktree-creation and merge time, confirmed via `git fetch` immediately before
each). Fresh worktree's `npm install` initially produced a truncated `node_modules/@types/leaflet/
index.d.ts` (2229 lines vs. the main copy's 3160), which broke `typecheck` with a stray-`/*` parse error
unrelated to this change — a clean `rm -rf node_modules && npm install` in the worktree fixed it before
the gate ran; worth a heads-up if a future run hits an inexplicable typecheck error in unrelated
`node_modules` types right after a fresh worktree.

- [x] **Q64. Minify player atlas.json + search-index.json (keep DM build pretty-printed).** ✅ DONE
  2026-07-26 — commit 9c82d00b

**What shipped:** `scripts/build-atlas.ts` wrote both shipped artifacts with `JSON.stringify(..., null,
2)` on every build, DM and player alike. Player builds now write single-line minified JSON (smaller
payload for players); DM/`.local-atlas` builds keep the 2-space pretty form so human diffs against them
stay readable.

**Implementation:** a single `jsonIndent = flags.player ? undefined : 2` local, used for both the
`atlas.json` and `search-index.json` `JSON.stringify` calls (around line 1024-1030). No consumer change
needed — the client loader, `check-artifact-shape.ts`'s `JSON.parse` calls, and the SW cache all parse
JSON regardless of whitespace.

**Gate:** full gate including `npm run atlas:publish` per the queue spec (touches shipped player
artifacts). typecheck clean · eslint 0 errors (18 pre-existing warnings, no new ones) · 2767 tests green
(4 shards: 687+588+815+677, unchanged from baseline — no new tests needed). Known non-real
`onTaskUpdate` RPC worker-communication timeout in shard 3, re-run once to confirm (815/815 both times,
0 failed — documented flake signature). `npm run atlas:publish` → build + all 12 orchestrator scans
clean on the minified output (check-secrets, check-shape, check-derived-secrets, audit-assets,
check-fog-safety, check-image-privacy). Verified directly: player `public/atlas/atlas.json` is a single
line after the build; a DM build (`npm run atlas:build`) still emits 842 lines of pretty-printed JSON.
`public/atlas/assets/audio/manifest.json` LF/CRLF churn from running tests reverted with `git checkout
--` before committing — no artifact diff beyond the two intended files reached `auto/continuous-dev`.
Clean merge — no concurrent runs (origin tip matched the run's fork point at both worktree-creation and
merge time, confirmed via `git fetch` immediately before each).

- [x] **Q65. Stop shipping the duplicated lowercased body in the search index; derive it at load.** ✅
  DONE 2026-07-26 — commit b29efe8c

**What shipped:** `buildSearchIndex` in `scripts/build-atlas.ts` shipped both `body` (lowercased, for
matching) and `bodyText` (original case, for snippets) in every `search-index.json` entry — the same
stripped text differing only in case. Now only `bodyText` ships; `loadSearchIndex` in
`src/atlas/content/loader.ts` derives `body = bodyText.toLowerCase()` on load, so `parseSearchQuery.ts`
and `SearchPalette.tsx` keep reading `e.body` unchanged. `scanSearchIndex` in
`scripts/check-artifact-shape.ts` (the secret-leak scan) is repointed from the removed `body` field to
`bodyText`, the surviving shipped field, so leak coverage isn't lost.

**Premise re-verified before building** (per Q64's handover note): confirmed via a fresh grep of
`buildSearchIndex` that both `body` and `bodyText` were still shipped as of this run, so Q65's premise
held exactly as specced — no adjustment needed.

**Gate:** full gate including `npm run atlas:publish` + `npm run atlas:publish:integrity-smoke` (touches
a shipped artifact + the shape safety scan). typecheck clean · eslint 0 errors (18 pre-existing warnings,
no new ones) · 2771 tests green (4 shards: 689+617+842+623; baseline 2767 + 4 new — 2 in a new
`src/test/content/loader.test.ts` covering the client-side derivation, 2 in `artifact-shape.test.ts`
proving `scanSearchIndex` now flags a leak in `bodyText` and no longer scans a stray `body` field). Known
non-real `onTaskUpdate` RPC worker-communication timeout in shard 3, re-run once to confirm (842/842 both
times, 0 failed). `npm run atlas:publish:integrity-smoke` → all 5 active scans still catch their planted
fault. `npm run atlas:publish` → build + all 12 orchestrator scans clean. Verified directly: shipped
`public/atlas/search-index.json` entries carry `bodyText` on all 6 entries and `body` on none.
`public/atlas/atlas.json` (publish-stamp churn only) and `public/atlas/assets/audio/manifest.json`
(LF/CRLF churn) reverted with `git checkout --` before committing — only the intended
`search-index.json` shape change reached `auto/continuous-dev`. Clean merge — no concurrent runs (origin
tip matched the run's fork point at both worktree-creation and merge time, confirmed via `git fetch`
immediately before each).

- [x] **Q66. Lazy-load search-index.json on first search instead of at viewer startup.** ✅ DONE
  2026-07-26 — commit caaf8f96

**What shipped:** `AtlasViewer.tsx` used to fetch `search-index.json` in the same `Promise.all` as
`atlas.json` at mount, so every `/atlas` visit downloaded+parsed the full search index even for players
who never open search. The initial-load effect now only calls `loadAtlasContent`; a new effect keyed on
`searchOpen` calls `loadSearchIndex()` the first time the palette opens, storing the result in a new
`searchIndex` state. A `useRef<Promise<void> | null>` guards against re-fetching on subsequent opens
(the promise itself, not a boolean, is stored so a fetch already in flight is never started twice).
While `searchIndex` is still null, the search overlay renders a small "Loading search…" placeholder
(`role="status"`, same overlay chrome) in place of `SearchPalette`; `SearchPalette`'s own prop contract
and existing tests are untouched. On fetch failure the error routes through the existing page-level
`setError` state, matching the pre-change behavior (a `loadSearchIndex` failure inside the original
`Promise.all().catch()` also surfaced as the page error).

**Gate:** standard gate (no `atlas:publish` needed — runtime-only, no shipped-artifact change, per the
queue spec). typecheck clean · eslint 0 errors (18 pre-existing warnings, no new ones) · 2774 tests green
(4 shards: 689+620+842+623; baseline 2771 + 3 new, all in
`src/test/pages/AtlasViewer.smoke.test.tsx`: initial load fetches no search-index; first search-open
fetches it exactly once and shows the loading placeholder first; closing and reopening does not
re-fetch). Known non-real `onTaskUpdate` RPC worker-communication timeout in shard 3, re-run once to
confirm (842/842 both times, 0 failed — documented flake signature). `public/atlas/assets/audio/manifest.json`
LF/CRLF churn from running tests reverted with `git checkout --` before committing — no artifact diff
beyond the two intended files reached `auto/continuous-dev`. Clean merge — no concurrent runs (origin tip
matched the run's fork point at both worktree-creation and merge time, confirmed via `git fetch`
immediately before each).

- [x] **Q67. Add a dev `maps:optimize` tool (PNG→WebP source) mirroring `audio:transcode`.** ✅ DONE
  2026-07-26 — commit 9d96f9c0

**What shipped:** `scripts/dev/optimize-maps.mjs` + a `maps:optimize` npm script, mirroring
`scripts/dev/transcode-audio.mjs`'s shape. For each PNG under `public/atlas/assets/maps` over 1 MB
(`OVERSIZE_BYTES`, matching the existing `SIZE_WARN_BYTES` budget in `src/atlas/assets/assetSize.ts`),
it emits a `.webp` twin via `sharp` at quality 85 (matching the quality already used by the save
pipeline's metadata-strip step) and repoints the matching `layers[].src` line (regex-based text
replace, not a full YAML re-serialize, so hand-authored formatting/comments in `world.yaml` survive
untouched) in every `_atlas/world.yaml` found under `content/` and `examples/` — both known content
roots — from `.png` to `.webp`. The source PNG is kept (twin, not replace), the same pattern
`audio:transcode` uses for its source `.wav`.

**Spec correction (verified before building):** the queue entry cited `public/atlas/assets/maps/world.yaml`
as the file to repoint, but that file is dead/orphaned — it's not read by any script (`atlas.config.json`
points `contentRoot` at `content`, and `loadWorldConfig` only ever loads `<contentRoot>/<world>/_atlas/world.yaml`)
and its content (a `map.jpg` layer, `Raven's Vale`/`Thornhold Domain` regions) doesn't match the real
world at all. The actual file governing the shipped maps is `content/astrath-deeprealm/_atlas/world.yaml`.
Built the tool to search `_atlas/world.yaml` under both `content/` and `examples/` generically (so it
also covers `examples/seed-world/_atlas/world.yaml` once Q99 gives it map layers) rather than
hardcoding the stale path.

**Verified end-to-end, then reverted the asset swap:** ran `npm run maps:optimize` against the real repo
assets — all 6 map PNGs (~2.9–3.3 MB each) converted cleanly to `.webp` twins (343–464 KB, ~85–89%
smaller) and `content/astrath-deeprealm/_atlas/world.yaml`'s six `layers[].src` entries were correctly
repointed. Reverted that resulting diff (`git checkout --` on world.yaml, `git clean` on the new `.webp`
files) before committing — swapping the shipped map images for lower-fidelity twins is a visual-quality
call for the DM to make and run themselves when ready, not something the routine should force through
unreviewed on a dev-tool task. Only the tool (script + npm script wiring) is committed.

**Gate:** standard gate (typecheck + ESLint + sharded vitest) — dev-only tool outside the gated pipeline,
no shipped-artifact touch (the verification run's output was reverted), so no `atlas:publish` needed per
the queue spec. typecheck clean · eslint 0 errors (18 pre-existing warnings, no new ones) · 2774 tests
green (4 shards: 689+620+842+623; no new tests — `scripts/dev/*.mjs` dev tools have no test-file
precedent in this repo, e.g. `transcode-audio.mjs` has zero coverage). Known non-real `onTaskUpdate` RPC
worker-communication timeout in shard 3, re-run once to confirm (842/842 both times, 0 failed —
documented flake signature). Pre-commit hook's `vitest run --changed` also ran the full 2774-test suite
clean (same flake signature, 0 real failures). `public/atlas/assets/audio/manifest.json` LF/CRLF churn
from running tests reverted with `git checkout --` before committing.

- [x] **Q68. Configure `manualChunks` so vendor libs get a cache-stable hash.** ✅ DONE
  2026-07-26 — commit 0454f354

**What shipped:** `vite.config.ts` gained `build.rollupOptions.output.manualChunks`, a function grouping
`node_modules` deps into three stable vendor chunks: `vendor-react` (react/react-dom/react-router/
react-router-dom/scheduler), `vendor-leaflet` (leaflet + react-leaflet), and `vendor-radix` (all
`@radix-ui/*` packages). Everything outside `node_modules` falls through to Rollup's default chunking
(route-based, via the existing `lazy()` imports in `src/App.tsx`), so app/content code is untouched.

**Verified end-to-end:** `npm run build` (player mode) emits distinct `vendor-react-*`, `vendor-leaflet-*`,
`vendor-radix-*` chunks (163/156/118 KB respectively). Appended a no-op comment to `src/App.tsx` (app
code only) and rebuilt — all three vendor chunk hashes (`BqnYlLYE`/`B0rfh9Np`/`CjGbd3dz`) were byte-for-byte
identical before and after, confirming cache stability; reverted the test edit before committing. Grepped
`dist/assets` for `AtlasPlacementEditor` and `atlas/save` — zero matches, confirming the
`__INCLUDE_EDITOR__` tree-shake gate still holds and no vendor chunk pulls in editor code.

**Gate:** standard gate (typecheck + ESLint + sharded vitest) + `npm run atlas:publish` (touches the
bundler config that produces the player build, per the queue spec). typecheck clean · eslint 0 errors
(18 pre-existing warnings, no new ones) · 2774 tests green (4 shards: 689+620+842+623). Known non-real
`onTaskUpdate` RPC worker-communication timeout in shard 3, re-run once to confirm (842/842 both times,
0 failed — documented flake signature). `atlas:publish` → all 12 orchestrator scans clean (pre-existing
oversized-map warnings only, same as prior runs — no new findings). `public/atlas/atlas.json`'s
version/publishedAt stamp and `public/atlas/assets/audio/manifest.json`'s line-ending churn from the
publish verification reverted with `git checkout --` before committing — only `vite.config.ts` reached
`auto/continuous-dev`.

**Commits:** `9d96f9c0` (feat, on `run/q67-maps-optimize`), merge into `auto/continuous-dev` (see
`git log auto/continuous-dev` for the merge-commit hash if needed).

**Pushed to origin:** see `ACTIVE.md` for confirmation. Worktree `../campaign-atlas-final-run-q67` and
branch `run/q67-maps-optimize` cleaned up after merge. No concurrency this run — origin tip matched the
fork point at worktree creation and at merge time (confirmed via `git fetch` immediately before each).

- [x] **Q69. Bound vitest fork count/memory in `vitest.config.ts` so `npm test` stops OOMing.** ✅ DONE
  2026-07-26 — commit 00888fd8

**What shipped:** `vitest.config.ts`'s `test` block gained `pool: "forks"` with
`poolOptions.forks: { maxForks: 3, minForks: 1, isolate: true }`, baking in the same bound the routine's
ad-hoc `--pool=forks --poolOptions.forks.maxForks=3` shard invocation has needed to survive the 4GB
coordinator budget. An inline comment documents the memory rationale (forks reclaim memory on exit,
unlike threads sharing one V8 heap; unbounded per-core forks pile up enough concurrent jsdom heaps
across ~270 files to OOM).

**Verified end-to-end:** ran plain `npm test` (no shard/pool flags) in a fresh worktree — completed the
full 269-file / 2774-test suite in 202.93s with zero OOM, all tests green. Two "Unhandled Errors" in
the output are the documented `onTaskUpdate` RPC worker-communication flake (0 real test failures) —
same known signature as every prior sharded run. Wall-time (202.93s single invocation) is in line with
the sharded approach's total (no regression) and avoids paying vitest's process-startup cost four times
over.

**Gate:** standard gate only (typecheck + ESLint + `npm test`) — this change hardens the gate itself, no
`atlas:publish` needed (no build-pipeline/artifact touch). typecheck clean · eslint 0 errors (18
pre-existing warnings, no new ones) · 2774 tests green in one unsharded run. Pre-commit hook's
`vitest run --changed` found no changed test files for a config-only diff (exit 0, expected).
`public/atlas/assets/audio/manifest.json` LF/CRLF churn from running tests reverted with
`git checkout --` before committing — only `vitest.config.ts` reached `auto/continuous-dev`.

**Commits:** `00888fd8` (feat, on `run/q69-vitest-pool`), merge into `auto/continuous-dev` (see
`git log auto/continuous-dev` for the merge-commit hash).

**Pushed to origin:** see `ACTIVE.md` for confirmation. Worktree `../campaign-atlas-final-run-q69` and
branch `run/q69-vitest-pool` cleaned up after merge. No concurrency this run — origin tip matched the
fork point at worktree creation and at merge time (confirmed via `git fetch` immediately before each).
