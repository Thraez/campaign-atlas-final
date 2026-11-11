# R-36 Phase 3 check: Ocean > continent > city > back

Status: ready-for-agent
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
  - The live v1 site (`npm run dev`, then `atlas-pages-preview`) looks as before.
- Bugs found are fixed here if small (one module, under about 50 lines); others become tickets
  in this folder.
- The notes and up to six screenshots are saved in the ticket's `## Check` section (screenshots in
  `previews/`, gitignored, paths only).
- `State.md` lists for Isak's look: the ocean, the zoom handoff feel, the breadcrumb, the phone top
  bar, and the provisional calls of R-30..R-35.
- `npm run gate` passes, and `atlas:publish:next` scans pass on both campaigns.

## Out of scope

Phase 4 (blocked on ADR-0005 and ADR-0006, which Isak accepts).
