# R-34 Serve the test world's campaign sites locally, with a picker

Status: ready-for-agent
Blocked by: R-30 (its `schemaVersion` guard fix, so a v2 site loads at all)
Size: S
Branch: `rebuild-r34-local-campaign-sites`
Model: Opus (`scripts/`)
Needs: the adversarial player-safety review: the picker lists every campaign, so it must never land
in a campaign's site

`atlas:publish:next` builds each test-world campaign into `dist-campaigns/<id>/`
(`scripts/atlas/publishPlan.ts`), but nothing serves them: `.claude/launch.json`'s
`atlas-pages-preview` serves `dist/` (v1). Phase 3's checks (R-33, R-36) need each campaign's real
site build. ux-flows p6 keeps a campaign picker (P6) for the test site and the preview only; hosted
players arrive by their own campaign's link (ADR-0007, phase H).

## Acceptance criteria

- `npm run atlas:serve:next` serves each built campaign site on its own local port, exactly as
  built (`dist-campaigns/<id>/`, base `/`; `publishPlan.ts` and the site builds unchanged, so what
  is checked is the artifact H-01 would deploy), and a picker page (P6: each campaign's name and a
  link to `http://localhost:<port>/`; a "Test site only" note) on one more port. It prints the
  ports.
- It refuses, naming `atlas:publish:next`, when `dist-campaigns/` is missing, a campaign listed in
  `atlas.next.config.json`'s content has no site dir, or the build is stale (any file under
  `content-next/` newer than `dist-campaigns/<id>/atlas/atlas.json`).
- It binds `127.0.0.1` only; serves only files under `dist-campaigns/<id>/` for each port, never
  `.atlas-campaigns/` or anything else; no directory listing; no path escapes the site dir; an
  unknown path falls back to that site's `index.html`.
- The picker page is generated in memory by the serve command and never written into any
  campaign's site dir or store. The isolation scan's site file list check
  (`check-campaign-isolation`, R-19) still passes on every site, and a test pins that no campaign
  site dir contains the picker or another campaign's name.
- v1's `dist/` build and `publish-atlas.yml` are unchanged.
- `.claude/launch.json` gains `atlas-campaigns-preview` running it (the picker's port as `port`), so
  the preview pane and the playtester can open it.
- `README.md` / `COMMANDS.md` list the command.
- `npm run gate` passes.

## Provisional calls (noted in State.md)

- One port per campaign, so the local site is the deployed artifact unchanged.
- The picker doesn't remember the choice in the browser (ux-flows p6.2): on a local test site it
  saves nothing worth the code.

## Touches

`scripts/atlas/` (a serve script and its test), `package.json`, `.claude/launch.json`, docs.

## Out of scope

Hosting (H-01..H-04), the editor's preview as a campaign (E11, phase 6).
