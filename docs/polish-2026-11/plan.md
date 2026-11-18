# Polish round, November 2026

Isak's ask: "further develop the app, make it look better, feel better, maybe more responsive or
more juicy". This is the ranked plan. Progress: `progress.md` beside this file.

## Ground rules

- **Only what survives the rebuild.** Phases 1-3 are merged; phase 4 (the new editor) waits on
  ADR-0005 and ADR-0006, which are not written yet. Polish goes to the shared canvas
  (`src/atlas/canvas/`), the breadcrumb, the sea, calm mode, the toasts, the loading screen and
  `index.css`. Not touched: the old editor, the v1 map container (deleted in phase 7), the place
  panel, Browse, Timeline, Credits and the pin and region layers (reworked in phase 5).
- **The live site still runs v1.** Canvas work shows only on the local test sites
  (`npm run atlas:publish:next`, then `npm run atlas:serve:next`, picker on
  `http://127.0.0.1:4300/`). Items marked "live" also change the published site.
- **No sounds.** Nothing here adds an audio cue. Haptics only as an opt-in setting (none planned).
- **Motion follows calm mode.** Every new animation is off under `useReduceMotion` / `data-calm`
  (calm mode is the one reduce-motion switch, OR'd with the OS setting).
- **Player safety stands.** No item reads a field the player output doesn't already ship; the
  canvas keeps importing nothing from the editor (`canvas-imports.test.ts`). A change near
  visibility gets a test and an adversarial review.
- **Maps stay lossless.** No blurred or lossy stand-in pictures; loading states are drawn in CSS.
- One PR per item, the full gate, a clean Opus review, a before and after screenshot in
  `shots/`.

## What the audit found (2026-11-18)

Two playtests (live v1 site and the local v2 sites, desktop and 375 px phone) plus a code read.
Notes and screenshots: `previews/audit-live/` and `previews/audit-v2/` in the `polish-plan`
worktree (gitignored).

- The zoom handoff is a hard cut: one frame shows Quessaly, the next shows Oskmark about a third
  the size, floating in sea. No fade; the child's picture does not land where its outline was.
- Zooming toward a child near the screen edge can stop at the zoom limit without ever entering it.
- On the ocean the maps touch the screen edges and run under the side panel (R-37).
- On a phone the top bar is 137 px in three rows (R-38); the sound invite, the "update available"
  toast and the map hint cover the minimap, Wander and calm button, and show through the menu and
  search (R-39).
- The wheel needs about 10 notches per level on the canvas; a crumb click jumps with no movement.
- Frames answer a hover with an instant outline change; map names use a plain sans font while the
  rest of the app uses Cinzel.
- First load is a bare "Loading atlas..." line. A map picture pops in with no fade. Inter is
  downloaded and never used; `--font-display` is never defined.
- Already good, keep: the animated sea, Cinzel gold headings on dark, the pin hover card, search
  highlighting, the camera kept in the URL.

## Round 1, in build order

Two tracks so two builders never share a file: **canvas** (P-02, P-04, P-05, P-06, P-07, one
after another) and **chrome** (P-01, P-03, P-08).

| #    | Item                                     | What changes                                                                                                                                                                                                           | Why it helps                                                                                  | Size | Risk                                                                                                                        | Where it shows |
| ---- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------- | -------------- |
| P-01 | Overlays stop piling up (folds in R-39)  | The sound invite, the update toast and the map hint get one tidy stack that never covers the minimap, Wander or calm button, sits under the menu and search scrims, and the update toast gets a proper width on phones | The worst first impression on a phone today, on the live site                                 | S-M  | Low. CSS and placement only; sound logic untouched                                                                          | live + v2      |
| P-02 | The ocean fit gets a margin (R-37)       | Every top-level map shows whole, with sea around it, clear of the side panel                                                                                                                                           | The first view of the world looks composed, not cropped                                       | S    | Low. Check the zoom-out floor (R-36) and "a fit never hands off"                                                            | v2             |
| P-03 | Phone top bar in one row (R-38)          | Breadcrumb and search share one bar; the rest moves into the menu                                                                                                                                                      | Gives the map back about 80 px of a phone screen                                              | S    | Low-medium. Toolbar is shared with v1; v1 must look as today                                                                | v2             |
| P-04 | The handoff always fires (folds in R-40) | A fling ending mid-zoom no longer cancels the handoff; zooming into a child at the zoom limit enters it                                                                                                                | Zooming in never dead-ends                                                                    | S-M  | Medium. Handoff rules (R-32) are subtle; tests on the fake map                                                              | v2             |
| P-05 | A soft handoff                           | The child map's picture lands where its outline was on screen, and the old and new pictures crossfade (about 250 ms; a plain cut in calm mode)                                                                         | Turns the app's signature move from a jump into one continuous zoom. The biggest "juice" item | M    | Medium-high. Camera maths; touches the provisional "enter zoom" rule (ADR-0003 addendum), so the rule is written down again | v2             |
| P-06 | Zoom and crumb feel                      | Tune the wheel so a level takes about 4-5 notches; a crumb click and the Reset button glide to their camera (jump in calm mode)                                                                                        | Faster to get around, and movement shows where you went                                       | S    | Low. Numbers only; must not let one notch cross two handoffs                                                                | v2             |
| P-07 | Frames and pictures that respond         | Frame outlines ease on hover, show a pressed state on tap, labels move to the display font; a map picture fades in when decoded, over a drawn "chart paper" placeholder                                                | Feedback on every touch; no pop-in                                                            | S-M  | Low. No lossy stand-ins                                                                                                     | v2             |
| P-08 | First load and fonts                     | A drawn loading screen (compass and title) instead of a bare line; define `--font-display`; stop downloading the unused Inter                                                                                          | The first second looks like the atlas; one request fewer                                      | S    | Low                                                                                                                         | live + v2      |

Done for round 1: these eight merged and published, each with a before and after in `shots/`.

## Round 2, candidates (not started)

| Item                                                                             | Why not now                                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A map reveal moment the first time a player enters a map (ink-in or fog lifting) | Wants P-05 and P-07 first; a taste call, show Isak a mock first                             |
| Phone: a landscape map sits as a thin strip in a portrait screen                 | Needs a design choice (fill and pan, or rotate hint)                                        |
| Sea seams on phones, harsh teal hover on the menu button                         | Small; next round                                                                           |
| The local picker page looks unrelated to the atlas                               | Test-only page                                                                              |
| Timeline empty state speaks to the DM; search "No matches." is bare              | Phase 5 reworks those pages                                                                 |
| Place panel: doubled close icon on phones, no motion on open, hard line breaks   | Phase 5 rewrites the panel as the story panel                                               |
| Browse and Timeline headers crushed at 375 px                                    | Phase 5                                                                                     |
| Live map pictures: six 3 MB PNGs fetched at once (19 MB)                         | The v1 loader is deleted in phase 7 and the sample world is being replaced; see "Questions" |

## Questions for Isak (batched, none blocks round 1)

1. **Map names in the display font (P-07).** Recommendation: yes, Cinzel small caps like the
   headings. A small look change on the canvas only; before and after will be in `shots/`.
2. **The live site's 19 MB of map pictures.** Recommendation: leave it; the sample world goes away
   with Tidemarrow. Alternative: run `npm run maps:optimize` on `content/` now (lossless WebP,
   changes content files).
3. **A map reveal moment** (round 2). Recommendation: yes, after a mock.
