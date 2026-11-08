# R-19 Publish runs every campaign

Status: ready-for-agent
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
