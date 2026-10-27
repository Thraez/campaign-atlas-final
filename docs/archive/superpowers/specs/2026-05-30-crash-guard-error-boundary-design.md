# Crash guard + app-wide error boundary — design

**Date:** 2026-05-30
**Status:** blessed → queued as WANT **D1** (`docs/automation/continuous-dev-queue.md`)
**Origin:** live dogfooding pass, 2026-05-30 (item #1 in `docs/DEVELOPMENT_WANTS.md`)
**Backs queue unit:** D1

## The problem

In the player viewer (`/atlas`), selecting an entry that has **no map location** — e.g. an **Event** —
white-screens the *entire* app. The page goes blank (confirmed: `document.body` empty, an uncaught error
in the console). There is **no React error boundary anywhere in `src/`**, so a single component throw
takes down the whole site. To a player that looks completely broken, with no way back.

This spec has two goals, in priority order:

1. **Containment (the guaranteed fix):** no single component error may ever blank the whole app again.
   A graceful, player-safe fallback must appear instead.
2. **Root cause (the specific fix):** opening a location-less entity must just show its lore — no crash,
   no attempted map move.

## Root-cause analysis — read before assuming

The obvious suspect (a map "fly to" with bad coordinates) is **already guarded** and is probably *not*
the cause — do not stop at it:

- `MapController` (`src/pages/AtlasViewer.tsx` ~line 45) only calls `map.flyTo(...)` when `flyTo` is set.
- Every `setFlyTarget(...)` call site is guarded by `if (placement)` / `if (m)` (AtlasViewer ~lines 156,
  188, 411, 446), so a location-less entity never sets a fly target.
- `EntityPanel` already guards `placements.length > 0` (`src/atlas/entity/EntityPanel.tsx` ~line 307), so
  the empty-placements render path is not the obvious culprit either.

So the exact throw is **unconfirmed**. Do not hard-code a fix to a guessed line. Instead **reproduce it
with a test** (below) and fix whatever that surfaces. Likely areas to investigate once the test is
failing: the search-result → `openEntity` selection path for an entity with no placement; any
date/timeline rendering specific to Events; and the computation of the open entity's placement list
passed to `EntityPanel`.

## The fix

### Part A — App-wide error boundary (required; deterministic)

Add a reusable React error boundary and wrap the routed app in it.

- New `src/components/ErrorBoundary.tsx`: a small class component implementing
  `static getDerivedStateFromError()` + `componentDidCatch()`. On error it renders a calm, **player-safe**
  fallback — no stack traces, no DM/internal details. Suggested copy: a short heading ("Something went
  wrong displaying this"), one line of reassurance, and two actions: a **Reload** button
  (`window.location.reload()`) and a **Back to the atlas** link (to `/atlas`). Style with the existing
  design tokens (match `RouteFallback` in `src/App.tsx`).
- Wrap `<Routes>` in `src/App.tsx` with `<ErrorBoundary>` so any route's render error is contained.
- Recommended (not required): also place a *finer* boundary around the entity panel / map subtree in
  `AtlasViewer` so a panel-level error keeps the rest of the app (toolbar, navigation) usable instead of
  replacing the whole view. Keep this simple; the top-level boundary is the must-have.

This part alone resolves the user-visible catastrophe and is pure code (no browser repro needed).

### Part B — Defensive coordinate guard (required; cheap)

In `MapController` (`src/pages/AtlasViewer.tsx`), bail out if the target coordinates are not finite:
`if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;` before `map.flyTo(...)`. Even though current
call sites are guarded, this future-proofs against any new caller passing a bad target.

### Part C — Root-cause fix, driven by a regression test (required)

Add a **headless** regression test that reproduces the original crash, then fix the source until it passes:

- The test renders the viewer (or the smallest subtree that reproduces) with a fixture atlas containing a
  **location-less Event** entity, simulates **selecting** it (via the search palette or the `openEntity`
  path), and asserts: (1) it does **not** throw, and (2) the entity's title/lore renders.
- Follow the existing test patterns under `src/test/` for mocking `loadAtlasContent` / `loadSearchIndex`
  and for any leaflet/jsdom setup already in use. Reuse existing fixtures where possible.

**Autonomy guard (important):** Leaflet in jsdom can be awkward to mount. If rendering the full
`AtlasViewer` is blocked by leaflet/jsdom, do **not** get stuck — instead (a) keep the deterministic
deliverables (ErrorBoundary + its unit test, Part B), and (b) isolate the actual throwing component once
identified and write the regression test against *that* component directly. Document any residual (e.g.
"full-viewer render not testable under jsdom; covered the throwing component in isolation") in the run
handover.

## Testing

- **ErrorBoundary unit test (deterministic, required):** render `<ErrorBoundary><Boom/></ErrorBoundary>`
  where `<Boom/>` throws on render; assert the fallback UI is shown (e.g. the Reload affordance is present)
  and that the thrown error did not propagate. This proves "a child crash no longer blanks the tree."
- **Regression test (required, per Part C):** opening a location-less entity does not crash and shows its
  lore — or the documented isolated-component equivalent.
- Full gate: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` all green.

## Acceptance criteria

- `src/components/ErrorBoundary.tsx` exists and wraps `<Routes>` in `src/App.tsx`.
- A child that throws renders the fallback (proven by the unit test), never a blank screen.
- `MapController` ignores non-finite coordinates.
- A regression test covers opening a location-less entity without crashing (or the documented
  isolated-component equivalent).
- The fallback copy contains **no** DM or internal content; the player build is unaffected
  (`ErrorBoundary` must not pull in any editor-gated module).
- Full gate green.

## Out of scope

Redesigning `EntityPanel`; map performance; reporting errors to any external service; styling beyond a
clean, on-brand fallback. Keep the change to containment + the one specific crash.
