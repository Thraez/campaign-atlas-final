# R-35 Campaign links: links name their campaign

Status: ready-for-agent
Blocked by: R-33, R-34
Size: S
Branch: `rebuild-r35-campaign-links`
Model: Sonnet (settled plan)
Needs: the adversarial player-safety review: a wrong-campaign link must reveal nothing

ux-flows p5: every view has a URL with `c=<campaign>`; a deep link to something not in this
campaign opens the campaign's ocean with "not found in this campaign", never saying whether it
exists elsewhere. Each campaign site holds one campaign (`project.campaign`, ADR-0004), so `c` is a
check, not a switch.

## Acceptance criteria

- On v2 output, every URL the viewer writes (view sync, share links, `entityHref`) carries
  `c=<project.campaign.id>`; v1 output writes no `c`, so today's live links don't change.
- A URL whose `c` isn't this site's campaign opens this campaign's ocean, fitted, with one quiet
  notice ("Not found in this campaign"), and drops the other params (`map`, `entity`, camera). A
  `map` or `entity` that isn't in the output gets the same notice, whatever `c` says. The notice
  text is fixed: it never echoes the URL's `c`, `map` or `entity` value.
- A URL with no `c` works as before (the hosted site has one campaign).
- The campaign name shows as a chip in the top bar (P1 corner, P7 menu), not a picker: the site
  can't switch campaigns. On the local test server (R-34) the chip links back to `/`, the picker,
  only when the page is served from the local picker's path layout (a build-time flag the
  campaign site build sets for local serving only, or a check of `location`; pick one and say why).
  A hosted campaign site never links to a list of campaigns.
- Tests: `AtlasViewer.deepLinks.test.tsx` cases for a right, wrong and missing `c`, a hidden map id
  and a hidden entity id on the `sandbox` output (`tallowford`, a `main`-only note), each showing
  the same notice and the same page; a text check that the rendered page contains none of those
  ids.
- `npm run gate` passes.

## Touches

`src/atlas/deepLink.ts`, `src/pages/AtlasViewer.tsx`, the top bar, viewer tests.

## Out of scope

Renaming the other params to ux-flows' `note`, `x`, `y`, `z` (phase 5, deep links). Access per
campaign (phase H).
