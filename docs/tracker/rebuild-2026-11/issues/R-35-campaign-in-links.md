# R-35 Campaign links: links name their campaign

Status: in-review
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
  notice ("Not found in this campaign"), and drops the other params (`map`, `entity`, camera). On
  v2 output, a `map` or `entity` that isn't in the output gets the same notice, whatever `c` says;
  v1 keeps today's behaviour. The notice
  text is fixed: it never echoes the URL's `c`, `map` or `entity` value.
- A URL with no `c` works as before (the hosted site has one campaign).
- The campaign name shows as a chip in the top bar (P1 corner, P7 menu), not a picker: the site
  can't switch campaigns. The chip links to the local picker (R-34) only when
  `location.hostname` is `localhost` or `127.0.0.1`; no build flag, so nothing in the deployed
  build can turn it on. A hosted campaign site never links to a list of campaigns.
- Tests: `AtlasViewer.deepLinks.test.tsx` cases for a right, wrong and missing `c`, a hidden map id
  and a hidden entity id on the `sandbox` output (`tallowford`, a `main`-only note), each showing
  the same notice and the same page; a text check that the rendered page contains none of those
  ids.
- `npm run gate` passes.

## Touches

`src/atlas/deepLink.ts`, `src/pages/AtlasViewer.tsx`, the top bar, the other `entityHref` callers
(`AtlasBrowse`, `AtlasTimeline`, `AtlasCredits`, `CharacterSecretsPage`), viewer tests.

## Out of scope

Renaming the other params to ux-flows' `note`, `x`, `y`, `z` (phase 5, deep links). Access per
campaign (phase H).

## Build notes (2026-11-11)

- `src/atlas/deepLink.ts`: `DeepLinkState.campaign` (`c=`, written first; empty reads as none);
  `entityHref(id, campaignId?)`. `AtlasBrowse`, `AtlasTimeline`, `AtlasCredits`,
  `CharacterSecretsPage` pass `project.campaign?.id` (undefined on v1, so no `c`).
- `src/pages/AtlasViewer.tsx`: every URL the viewer writes (sync, push in `goView`/`openEntity`) carries
  `c` on v2 only. `applyUrl` (load and Back/Forward): on v2 a `c` other than this campaign's, or a `map`
  not in the tree, or an `entity` not in `project.entities`, replaces the whole link with an empty one
  (ocean, fitted), rewrites the URL to `?c=<this campaign>`, and shows one fixed notice ("Not found in
  this campaign", with Dismiss; it also clears on the next move). The notice never echoes the URL.
  `CampaignChip` in the top bar (v2; the title link shows only the compass, `aria-label="Home"`): a link to the picker
  only when `location.hostname` is `localhost` or `127.0.0.1`, else a plain label.
- Tests (in `AtlasViewer.v2.test.tsx`, which already builds the test world): right, wrong, missing `c`;
  nine variants on `sandbox` (other campaign, nonsense `c`, `tallowford`, a main-only entity, a never-existed
  map/entity, combined) must give identical URL, history growth, view, crumbs, frames, notice count and
  the whole `body.innerHTML`; text and URL contain none of the ids/titles; Back onto a wrong entry;
  chip link vs label by hostname. Also `deep-link.test.ts`.
- Real browser (`atlas:publish:next`, 44 scans clean; `atlas:serve:next`), both campaigns, 1280 and
  375 wide, `/atlas` and `/atlas?c=other&map=tallowford&entity=zzz`: chip shows the name and links to
  `http://127.0.0.1:4300/`; wrong link shows the notice and the fitted ocean, URL `?c=<id>&cx..`.
  Shots in `previews/r35/` (gitignored). Servers stopped.

**Provisional calls.**
- Tests live in `AtlasViewer.v2.test.tsx`, not `deepLinks.test.tsx`: they need the built v2 test world.
- Any v2 link problem (wrong `c`, unknown map, unknown entity) drops the whole link, including a valid
  other param.
- The picker link assumes the default picker port 4300 (the site can't know `--port`).
- Notice is a bar under the toolbar with Dismiss, not a toast.

**Review fixes.** v1 cases in `AtlasViewer.deepLinks.test.tsx` (`?c=other` with an unknown map, an unknown
entity, or a known map and entity: no notice, lands as before; the URL written after load has no `c`).
A v2 output with no `project.campaign` (DM or dev build) skips the `c` check (test added). A test that
opening an entity clears the notice.
**Mutation check (done):** removing the `!!tree.ocean &&` gate fails 5 tests (the 2 new v1 `c=` cases and 3 existing v1
load-and-Back cases); removing `setNotFound(false)` from `openEntity` fails exactly "opening an entity
clears the notice". Both restored, all 39 pass.
**Real browser, other pages:** Browse links are `/atlas?c=main&entity=...` and land on the entity (map,
panel, no notice). The test world has no dated entries, credits or secrets, so Timeline, Credits and
Secrets show no entity links there; their `entityHref` calls are covered by unit tests only.

**Not checked:** `npm run gate`.
