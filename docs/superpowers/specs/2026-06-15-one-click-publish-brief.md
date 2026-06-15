# Brief — One-click Publish from the editor (B-pub)

**Date:** 2026-06-15
**Status:** Design-session brief — NOT a queued auto-build unit. Needs a human design session.
**Recommended model:** Opus (touches the build pipeline, a new dev-server endpoint, git automation, and the player-secrecy invariants — all "escalate to Opus" triggers).
**Estimated session:** 60–90 minutes.
**Depends on:** nothing hard. Pairs naturally with the honest-player-preview WANT
(`2026-06-14-honest-player-preview-design.md`) — see "Relationship to the honest preview" below.

> This is the #2 lead-goal item and the best fit for the "sleek / hide-the-internals" preference.
> It is a BRIEF, not a spec: the shape has a real fork (how much of git to automate) that a human
> should decide before anyone writes code.

## The problem, in plain language

Today, getting your changes in front of your players is a two-step chore that lives outside the
atlas:

1. You make edits in the Creator Cockpit and hit **Save**. That writes your files and rebuilds the
   *local* atlas — but only on your machine. Your players see nothing yet.
2. To actually publish, you either run a terminal command (`npm run atlas:publish`) and/or switch to
   GitHub Desktop and push. The push is what reaches players: a GitHub Action rebuilds the
   player-safe site and deploys it to the public web.

So "Save" and "the players can see it" are different things, and the gap between them is a terminal
and a second app. For a DM who is not a developer, that gap is exactly the kind of internal plumbing
we keep saying we want to hide. The wish is one button in the editor labelled **Publish** that does
the whole thing and ends with a plain-language **"Your players can see it now."**

### Why it matters

- **It's the last manual, developer-shaped step in the workflow.** Everything else (edit, save,
  preview) already lives in the app. Publishing is the one place the DM still has to "be a developer."
- **The current path is easy to get half-wrong.** Saving feels like publishing but isn't. A DM can
  reasonably believe their players are seeing the latest world when the push never happened.
- **It is the natural home for the safety story.** A Publish button is the right moment to *prove*
  no DM-only content is about to go public — the scans already exist, they're just buried in a
  terminal command today.

## What actually happens when you publish today (grounded in the real code)

This is the load-bearing fact for the whole design, so it's worth stating precisely:

- **`npm run atlas:publish`** (`package.json`) chains four things locally:
  `atlas:snapshot` → `atlas:build:player` (strict player atlas → `public/atlas/`) → `npm run build`
  (player-safe Vite build → `dist/`) → `scripts/atlas/publish-orchestrator.ts`, which runs **all the
  safety scans in parallel** (secrets, derived-secrets, image-privacy, fog-safety, artifact-shape,
  asset-audit) against both `dist/` and `public/atlas/` and exits non-zero if any scan finds a leak.
- **But `atlas:publish` does NOT push.** Reaching players is a separate **`git push` to `main`**,
  which triggers `.github/workflows/publish-atlas.yml`. That workflow **re-runs the strict player
  build and the secret/derived/shape scans server-side**, then deploys `dist/` to GitHub Pages. The
  CI scans — not the local ones — are the authoritative gate on what goes public.

So there are really *two* safety nets: the local pre-flight scans (fast feedback for the DM) and the
CI scans (the true gate before deploy). A good Publish button uses the local scans to **fail fast and
explain**, and relies on CI as the backstop. The local Save endpoint already proves the pattern: the
dev-only Vite plugin (`scripts/vite-plugin-atlas-save.ts`) writes files and optionally rebuilds the
atlas in-process via `runBuild()`, surfacing `rebuilt` / `publishedAt` / `rebuildError` back to the
editor toast (`src/atlas/save/localFsSave.ts`). A Publish endpoint is the same shape, one step bigger.

## Design options

### Option A — One button does everything: build + scan + push

The Publish button calls a new dev-only endpoint (say `POST /__atlas/publish`) that runs the
equivalent of `atlas:publish` and then performs the `git push` to `main` (or to a publish branch).
On success the toast reads "Your players can see it now — live in a couple of minutes."

- **Pro:** The truest realization of the one-button wish. Nothing leaves the app.
- **Con:** The endpoint now shells out to **git** from the dev server. That is a meaningfully larger
  blast radius than the current Save endpoint, which only ever writes allowlisted files under
  `content/`. A push commits and publishes *whatever is in the working tree*, which on the DM's
  machine may include unrelated WIP, a half-finished entity, or (per the README privacy note) DM-only
  source files if the repo is public. The DM "drives git in parallel via GitHub Desktop"
  (project memory) — auto-committing from the app can collide with their own staged work.
- **Con:** Auth/remote/branch state is now the app's problem (no remote, auth prompt, diverged
  branch, merge conflict). These are real git failure modes the sleek single button must absorb.

### Option B — Button builds + scans locally; the DM pushes in GitHub Desktop

The Publish button runs build + all scans locally and reports a clear verdict
("Ready to publish — 0 problems found. Push in GitHub Desktop to go live"), but stops short of the
push. The DM keeps using GitHub Desktop for the git step they already know.

- **Pro:** Smallest, safest change. No git automation in the dev server at all — the endpoint stays a
  read/build/scan operation, barely past what Save already does. Respects the DM's existing
  parallel-git habit instead of fighting it.
- **Pro:** It already moves the *safety verdict* into the app, which is most of the value: the DM
  learns "is it safe and will it deploy?" without a terminal.
- **Con:** Not actually one button — it's "one button, then go to the other app." Falls short of the
  "your players can see it now" promise; the DM still owns the step that reaches players.

### Option C (recommended) — Staged: readiness check → confirm → push

Two-phase, single control. **Phase 1 (automatic on click):** run build + all scans and present a
plain-language **readiness card** — what changed since last publish (the `.last-published.json`
snapshot already exists for exactly this), and a green/red safety verdict. **Phase 2 (one
confirmation):** if green, a single **"Publish to players"** confirm performs the push; if red, the
button is blocked and the card explains the leak in DM language with a "Fix and re-check" affordance.

- **Pro:** Keeps the full one-button outcome of Option A, but the DM *sees and confirms what is about
  to go public before any push happens* — which is exactly right for the one operation that can leak
  secrets. The confirm step is also the natural place to scope the commit (publish only atlas/content
  changes, not unrelated WIP).
- **Pro:** Degrades to Option B for free: if git automation is unavailable or the push fails, the
  readiness card stands on its own and the DM can finish in GitHub Desktop. So we never have a
  dead-end.
- **Con:** Slightly more UI than a bare button (a confirm card). But that card *is* the safety and
  trust surface; it earns its place.

**Recommendation: Option C.** It delivers the real wish (changes reach players from inside the app),
but treats the push — the irreversible, public, potentially-leaky step — as a confirmed action with a
human-readable preview, not a silent side effect. It also has a built-in fallback to Option B, so a
git hiccup never blocks the DM. Start with the readiness-card + safety verdict (high value, low risk),
and make the actual push the last increment to land.

## How to keep it sleek (progress + errors in one control)

- **One button, three states it animates through:** *Checking…* (building + scanning) → *Ready —
  review* (readiness card) → *Publishing…* (push) → *Live ✓ — your players can see it now*. Reuse the
  existing Save toast/session machinery (`session.markSaving()` and the `publishedAt` toast pattern in
  `AtlasPlacementEditor.tsx`); this is the same vocabulary the DM already sees on Save.
- **Never surface raw scan output or git stderr.** Translate. A secrets-scan failure becomes
  "One of your secret notes would have been visible to players — publishing blocked," with the entity
  name, not a file path and exit code 8.
- **In-flight lock, like Save.** The Save endpoint already rejects concurrent saves with 423 Locked;
  Publish needs the same single-flight guard so a double-click can't start two pushes.

## What happens when a safety scan fails (non-negotiable)

Publish **must block on any scan failure** and must never push. The orchestrator already exits
non-zero on the first failing scan; the endpoint reports that, and the button goes to a blocked-red
state with a plain-language reason drawn from which scan failed:

- secrets / derived-secrets → "A DM-only note (or its name) would have reached players."
- image-privacy → "An image still carries location/metadata you didn't mean to share."
- fog-safety / artifact-shape → "The map reveal or data shape isn't player-safe yet."

The DM fixes the source and re-checks; nothing is published until green. Even if a local scan were
somehow bypassed, the **CI scans in `publish-atlas.yml` are the backstop** — a leak that slips the
local check still fails the deploy. The brief's stance: local scans are for fast, friendly feedback;
CI is the wall. Both must stay.

## Relationship to the honest preview (build on it, don't duplicate)

The honest-player-preview WANT (`2026-06-14-honest-player-preview-design.md`) makes "Player view" in
the editor a *faithful* render of what players will see — content redacted via
`projectEntityForPlayer()`, DM entities filtered out, with an "as players see it" indicator. That is
the **subjective** safety check (the DM eyeballs it). One-click Publish is the **objective** safety
check (the scans prove it). They are complements: the ideal flow is *preview honestly → publish with a
proven-clean scan*. The readiness card in Option C is the natural place to link the two ("Preview
exactly what players will see" right next to "Publish to players"). Do not rebuild redaction here —
Publish relies on the *build pipeline's* strip, which the scans then verify.

## Surfaces / files it would touch (verified against the real code)

- `scripts/vite-plugin-atlas-save.ts` — the dev-only (`apply: "serve"`) plugin that already serves
  `/__atlas/*`. A new `POST /__atlas/publish` middleware lives here, reusing `isAllowedDevRequest`
  (loopback + Origin gating) and the in-flight-lock pattern.
- `scripts/atlas/publish-orchestrator.ts` — the CLI entry-point for the scan pipeline. It does NOT
  export its own functions; it imports `run()` from the individual scan modules
  (`check-no-secrets`, `check-derived-secrets`, `check-image-privacy`, `check-fog-safety`,
  `check-artifact-shape`, `audit-assets`). The endpoint should import those same scan modules
  in-process rather than shelling out to the orchestrator, mirroring how Save calls `runBuild()`.
- `package.json` — the `atlas:publish` script chain is the reference behavior the endpoint reproduces
  (snapshot → player build → site build → scans). A push step is the new piece beyond it.
  **Build-pipeline gate (required):** because this feature changes the scan/publish pipeline, the
  implementing session must run `npm run atlas:publish:integrity-smoke` and `npm run atlas:publish`
  against the final build before declaring the work done.
- `src/pages/AtlasPlacementEditor.tsx` — where the Publish button/readiness card lives, alongside the
  existing Save button and the `publishedAt`/rebuild toast plumbing.
- `src/atlas/save/localFsSave.ts` — the browser-side caller pattern (typed result, error classes,
  `SaveBusyError` for 423) to mirror for a `publishAtlas()` client.
- `vite.config.ts` (`__INCLUDE_EDITOR__` define) **and** `scripts/check-no-secrets.ts` — **secrecy
  pinch point.** The endpoint and any client string like `/__atlas/publish` MUST be tree-shaken from
  player builds the same way `/__atlas/save` is. Note `check-no-secrets.ts`'s
  `EDITOR_CODE_FINGERPRINTS` already lists `/__atlas/save`; a publish fingerprint should be added so
  the scan catches a tree-shake regression that leaks the publish path into a player bundle.
- `.github/workflows/publish-atlas.yml` — the push target. The endpoint's push must land on a branch
  this workflow watches (`main`) for the deploy to actually fire. No change required to the workflow
  for Options B/C; the brief just notes it is the real publishing mechanism.
- `public/atlas/.last-published.json` (written by `scripts/atlas/snapshot-baseline.ts`) — the existing
  "since last publish" baseline the readiness card can diff against.

## Risks (especially secrecy and the DM's own files)

- **The publish endpoint is editor-only and must NEVER exist in the player build.** Same invariant as
  Save. Gate via `apply: "serve"` + `__INCLUDE_EDITOR__`, and add a publish fingerprint to the
  editor-leak scan so a regression is caught automatically.
- **Publish must run the secret/derived (and the rest) scans and BLOCK on failure**, surfacing the
  reason in plain language. This is the core safety contract.
- **Git automation can touch the DM's own working tree.** The DM uses GitHub Desktop in parallel; an
  auto-commit/push could sweep up unrelated WIP or, on a public repo, push DM-only *source* files
  (the player-build scans protect the published artifact, not the repo — see README "Where do your
  secrets live?"). Whatever Option C commits must be **scoped to atlas/content changes**, and the
  confirm card must show what's being published.
- **Git failure modes are now UX:** no remote, auth required, diverged/behind `main`, merge conflict,
  detached HEAD in a worktree. The single button must absorb these into one friendly state, with the
  Option B fallback ("finish in GitHub Desktop") as the escape hatch — never a raw git error.
- **"Published" is asynchronous.** The push returns fast, but Pages takes a minute or two to go live.
  The toast must not over-promise "live now" the instant the push returns; "publishing — live in a
  couple of minutes" is honest.

## Open questions for the human

1. **How much git to automate?** Option A (silent push), B (DM pushes in Desktop), or C (confirm-then-
   push)? The recommendation is C; confirm that, and confirm whether Phase 2 (the actual push) ships
   in v1 or is a fast-follow after the readiness card.
2. **Commit scoping.** If we push, do we commit *only* the atlas/content changes from this session, or
   the whole working tree? Given the parallel-GitHub-Desktop habit, scoped is safer — but defining
   "the atlas changes" precisely is a real decision.
3. **Which branch?** Push straight to `main` (what the workflow watches), or to a publish branch the
   DM merges? Direct-to-`main` is simplest and matches today; a branch adds a safety step but
   reintroduces a manual merge.
4. **Auth model.** Rely on the DM's existing git credential helper / GitHub Desktop login, or have the
   app manage a token? (Strong prior: no PAT in the app — the Save endpoint deliberately has "no
   GitHub API, no PAT, no auth.")
5. **Public vs private source repo.** Should Publish warn (or refuse) if it detects the repo is public
   and DM-only source files exist? This is the one leak the artifact scans *cannot* catch.
6. **Local-only mode.** Some DMs may never want auto-push. Is "build + scan + verdict, I'll push
   myself" (Option B) a permanent setting, or only the v1 stepping stone to Option C?
