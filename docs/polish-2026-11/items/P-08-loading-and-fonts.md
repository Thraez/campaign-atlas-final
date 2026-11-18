# P-08 First load and fonts

Status: built, awaiting review and gate
Branch: `polish-p08-loading-and-fonts`
Plan: `docs/polish-2026-11/plan.md`, P-08. Shows on the live site (v1) and v2.

## What

The first second of the atlas was a bare "Loading atlas..." line on black. Inter was downloaded
with Cinzel and never used (the body has always rendered the Avenir Next / Segoe UI / system
stack). `--font-display` was used in `src/index.css` but never defined, so the reading panel's
headings (`.atlas-prose h1`-`h6`) fell back to the browser's default serif
instead of the app's Cinzel.

## Acceptance criteria

- Every loading state on the first load path shows one drawn screen: a compass, the atlas title in
  the display font, and a `role="status"` line such as "Loading atlas…".
- Gentle motion only, and none under calm mode or the OS reduced-motion setting.
- No new image files or network requests; Inter is no longer requested.
- `--font-display` is defined and every use resolves to Cinzel; body text looks the same.

## What was done

- **Loader** (`src/atlas/content/AtlasLoader.tsx`): an inline SVG compass in the primary gold
  (two rings, four cardinal ticks, a faint four-point rose, a gold-and-grey needle), the site title
  in Cinzel gold (`text-2xl`), and a muted "Loading atlas…" `role="status"` line, centred on
  `bg-background`. Used by `App.tsx`'s Suspense fallback (`RouteFallback`, was "Loading…") and by
  `AtlasLoadState`'s loading branch (viewer, timeline, browse, credits, secrets; its default label
  is now "Loading atlas…", was "Loading…", so browse, credits and secrets say the same as the
  fallback and screen readers don't hear a second, different status), so the route
  chunk's fallback and the page's data wait are the same picture.
- **Title** comes from `document.title`, which the build already sets per campaign
  (`brandIndexHtml`); the loader shows nothing the player site doesn't ship. Falls back to "Atlas".
- **Motion:** a 600 ms fade-in and a ±7° needle sway on a 3.6 s cycle. The fade runs once from
  mount, on the first loader of the page load only: a module-level flag (`atlasLoaderShown.ts`) skips it when the Suspense
  fallback hands over to the page's loader, so it doesn't fade twice. The sway runs on the page
  clock (negative `animation-delay` from `performance.now()`), so the needle carries on across
  that remount instead of restarting.
  `useReduceMotion()` (calm mode OR the OS setting) leaves both classes out; the
  `prefers-reduced-motion` and `:root[data-calm]` blocks in `src/index.css` also switch them off.
  Calm mode reaches the document before React renders (`syncCalmModeToDocument()` in `main.tsx`).
- **Fonts:** `--font-display: "Cinzel", Georgia, serif` and `--font-body: "Avenir Next", "Segoe
  UI", system-ui, sans-serif` in `:root` (`src/index.css`). `body` and the base `h1`-`h4` rule use
  `var(--font-body)` (same stack as before); Tailwind's `font-display` and `font-body` now point at
  the two variables. The `var(--font-display, serif)` fallbacks became plain `var(--font-display)`.
- **Inter removed** from the Google Fonts link in `index.html` (Cinzel 500/600/700 stays). Nothing
  in `src/`, `tailwind.config.ts` or `index.html` names Inter any more.
- Test: `src/test/atlas/AtlasLoader.test.tsx` (status role and label, title from the page, no
  motion classes under calm mode or the OS setting).

## Provisional calls

- **No pre-React placeholder in `index.html`.** The campaign-site identity check
  (`siteIdentityFindings` in `scripts/atlas/campaignSiteBranding.ts`) allows no page text, no
  `<style>`, no inline SVG and only `<div id="root">` in a built `index.html`, so a static drawing
  there would fail the isolation scan. The gap before React's first paint stays the dark
  `theme-color` page, as before; the loader appears with the first JS frame.
- **Visible change in the reading panel:** `.atlas-prose` headings now render in Cinzel (they were
  in the browser's default serif because the variable was undefined). That is what the old code
  asked for; flag it if the plain serif was preferred.
- RouteFallback now says "Loading atlas…" on every route (was "Loading…"); the timeline still
  swaps to "Loading timeline…" once its own page loads.

## Not verified

- Only shot with `atlas.json` held open in Chromium; not checked on Safari/iOS, where the first
  paint before the JS runs may look slightly different.
- Not checked on the live v1 site after publishing (shows after merge).
- The phase lock across the fallback-to-page handover was reasoned, not filmed.
- Checked in the built v2 site (Chromium): the sway runs normally and the needle has no animation under the OS setting or with calm mode saved; only Cinzel is requested from Google Fonts; the publish isolation scans pass with the new font link.

## Shots

`shots/p08-before-desktop.jpg`, `shots/p08-before-phone.jpg` (baseline v2, port 4301) and
`shots/p08-after-desktop.jpg`, `shots/p08-after-phone.jpg` (this branch, `atlas:serve:next` on
port 4310), each with `atlas.json` never answering so the loader holds.
