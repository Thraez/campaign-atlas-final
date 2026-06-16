# One-Click Publish — Design

**Date:** 2026-06-16
**Status:** Approved design — ready for implementation plan
**Source brief:** `docs/superpowers/specs/2026-06-15-one-click-publish-brief.md` (Option C)
**Companion feature:** `docs/superpowers/specs/2026-06-16-obsidian-readonly-merge-design.md` (independent; ships separately)

> This spec was hardened against the codebase by an adversarial review (2026-06-16).
> Where the design leans on existing code, the exact functions and line-level realities
> are named so the implementation plan can't drift back into wishful claims.

---

## 1. Goal & non-goals

### Goal

Give the DM a single, trustworthy **Publish** button in the editor that takes the
world from "I just made changes" to "my players can see it" — without a terminal,
without `git`, and without ever risking a leak of DM-only content.

The button runs a player-safe build and the safety scans, shows the DM in plain language
*what will change* and *whether it's safe*, and — only after the DM confirms — commits the
world's files and pushes to `main`, which fires the existing GitHub Action that re-scans
and deploys to GitHub Pages.

### Non-goals

- **No new deploy mechanism.** The real deploy stays as it is today:
  `push main` → `.github/workflows/publish-atlas.yml` → GitHub Pages. We add a *local
  on-ramp* to that pipeline.
- **No two-way anything.** This feature reads source and writes the build artifact + a git
  commit. It never edits the DM's notes.
- **No credential storage.** Use whatever git login the machine already has (GitHub
  Desktop / credential manager). Never store, prompt for, or embed a token. (D6.)
- **Not in the player build.** Every line of this feature is editor-only and tree-shaken
  out of the player bundle, like `/__atlas/save`. (D7.)

---

## 2. User experience

### 2.1 One button, the full state set

The existing **Publish** rail item (`railRegistry.tsx`, system group) opens a read-only
dashboard (`PublishCheckTab.tsx`). We turn that dashboard into a single action. The client
state machine (`usePublishFlow`, §6) owns **every** terminal state the endpoints can
return — not just the happy path:

1. **Idle** — "Publish to players" button + a **neutral** prompt ("Run a check to see
   what's new and whether it's safe"). The card shows *no* green/red safety verdict yet
   (see §7.3 — the in-memory validator must not pose as the safety verdict here).
2. **Checking…** — spinner ("Checking your world…"). Player atlas rebuild + site build +
   scans run. This is build-length (seconds to low tens of seconds); the button is locked.
3. **Ready — review** (verdict `safe`) — readiness card (§2.2) with a green verdict and a
   **Publish now** confirm button.
4. **Blocked — safety** (verdict `blocked`) — red card with the plain-language reasons
   (§2.3); **no** confirm button. The DM fixes the source note and re-checks.
5. **Build failed** (verdict `build-failed`) — *distinct from a safety block*: "Couldn't
   build your world" + the build's error tail (truncated, like Save). Not a leak; the
   world file didn't compile. No confirm button.
6. **Publishing…** (after confirm) — spinner with the sub-label **"Re-checking safety
   before publishing…"** so the DM understands the confirm step re-verifies (§5.1, D10)
   rather than hanging.
7. **Published ✓** — "Published ✓ — your players will see the changes in a couple of
   minutes." (The lag is the GitHub Pages deploy; we state it so the DM doesn't expect an
   instant live change.)
8. **Already up to date** (push result `nothing-to-publish`) — "Nothing new to publish."
9. **Couldn't publish automatically** (push result `git-failed`) — happens *after* the
   local commit is made (§5.5): "Couldn't publish automatically — finish in GitHub
   Desktop," with a one-line reason when classifiable.
10. **Busy** (HTTP 423) — "Busy — finishing the current build," when a save or another
    publish is mid-build (§3.2).

The vocabulary reuses Save's: a toast on success, a `publishedAt`-style timestamp, the
red/green safety tone already in the dashboard.

### 2.2 The readiness card (the trust surface)

Before any push, the card answers three DM questions:

- **"What will my players see that's new?"** — the *player-vs-player* change list (§4.3):
  entities/pins/maps added, removed, or changed between the **last published** player atlas
  and the **freshly built** player atlas. Both sides are scrubbed, so DM-only notes never
  appear here as phantom incoming changes. Rendered with `computeAtlasDiff` + the visual
  language of `PublishedDiffPanel` — note this requires a small refactor (§4.3, §6),
  because `PublishedDiffPanel` today self-fetches the baseline and computes the diff
  client-side; it has no prop to accept a precomputed diff.
- **"Is it safe?"** — a single green/red **safety verdict** driven *solely* by the server
  `PublishCheckResult.verdict` (§7.3).
- **"Anything I should know?"** — the **public-repo notice** (§2.4).

### 2.3 Plain-language failures (never a path, never a secret, never a raw exit code)

If any scan fails, the button goes **blocked-red**, the confirm button is hidden, and the
card explains each failure in DM language. The message is generated from a **static
template keyed on the scan's identity** (which scan, which structured finding) — *not* by
copying any text out of the scan's own output, and *not* by exit code alone (exit `13` is
shared by three different scans; see §4.2). Template:

| Originating scan / finding | What the DM sees |
|---|---|
| `check-no-secrets` — DM-content sentinel hit | "A DM-only note would have been visible to players. Publishing is blocked until it's hidden." |
| `check-no-secrets` — editor-code fingerprint hit | "The editor itself leaked into the player build — this is a code bug, not a content problem. Publishing is blocked; this needs a developer." |
| `check-derived-secrets` — derived name hit | "The name of a hidden person or place would have leaked into the player site. Publishing is blocked." |
| `check-image-privacy` hit | "An image that's marked DM-only would have been published. Publishing is blocked." |
| `check-fog-safety` — image / geometry / in-fog-content / alpha leak | "A map's hidden (fogged) area would have been revealed. Publishing is blocked." |
| `check-artifact-shape` violation | "The world file came out malformed — the build needs attention before publishing." |
| `audit-assets` violation | "An image is referenced but missing (or an unused image needs cleanup). Publishing is blocked." |

**Locator availability is limited** — the card links to an entity/map only where the scan
actually produces a safe locator (§4.4):

- `check-artifact-shape` → `ShapeViolation.entityId` (and sometimes a `map[...]` field) →
  go-to-entity / go-to-map link, exactly like `PublishCheckTab`'s existing issue cards.
- `check-derived-secrets` → `DerivedScanHit.match.source` (a `content/…md` path) → a
  source-file reference (not a go-to-entity link).
- `check-no-secrets` / `check-image-privacy` / `check-fog-safety` → only a *built-artifact*
  file path (e.g. `dist/assets/index-<hash>.js`) or a finding code — **no** entity/map
  locator. The card shows the kind + a safe path; there is no go-to-entity link for these.

**Secrecy rule (D8) — the verdict must never echo the leaked secret.** This is not
automatic: the structured hits the endpoint reads *carry the secret verbatim* —
`DerivedScanHit.match.name` **is** the leaked DM title/alias, and `ShapeViolation.message`
embeds leaked values. The endpoint must therefore:
- build every message from the static template above (never from `match.name` or
  `ShapeViolation.message`);
- use only `match.source` + `match.field` (never `match.name`) as a derived-hit locator;
- surface `check-no-secrets` `ScanHit.pattern` *only* because it is a fixed sentinel /
  editor-fingerprint string, never real campaign content.

### 2.4 The public-repo notice

The repository is **public**. The published *site* is fully scrubbed, but the *source
notes* in `content/` — including DM-only notes — are visible to anyone browsing the GitHub
repo. The DM chose **"warn me before each push."** So the readiness card carries a
persistent, low-key line on every check: *"Your source notes (including DM-only ones) are
public on GitHub. Only the published site is scrubbed."* Informational, not a blocker. (D9.)

---

## 3. Architecture

### 3.1 Two dev-only endpoints

Both live in the existing save plugin (`scripts/vite-plugin-atlas-save.ts`,
`apply: "serve"`), so they exist **only** in the dev server and are absent from production
builds.

- **`POST /__atlas/publish-check`** — rebuild player atlas + build site + run scans →
  return a structured `PublishCheckResult` (verdict + per-scan plain-language reasons +
  player-vs-player diff). Git-read-only; the only things it writes are normal build
  artifacts (`public/atlas/atlas.json`, `dist/`).
- **`POST /__atlas/publish-push`** — re-verify a green verdict, make the scoped commit,
  push to `main`, then snapshot the new baseline. The only endpoint that touches git.

Both reuse the existing access gate `isAllowedDevRequest`
(`scripts/vite-plugin-atlas-save.ts:190`) verbatim — loopback host + loopback Origin on
writes. No new access logic. (D5.)

### 3.2 Single-flight lock — a real hoist, not "one more flag"

Today's `saveInFlight` is a closure `let` declared **inside** `atlasSavePlugin()` and read
only by the `/__atlas/save` middleware (`vite-plugin-atlas-save.ts:908`, used at
`:1017`). To make a publish and a save mutually exclusive, that guard must be **hoisted to
a module-level shared mutex** (a small `{ inFlight: boolean }` object, or a module
`let` + helpers) that all three middlewares — `/__atlas/save`, `/__atlas/publish-check`,
`/__atlas/publish-push` — consult. The publish endpoints must live in the **same plugin /
module** (or import the shared lock) for the guarantee to hold; three independent flags
would *not* stop a save racing a publish-check.

Overlap → **423 Locked**; the UI shows "Busy — finishing the current build."

A publish-check is a full player build + child-process `npm run build` (tens of seconds) —
much longer than a save rebuild. We **accept** that a publish blocks Save for its duration.
We do **not** extend the lock to the `DELETE /__atlas/assets/images` image-picker path,
preserving today's deliberate choice (`:904-907`) to keep the picker responsive. (D4.)

### 3.3 In-process vs child-process

- **Player atlas build** → **in-process** via the exported `runBuild(...)` from
  `scripts/build-atlas.ts:250`. **Note:** Save's rebuild (`runAtlasBuild`,
  `vite-plugin-atlas-save.ts:761`) calls `runBuild()` with *default* flags
  (`{player:false, strict:false}`) → the **DM** build → `.local-atlas/`. publish-check
  must call `runBuild({ player: true, strict: true })` → the **player** artifact →
  `public/atlas/atlas.json`, with stricter failure modes. They share the `runBuild`
  *entry point*, not the flags, output dir, or failure semantics. The 60s timeout race
  lives in `runAtlasBuild`'s wrapper, **not** in `runBuild` — publish-check must apply its
  own timeout race (or we factor the wrapper out so both call it). (D2.)
- **Site build (`dist/`)** → **child process** (`npm run build`, with a timeout). `vite
  build` is a heavyweight tool with its own config; spawning it as an isolated child is
  cleaner than re-entering Vite from inside the running dev server. This produces the
  player bundle the editor-leak scan inspects.
- **Scans** → **in-process**, but by calling the **structure-returning** exports — **not**
  `run()`. Each scan's `run(opts)` returns only a bare exit-code integer and prints hits to
  `console.error`; the structured data lives in the lower-level exports the `run`
  functions call internally and discard:
  - `check-no-secrets.ts:73` `scanDir(dir): ScanResult` (`{ files, dmHits, editorHits }`,
    each hit `{ file, pattern, kind }`)
  - `check-derived-secrets.ts:174` `scanArtifactForSecrets(dir, secrets): DerivedScanResult`
    (hits `{ file, match: { name, source, field } }`)
  - `check-artifact-shape.ts` `scanArtifactShape(...)` (`ShapeViolation` carries `entityId`)
  - `audit-assets.ts` `auditAssets(...)` (structured `AuditReport`)
  - `check-image-privacy.ts` / `check-fog-safety.ts` — finding objects (`{ code, message,
    file? }`); verify their structured exports at plan time and add one if a scan only
    exposes `run()`.
  The endpoint derives the verdict (and the §2.3 message) from these structured results;
  it must **not** rely on `run()`'s exit code for anything but a cross-check, and must
  **not** surface raw hit text (§2.3, D8). (`publish-orchestrator.ts` composes the bare
  `run()` functions — we deliberately do *not* reuse it for the endpoint, because it throws
  away the structure we need.)

### 3.4 The local check is a strict superset of CI — and we make CI match it

**Reality (verified):** `.github/workflows/publish-atlas.yml:58-71` runs only
`check-secrets` (×2), `check-shape`, and `check-derived` (×2) — six invocations. It does
**not** run `check-image-privacy`, `check-fog-safety`, or `audit-assets`. The
ten-task set in `scripts/atlas/publish-orchestrator.ts:51-62` (which the *local*
`atlas:publish` chain runs) is therefore a **superset** of CI.

This is a latent safety gap **independent of this feature**: today a fogged-area reveal, a
DM-only image, or certain derived leaks could pass CI and deploy to players, because CI
never scans for them. The one-click trust story ("CI is the hard gate") is only honest if
CI actually gates all the families the card promises to block.

**Decision (D3 + D13):** as part of this work, **harden CI to run the full orchestrator
scan set**, so local and CI are guaranteed identical and can never silently diverge again.
Concretely: replace the inline scan steps in `publish-atlas.yml` with a single step that
runs the orchestrator after both builds (e.g. add an npm alias `atlas:scan` →
`tsx scripts/atlas/publish-orchestrator.ts` and call it in CI). Then "a green local check
implies a green CI run" is *true*, and CI is a genuine hard gate for every safety family.

Mirroring CI exactly costs build latency on every check; we accept it (§5.1) so the DM
never publishes "green" locally only to have CI silently block the deploy.

---

## 4. The check pipeline (`POST /__atlas/publish-check`)

### 4.1 Steps (in order)

1. **Acquire the shared build lock** (§3.2). If busy → 423.
2. **Build the player atlas in-process:** `runBuild({ player: true, strict: true })` under
   the endpoint's own timeout race. Regenerates `public/atlas/atlas.json` (+
   `search-index.json`) as the *player-safe* artifact.
   - *Editor-view caveat:* in the steady state (after `predev` / `ensure-dm-atlas` seeds
     `.local-atlas/atlas.json`), the editor reads the DM build via the `serveLocalAtlas`
     middleware (`vite-plugin-atlas-save.ts:922`), so overwriting `public/atlas/atlas.json`
     during a check does **not** disturb the editor. **But** if `.local-atlas/` is absent
     (fresh checkout), `serveLocalAtlas` falls through to serving `public/atlas/atlas.json`
     — the very file the check overwrites — so the editor *would* see the player build
     mid-check. `predev` normally prevents this; the plan should ensure `.local-atlas`
     exists before enabling publish, or note the degraded case.
3. **Build the site:** child-process `npm run build` → `dist/` (player bundle, editor
   tree-shaken via `__INCLUDE_EDITOR__`), under a timeout.
4. **Run the scans in-process** over `dist/` and `public/atlas/` via the structured exports
   (§3.3, §4.2), collecting a structured result per scan.
5. **Compute the player-vs-player diff** (§4.3).
6. **Release the lock**, return `PublishCheckResult`.

If step 2 or 3 fails to build, the verdict is `build-failed` with the truncated error tail
— a distinct state from a safety `blocked` (§2.1 state 5), never conflated with a leak.

### 4.2 The scan set (= the orchestrator set; = CI after D13)

The ten scan tasks from `publish-orchestrator.ts:51-62`, run via their structured exports:

- `check-no-secrets` over `dist/` and `public/atlas/` — `scanDir`. Exit-code cross-check:
  8 = DM content, 9 = editor code, 10 = both.
- `check-derived-secrets` over `dist/` and `public/atlas/` — `scanArtifactForSecrets`.
  (12.)
- `check-image-privacy` over `dist/` and `public/atlas/`.
- `check-fog-safety` over `public/atlas/` and `dist/` — finding codes 13/14/15/16
  (image / geometry / in-fog-content / alpha leak), each a "fogged area revealed" message.
- `check-artifact-shape` over `public/atlas/atlas.json` — `scanArtifactShape`. (11.)
- `audit-assets` over `public/atlas/assets`. (13.)

**Exit codes are illustrative, not the disambiguator.** `13` is returned by
`check-image-privacy`, `audit-assets`, *and* `check-fog-safety` — so the verdict layer keys
the plain-language message on the **scan identity** (which it knows directly, having called
that scan's function), never on the code alone.

Verdict = **`safe` iff every scan reports zero findings**; otherwise `blocked` with one
card row per failing scan.

### 4.3 The player-vs-player diff

The "what's new for players" list must compare **scrubbed-to-scrubbed**, or it shows
DM-only entities as phantom incoming changes:

- **Baseline** = `public/atlas/.last-published.json` (the last *deployed* player atlas; §5.4
  for why checks don't clobber it).
- **Current** = the freshly built `public/atlas/atlas.json` from step 2 (player-safe).
- `diff = computeAtlasDiff(baseline, current)`, computed **server-side** in the endpoint and
  returned in `PublishCheckResult`, so the card just renders it.

This departs from today's `PublishedDiffPanel`, which diffs the baseline against the
editor's *in-memory* (DM) project and computes client-side (D1). To render the precomputed
server-side diff, `PublishedDiffPanel` must gain an optional `diff?: AtlasDiff` prop
(bypassing its self-fetch + client compute), **or** its `DiffSection` presentation must be
extracted into a shared component the readiness card renders. The plan must budget this
refactor (§6).

### 4.4 `PublishCheckResult` shape

```ts
interface PublishScanReason {
  scan: string;          // "check-derived-secrets" | "check-fog-safety" | ... (the disambiguator)
  target: string;        // "dist" | "public/atlas" | "public/atlas/atlas.json"
  severity: "blocking";
  message: string;       // from the static §2.3 template; NEVER copied from scan output
  // Locator availability is scan-dependent (§2.3):
  //   shape  → entityId (and sometimes mapId)
  //   derived → file (= match.source, a content/… path); NEVER match.name
  //   secrets/image/fog → file (built-artifact path) only; no entityId/mapId
  locator?: { entityId?: string; mapId?: string; file?: string };
}

interface PublishCheckResult {
  verdict: "safe" | "blocked" | "build-failed";
  reasons: PublishScanReason[];          // empty when safe
  diff: AtlasDiff;                        // player-vs-player (computeAtlasDiff output)
  builtAt: string;                        // ISO timestamp of this build
  buildError?: string;                    // present only when verdict === "build-failed"
  repoIsPublic: true;                     // drives the §2.4 notice
}
```

---

## 5. The push pipeline (`POST /__atlas/publish-push`)

### 5.1 Guard: green-only, fresh-only

`publish-push` **re-verifies safety before pushing** — it does not trust a client-claimed
verdict. It runs the same build+scan as `publish-check` and **refuses to push unless the
verdict is green** (D10). This makes confirm genuinely safe even if the world changed
between check and confirm.

The cost is a second full build (incl. the child-process site build) under the global lock.
For a DM clicking "Publish now," this must not read as a hang: the Publishing… spinner
carries the sub-label **"Re-checking safety before publishing…"** (§2.1 state 6). If the
check→confirm latency proves annoying, the deferred "fresh-check token" (§9) is the planned
mitigation; we start with the safe double-build.

### 5.2 The scoped commit

Commit scope = **the world's files only** ("only world changes"). Verified pathspec:

- `content/**` — the source notes (Markdown + `atlas:` frontmatter). **This already
  includes the world config**, which lives at `content/<world>/_atlas/world.yaml` (per
  `atlas.config.json` `contentRoot: "content"`), *not* at the repo root. There is **no**
  root `world.yaml` — do not add a bare `world.yaml` term (it would no-op or error
  "pathspec did not match").
- `atlas.config.json` — top-level world configuration (if changed).
- `public/atlas/atlas.json`, `public/atlas/search-index.json`, `public/atlas/assets/**` —
  the built player artifact the site serves. **Explicitly not** the whole `public/atlas`
  directory wholesale, so the local-only baseline (§5.4) is never staged.

Explicitly **excluded**:

- `public/atlas/.last-published.json` — local snapshot baseline, **git-ignored** as of this
  work (§5.4, D14); never committed.
- `dist/`, `dist-ssr/`, `.local-atlas/` — build artifacts / DM build, already git-ignored;
  the explicit pathspec + ignore makes a DM-build leak impossible by construction (§7.2).
- `src/`, `scripts/`, and anything else the DM may have open — code is not the DM's to
  publish and stays out of the commit, leaving any developer WIP untouched (honors "don't
  bundle their WIP"; the DM drives git in parallel via GitHub Desktop).

The commit uses an **explicit pathspec**, never `git add -A`. Exact tracked paths are
re-confirmed against `git ls-files` at plan time. A generated commit message
(e.g. `publish: world update <date>`) is used; the DM is not asked to write one.

### 5.3 The push + auth

`git push origin main` using the machine's existing credentials (GitHub Desktop /
credential manager). No token stored, prompted, or embedded (D6). `main` is required —
it is the branch `publish-atlas.yml` deploys from.

### 5.4 `.last-published.json` is local-only; snapshot *after* a successful push

**Reality (verified):** `public/atlas/.last-published.json` is currently **git-tracked**
(`git ls-files` lists it; not in `.gitignore`). If left tracked, the scoped commit would
stage it, the post-push snapshot would land it one publish late, the working tree would be
left dirty after every publish (which the DM, driving git in parallel, might bundle into an
unrelated commit), and a fresh clone would carry a stale baseline that corrupts the very
"what's new" diff. **Decision (D14):** git-ignore it
(add `public/atlas/.last-published.json` to `.gitignore` + `git rm --cached` it) so it is
genuinely local baseline state, and keep it out of the commit pathspec (§5.2).

**Snapshot timing (D11) — the fix the one-shot CLI doesn't need but the loop does:**
`snapshot-baseline.ts` copies the current `public/atlas/atlas.json` → `.last-published.json`.
In the one-shot `atlas:publish` chain it runs *first* (correct: captures the
about-to-be-overwritten = last-deployed atlas). In an interactive **check → review →
(cancel) → check → confirm** loop, snapshotting on every check would clobber the baseline
with the previous check's build, making the diff read "no changes." So:

- **`publish-check` does NOT snapshot.** It leaves `.last-published.json` as the
  last-deployed baseline; the diff is always "since the last real publish."
- **`publish-push` snapshots only after `git push` succeeds**, copying the just-pushed
  `public/atlas/atlas.json` → `.last-published.json`, so the next edit cycle diffs against
  what was actually shipped.

**Mechanism (verified):** `snapshot-baseline.ts` currently has **no exported function** —
it calls `main()` at module top level (runs on import) with hardcoded paths. It cannot be
imported in-process without firing the copy. **Decision:** refactor it to export
`snapshotBaseline(repoRoot)` and guard the CLI shim with the `isMainModule` pattern
already used by `build-atlas.ts:1098`. `publish-push` calls `snapshotBaseline()` after a
successful push.

### 5.5 Failure fallback — never a raw git error

Git can fail for ordinary reasons: offline, auth needed, branch behind, conflict. The
endpoint returns a typed result and the UI shows:

> **"Couldn't publish automatically — finish in GitHub Desktop"** + a one-line reason
> ("you're offline", "your branch is behind — pull first", "needs sign-in") when
> classifiable.

The local commit (§5.2) is already made at this point, so the DM's work is safely captured;
they finish the push in the tool they already use. We never surface raw `git` stderr (D12).
We do **not** auto-pull / auto-rebase when behind — that is the DM's call in GitHub Desktop.

### 5.6 `PublishPushResult` shape

```ts
type PublishPushResult =
  | { status: "published"; pushedAt: string; commit: string }      // short sha
  | { status: "blocked"; reasons: PublishScanReason[] }            // verdict not green
  | { status: "nothing-to-publish" }                               // no tracked changes in scope
  | { status: "git-failed"; reason: "offline" | "auth" | "behind" | "conflict" | "unknown" };
```

---

## 6. UI components

- **`PublishCheckTab.tsx`** (modify) — gains the action surface: the Publish button across
  the §2.1 states, the readiness card, the public-repo notice, and the confirm flow. The
  existing `validateProject(...)` list stays as **secondary pre-flight notes** — never as
  the green/red safety headline (§7.3). Today its top banner is driven by the validator
  (`PublishCheckTab.tsx:67,84-96`); that banner must be re-toned so only the server verdict
  drives the safety headline.
- **Readiness card** (new, small component) — renders `PublishCheckResult`: verdict banner,
  template-generated reason rows (with go-to-entity/map links *only where a locator exists*,
  §2.3), the player-vs-player diff, the public-repo notice, and the confirm button (shown
  only when `verdict === "safe"`).
- **`PublishedDiffPanel`** (modify) — add an optional `diff?: AtlasDiff` prop so the card
  can pass the server-computed player-vs-player diff (bypassing the panel's self-fetch +
  client `computeAtlasDiff`), **or** extract its `DiffSection` presentation into a shared
  component. (§4.3.)
- **`usePublishFlow`** (new hook) — owns the **full** state machine: idle / checking /
  ready / blocked / build-failed / publishing / published / nothing-to-publish /
  git-failed / busy(423). Calls the two endpoints, holds the button lock. Modeled on the
  existing save flow's request/lock handling.

No change to `railRegistry.tsx` (the Publish item already exists); only the panel changes.

---

## 7. Secrecy & safety

### 7.1 CI is the hard gate — made genuinely complete by this work

The authoritative gate is `publish-atlas.yml`: on every push to `main` it re-builds and
re-scans *before* deploying. **As of D13, CI runs the full orchestrator scan set** (it
previously ran only secrets/shape/derived — missing fog/image/asset, a real gap this work
closes). So CI now gates every safety family the card promises, and **nothing reaches
players without passing CI.** If local and CI ever disagree, CI wins and the deploy is
blocked. The local check is a faithful, now-equal mirror that catches problems earlier.

### 7.2 Invariants (must hold; covered by tests, §8)

1. **No DM content in the player artifact.** Enforced by the existing redaction pipeline
   (`projectEntityForPlayer` / `filterEntitiesForLens` / `stripDmBlocks` / `hideBroken`) in
   the player build this feature triggers — not re-implemented here. Leak-regression test
   required (§8).
2. **The scoped commit can never include `.local-atlas/`, `dist/`, or
   `.last-published.json`.** Explicit pathspec + git-ignore, double-covered.
3. **The verdict never echoes a secret.** Messages come from the §2.3 template; the
   endpoint drops `DerivedScanHit.match.name` and `ShapeViolation.message` before
   composing any reason (§2.3, D8).
4. **No publish code in the player bundle** (§7.4).

### 7.3 No competing "is it safe?" verdicts

`validateProject(...)` stays a *helpful pre-flight* lint. The **server
`PublishCheckResult.verdict` is the only thing that drives the green/red safety headline
and the confirm button.** In the idle and checking states — when no server verdict exists
yet — the card shows a **neutral** prompt ("Run a check to see if it's safe"), and the
in-memory validator is rendered only as clearly-secondary "pre-flight notes," never as a
green "safe to publish" headline. This removes the two-contradictory-banners hazard.

### 7.4 Tree-shake regression guard

Add `"/__atlas/publish-check"` (or a shared `"/__atlas/publish"` prefix) to
`EDITOR_CODE_FINGERPRINTS` in `scripts/check-no-secrets.ts:32`, alongside `"/__atlas/save"`.
Then the very scan this feature runs fails the build if the publish endpoint code ever
leaks into a player bundle — the feature guards itself. (D7.)

---

## 8. Testing

TDD, per the implementation plan. Required coverage:

1. **Verdict mapping** — given a structured `ScanResult` / `DerivedScanResult` /
   `ShapeResult` with a DM-content hit / editor hit / derived hit / shape violation /
   clean, `publish-check` produces the right `verdict` and the right template `reasons[]`,
   keyed on scan identity (not exit code).
2. **No-secret-echo (D8)** — a fixture whose derived secret name and whose
   `ShapeViolation.message` contain a recognizable token; assert that token (and any
   substring of it) appears in **no** `reason.message` and **no** `locator`. Assert derived
   locators carry `match.source`/`match.field` only.
3. **Leak-regression** — a fixture world with a DM-only entity + a `%%dm%%` block builds a
   player atlas in which the scans pass and the secret is absent (guards the redaction
   pipeline through this feature's build path).
4. **Fingerprint** — `EDITOR_CODE_FINGERPRINTS` includes the publish endpoint string; a
   fixture bundle containing `"/__atlas/publish-check"` fails `check-no-secrets` (exit 9).
5. **Scoped commit** — the push pathspec stages only `content` / `atlas.config.json` /
   `public/atlas/atlas.json` / `search-index.json` / `assets`; a dirty `src/` file, a bare
   `world.yaml`, `.local-atlas/`, and `.last-published.json` are **not** staged.
6. **Baseline is local-only** — `.last-published.json` is git-ignored and never appears in
   `git ls-files`; a `publish-check` does not modify it; after a successful push it equals
   the just-built `public/atlas/atlas.json`.
7. **Lock** — a second publish/save while one is in flight gets 423; the DELETE image path
   is *not* blocked.
8. **Git fallback classification** — push failures map to the right `git-failed.reason`
   without leaking raw stderr; `nothing-to-publish` fires when scope is clean.
9. **Player-vs-player diff** — the readiness diff (built-vs-built) does not list a DM-only
   entity as an incoming change.
10. **CI parity (D13)** — a test/assertion that the CI workflow invokes the same scan set
    as the local check (e.g. CI calls the orchestrator), so the two cannot silently diverge.

---

## 9. Sequencing (build order) & out of scope

### Increments (push ships last)

0. **Plumbing prerequisites** — refactor `snapshot-baseline.ts` to export
   `snapshotBaseline()` (+ `isMainModule` shim); hoist `saveInFlight` to a shared
   module-level lock; git-ignore + `git rm --cached` `.last-published.json`; add the
   `atlas:scan` npm alias; harden `publish-atlas.yml` to run the full orchestrator set
   (D13). These are small, independently testable, and unblock the rest.
1. **`publish-check` endpoint + `PublishCheckResult`** — player build (own timeout) +
   child-process site build + structured scans → template verdict, no git.
2. **Readiness card + `usePublishFlow` (check half)** — neutral idle → checking →
   ready/blocked/build-failed, template reasons, player-vs-player diff (PublishedDiffPanel
   prop refactor), public-repo notice. *At this point the DM has a no-terminal "is my world
   safe to publish?" answer — independently valuable.*
3. **Fingerprint + tree-shake guard** (`check-no-secrets`).
4. **`publish-push` endpoint** — green-only re-verify, scoped commit, push, post-push
   `snapshotBaseline()`, typed fallbacks.
5. **Confirm → publish wiring** — the button's Publishing… ("Re-checking safety…") →
   Published ✓ / nothing-to-publish / git-failed half.

Shipping 0–3 first means the safety-check half is usable before the git-push half lands,
and the push — the only irreversible, outward-facing step — is the last thing built and the
most tested.

### Out of scope (explicitly deferred)

- A "fresh-check token" letting `publish-push` skip its re-build (§5.1) — start with the
  safe double-build; optimize if latency annoys.
- Skipping the `dist/` build when no source code changed — a real optimization; start
  faithful-to-CI.
- Auto-pull / auto-rebase when behind (§5.5) — stays a manual GitHub Desktop action.
- A changelog/note prompt on publish (CI `workflow_dispatch` supports one) — not part of
  the one-button flow.
- Publishing from a branch other than `main`.

---

## 10. Decisions

- **D1 — Player-vs-player diff.** Readiness "what's new" diffs the built player atlas vs
  `.last-published.json`, both scrubbed, computed server-side. Never the DM in-memory
  project.
- **D2 — Scans via structured exports; builds split.** Scans call
  `scanDir`/`scanArtifactForSecrets`/`scanArtifactShape`/`auditAssets` (not `run()`) for
  structured results; player atlas builds in-process via `runBuild({player,strict})` with
  the endpoint's own timeout; site build is a child process.
- **D3 — Local check = orchestrator set.** The local check runs the full ten-task
  orchestrator set (a superset of CI's previous six), accepting the latency.
- **D4 — One hoisted shared build lock.** `saveInFlight` is hoisted to a module-level mutex
  consulted by save + both publish endpoints; overlap → 423; the image-picker DELETE path
  stays unlocked.
- **D5 — Reuse `isAllowedDevRequest`.** Loopback-only, no new access logic.
- **D6 — No stored credentials.** Use the machine's existing git login; never store/prompt
  for a token.
- **D7 — Editor-only + self-guarding.** Endpoints are `apply:"serve"` and absent from
  player builds; the publish endpoint string is added to `EDITOR_CODE_FINGERPRINTS`.
- **D8 — Verdict never echoes secrets.** Messages come from the static §2.3 template; the
  endpoint drops `match.name` and `ShapeViolation.message`; derived locators use
  `match.source`/`match.field` only.
- **D9 — Public-repo notice every check.** Persistent informational line; not a blocker.
- **D10 — Push re-verifies green.** `publish-push` rebuilds + rescans and refuses unless
  green; never trusts a client-supplied verdict.
- **D11 — Snapshot after push, not before.** Baseline = last *deployed* player atlas;
  checks don't move it; a successful push does, via `snapshotBaseline()`.
- **D12 — Plain-language git fallback.** Classify failures into offline/auth/behind/
  conflict/unknown; never surface raw stderr; the local commit is preserved.
- **D13 — Harden CI to the full scan set.** `publish-atlas.yml` runs the orchestrator so CI
  gates every safety family (closing the pre-existing fog/image/asset gap) and equals the
  local check.
- **D14 — `.last-published.json` is local-only.** Git-ignored + `git rm --cached`; kept out
  of the commit pathspec; genuinely local baseline state.

---

## 11. Open questions

None blocking. All six brief questions are resolved: button behavior = D3/D10
(check→confirm→push); commit scope = §5.2; public repo = D9; auth = D6; branch = `main`
(§5.3); failure handling = D12. The adversarial review (2026-06-16) surfaced one finding
worth the DM's attention beyond the feature itself: **CI did not previously scan for fog /
image / derived-asset leaks** — D13 closes that gap as part of this work.
