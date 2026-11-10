# R-19 Publish runs every campaign

Status: done
Blocked by: R-17, R-17b
Size: S
Branch: `rebuild-r19-publish-campaigns`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done"): it changes the publish chain

`npm run atlas:publish` is `atlas:snapshot && atlas:build:player && build && atlas:scan`
(`package.json`): one player build, one Vite site build, the registry's scans
(`scripts/atlas/publish-orchestrator.ts`). Make the chain cover every campaign: a player store and a
site build per campaign, then every scan per campaign. The integrity smoke
(`scripts/atlas/publish-integrity-smoke.ts`) must prove the scans still reject faults on a second
campaign. Phase H's Cloudflare projects (one per campaign, H-01) deploy these site builds.

## Acceptance criteria

- A publish command takes a config (`atlas.config.json` by default; `atlas.next.config.json` for
  the test world) and, for each campaign of the loaded model: builds the player store (R-17), runs
  the Vite player build with that campaign's store as its atlas dir into its site dir (ADR-0004,
  recommended `dist-campaigns/<id>/`), and the Vite build copies nothing from another campaign's
  store or from `public/atlas/` (test: a site dir holds no file that isn't in its own store or the
  app's static files).
- Then the orchestrator runs the registry over every campaign (R-15) and fails if any task fails,
  including R-17b's isolation scan on each store and on each built site's atlas dir (its file list
  must equal its store's).
- v1 (`content/`): the chain behaves exactly as today (one campaign `main`, `public/atlas/` and
  `dist/`), so `publish-atlas.yml` and `npm run gate` need no change; the gate's step list is
  unchanged.
- The integrity smoke runs its clean/dirty pairs on each campaign's output for the test world (a
  flag or config switch), and each variant passes on the second campaign too.
- Publishing `content-next/` is local only: no workflow runs it, and the deploy job's upload path
  stays `dist/` (check `publish-atlas.yml`).
- `README.md` / `COMMANDS.md` document the command for the test world.
- R-15 scans `dist` and `public/atlas` in a v2 run too (campaign `(legacy)` in
  `scanRegistry.ts`'s `campaignArtifacts`), because the build still writes them and
  `publish-atlas.yml` deploys `dist`. Drop that pair from the v2 set only once publish and deploy
  stop producing them, with the test that pins it updated in the same change.
- `npm run gate` passes.

## Touches

- `package.json` scripts, `scripts/atlas/publish-orchestrator.ts`, `vite.config.ts` (a per-campaign
  atlas dir or `publicDir`; keep `__INCLUDE_EDITOR__` false and the prune plugins on for player
  builds), `scripts/vite-plugin-prune-player-files.ts` and `scripts/vite-plugin-prune-player-audio.ts`
  (per-campaign store), `scripts/atlas/publish-integrity-smoke.ts`, `scripts/atlas/snapshot-baseline.ts`
  (baseline per campaign, if needed), docs.

## Out of scope

- Hosting and deploy (H-01..H-04). The editor's Publish job per campaign (E12, phase 6).
- The every-campaign diff of the migration (R-20).

## Build notes (2026-11-10)

- `atlas:publish` is `scripts/atlas/publish.ts [--config <file>]`, running `publishPlan`
  (`scripts/atlas/publishPlan.ts`). v1: snapshot, player build, `vite build`, scans (output
  compared before/after: identical but for `version`/`publishedAt`). v2: clean `dist-campaigns/`,
  player build (every store), `vite build` (dist, the legacy pair), then per campaign a staged
  public dir (app static files + that store as `atlas/`, in a temp dir) and `vite build --mode
production --outDir dist-campaigns/<id>` with `ATLAS_CAMPAIGN_PUBLIC_DIR` (vite.config's
  `publicDir`, refused in an editor build), then `atlas:scan --config`. `atlas:publish:next` is
  the test-world shortcut. On `content-next/`: 44 scans clean.
- `check-derived-secrets` skips the content root's own `README.md` when it is excluded and has no
  frontmatter (the folder's readme, not a note; "README" is in every site bundle). A hidden note
  titled "Readme" still counts.
- Integrity smoke `-- --config atlas.next.config.json`: 10 pairs per campaign on copies of the real
  store and site.
- Open: check-fog-safety warns on the `(legacy)` pair in a v2 run (no campaign; R-18's area).

### Review fixes (2026-11-10)

- A campaign site names its own campaign, not the v1 world: `scripts/atlas/campaignSiteBranding.ts`
  reads `campaign.name` from the staged store; `vite.config.ts` rewrites `index.html`'s title,
  description, apple, og and twitter tags (dropping the v1 share image) and the PWA manifest's
  name, short_name and description. v1 builds are unchanged. `check-campaign-isolation`'s site
  pass fails (23) any of those that isn't what the build writes for this campaign
  (`siteIdentityFindings`); the smoke plants another campaign's name in a site title.
- The printed handout names the loaded atlas (its campaign, else its world), sanitizes `bodyHtml`
  with `sanitizeAtlasHtml` before `document.write`, and opens its window without `noopener`
  (with it, `window.open` returns null by spec, so the handout always said pop-ups were blocked);
  it sets `opener = null` instead.
- Staging copies `public/` by an allowlist (`CAMPAIGN_SITE_STATIC_FILES`): an unknown file fails
  the publish, a missing one too; `.DS_Store` is never copied.

### For H-01 (deploy; its ticket isn't written yet)

- `atlas:publish` builds and scans one campaign at a time. A failure part way leaves the earlier
  `dist-campaigns/<id>` dirs built and later ones missing or unscanned, and the scans run only
  after every site build. Deploy must run only when `atlas:publish` exits 0, never on the mere
  presence of a `dist-campaigns/<id>` dir.
