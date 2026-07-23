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
