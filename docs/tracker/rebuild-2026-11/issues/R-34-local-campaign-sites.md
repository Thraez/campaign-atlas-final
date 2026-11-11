# R-34 Serve the test world's campaign sites locally, with a picker

Status: in-review
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

## Build notes

- `scripts/atlas/serveCampaigns.ts` (logic) and `scripts/atlas/serve-next.ts` (CLI);
  `npm run atlas:serve:next [-- --port <n>]`. Campaigns and their dirs come from the scan
  registry's `campaignArtifacts` (the dirs the publish builds), names from the loaded model.
- Ports: picker 4300, `main` 4301, `sandbox` 4302 (content order). The picker's links and the
  printed URLs use `http://127.0.0.1:<port>/` (review call: the server binds IPv4 only), not the
  ticket's `localhost`. `atlas-campaigns-preview` in
  `.claude/launch.json` runs it with `port` 4300.
- Paths: only GET/HEAD; 400 for a backslash, NUL, bad encoding, a non-origin-form target or a
  `.`/`..` segment raw or decoded (including double-encoded `%252e%252e`); 403 for a file whose
  real path is outside the site (links); directories and unknown paths get the site's
  `index.html` (no listing). Every port refuses a `Host` other than `localhost:<port>` or
  `127.0.0.1:<port>`. The picker port serves only `/` from memory, with a `default-src 'none'` CSP.
  A missing name with an extension (`/assets/x.js`) is a 404, not the SPA index (review), so a
  missing asset shows.
- Refusals (`ServeRefusal`, exit 2, naming `npm run atlas:publish:next`): no `dist-campaigns/`, a
  listed campaign without a site dir or `atlas/atlas.json`, a site dir or `dist-campaigns/` that is
  a link (lstat), and anything newer than a site's `atlas/atlas.json`: a file or a directory under
  the content root (the root included, so a deleted or renamed note counts) or the config file
  (review must-fix). Before listening it also runs `siteLeaks` on every site (the
  picker's marker and note, other campaigns' reportable names, raw and decoded) and refuses on a hit.
- Tests: `scripts/atlas/serveCampaigns.test.ts` (46): refusals, path resolution (traversal raw,
  encoded, double-encoded, backslashes, NUL, links out), raw-socket requests against running
  servers (fallback, no listing, `.atlas-campaigns/` unreachable, host and method checks, not
  reachable on `::1`), the picker page, and that serving leaves every site dir byte-identical and
  free of the picker and the other campaign's name.
- Checked for real: `atlas:publish:next` (44 scans clean), then the server: picker, `main` and
  `sandbox` load in the preview pane past the schema guard (the old viewer draws the map; the
  ocean is R-33). The preview pane's browser fails to register the service worker (`sw.js` is
  served 200 as JavaScript; the pane's own limit). `preview_start` reads the main checkout's
  `launch.json`, so until this merges the entry is reachable only from the worktree.
- Follow-up (not built; `publishPlan.ts` stays unchanged here): the stale check proves the sites
  are newer than the content, not that the scans passed on them. A "scans passed" stamp written
  by the publish, which the server would require, would close that gap.
