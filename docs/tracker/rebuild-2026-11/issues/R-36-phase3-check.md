# R-36 Phase 3 check: Ocean > continent > city > back

Status: in-review
Blocked by: R-35
Size: S
Branch: `rebuild-r36-phase3-check`
Model: Sonnet (playtester walk, then small fixes; anything bigger becomes a ticket)

Phase 3's verify line (`State.md`, Rebuild queue): "Ocean > continent > city > back on the local
test world". This is the safe stop after phase 3: the viewer shows the ocean and map tree on the
test world, and nothing half-built is live.

## Acceptance criteria

- `npm run atlas:publish:next`, then `npm run atlas:serve:next` (R-34); the `playtester` agent walks
  both campaigns' sites on desktop and at 375 px:
  - `main`: picker > Lantern Road > ocean > `quessaly-world` > `oskmark` > `brindlecross` by zoom,
    back out to the ocean by zoom, then the same by clicks and by the breadcrumb; browser Back steps
    through the handoffs.
  - `sandbox`: no `skerrow-isles` on the ocean, no frame for `tallowford`, `brindlecross` or
    `mirefold`; `oskmark` shows its baked fog.
  - A wrong-campaign link and a hidden-map link show "Not found in this campaign" (R-35).
  - The live v1 site (`atlas-pages-preview`) looks as R-33's recorded baseline.
- Bugs found are fixed here if small (one module, under about 50 lines); others become tickets
  in this folder.
- The notes and up to six screenshots are saved in the ticket's `## Check` section (screenshots in
  `previews/`, gitignored, paths only).
- `State.md` lists for Isak's look: the ocean, the zoom handoff feel, the breadcrumb, the phone top
  bar, and the provisional calls of R-30..R-35; and that Browse, Timeline, Credits and the nav
  still read `worlds[0]` on v2 until phase 5.
- `npm run gate` passes, and `atlas:publish:next` scans pass on both campaigns.

## Out of scope

Phase 4 (blocked on ADR-0005 and ADR-0006, which Isak accepts).

## Check (2026-11-11)

Playtester walk (Sonnet, playwright-cli) on `atlas:publish:next` + `atlas:serve:next`, desktop
1280x800 and 375x812. Notes: `previews/r36/notes.md`. Publish scans: all 44 clean.

| Step | Result | Friction |
|---|---|---|
| 1 `main` by zoom: Ocean > Quessaly > Oskmark > Brindlecross and back | pass | Ocean had no zoom-out limit (cz -5.7, frames a few pixels, labels overlapped): fixed here, see below. At -300 wheel steps one tick can jump Ocean > Oskmark in one gesture (the thresholds chain, by design in R-32). |
| 2 `main` by clicks and by breadcrumb | pass | The Ocean crumb returns to the fitted camera (cx 1450, cy 700, cz -1.5). |
| 3 browser Back / Forward | pass | One history step per map change (6 back, 4 forward, in order). |
| 4 375 px | pass, with friction | Top bar is 137 px in 3 rows, offline icon alone on row 2: R-38. Pinch (CDP synthesized touch) entered Quessaly, then Oskmark. |
| 5 `sandbox` | pass | Only Quessaly on the ocean, no frame for `tallowford`, `brindlecross` or `mirefold`; Oskmark shows the baked fog. |
| 6 wrong-campaign and hidden-map links | pass | "Not found in this campaign" with Dismiss, URL rewritten to this campaign's `c` and the ocean camera, for the wrong `c`, a hidden map, an unknown map and an unknown entity. No `c` works as before. |
| 7 live v1 against R-33's baseline | pass, approximate | See "v1 difference". |

Other friction: the ocean fit crops Quessaly at the left and Skerrow Isles under the aside on
desktop (R-37); the "Tap to bring the world to life" toast covers the minimap and Wander on a phone,
in v1 too (R-39).

**Screenshots** (gitignored, in the worktree's `previews/r36/`):
- `previews/r36/02-main-ocean.png`
- `previews/r36/05-oskmark-fit.png`
- `previews/r36/09-mobile-ocean.png`
- `previews/r36/13-sandbox-oskmark.png`
- `previews/r36/14-wrong-campaign-notice.png`
- `previews/r36/15-ocean-zoomout-limit.png` (after the fix)

**Bug fixed here: the ocean zoom-out limit.** `AtlasCanvas` gave every view `minZoom -6`.
New `src/atlas/canvas/OceanZoomLimit.tsx` sets the ocean's floor to the fit zoom minus one level
(`oceanMinZoom`, never below -6) once the map has a size, and gives other views -6 back
(`FitMapOnOpen` still lowers it if a map wouldn't fit). Test: `src/test/canvas/ocean-zoom-limit.test.tsx`
(and the canvas tests still pass). Real browser, `main` at 1280x800: fit cz -1.5; eight wheel-out steps
stop at cz -2.5 (before: -5.7), Quessaly and Skerrow Isles still whole and apart. Servers stopped.
Provisional: one level below the fit; the floor is set on open, not on a window resize.

**Broken refs in the publish audit: no ticket.** The 8 `BROKEN REF (info)` lines (e.g. `mirefold.png`,
`skerrow-isles.png`, `hookhaven.png`) name images that exist: `content-next/quessaly/_atlas/images/`
and `content-next/skerrow/_atlas/images/` hold them, and the ocean and maps draw them. `audit-assets`
only looks in a v1-shaped assets folder, so it reports per-world images of the v2 test world (the
audit's own text says build-atlas is the authority; R-32 recorded these as known). `sandbox` ships only 2
images because it hides the other maps, as intended. R-34's and R-32's follow-ups already cover the
rest of the audit's v2 handling; if `audit-assets` should read v2 worlds, that is for phase 5/6.

**New tickets:** R-37 ocean fit margin, R-38 phone top bar, R-39 audio toast, R-40 fling `moveend`
(R-32 follow-up), R-41 dotted tag 404 (R-34 follow-up), R-42 scans-passed stamp (R-34 follow-up).

**v1 difference.** An unknown map (`?map=nope`) on v1 now opens the default map (overview); the baseline
showed a blank page. R-33's ticket asks for this and its review accepted it.

**Not checked:** a real-device pinch (only CDP-synthesized touch); the "Not found" notice at 375 px;
the exact baseline URLs for `atlas-cam` and `atlas-unknownmap` (not recorded, so the playtester used
`?cx=100&cy=100&cz=2` and `?map=nope`; those two shots are approximate); the v2 console (only v1's was
read); `npm run gate` (not run here).
