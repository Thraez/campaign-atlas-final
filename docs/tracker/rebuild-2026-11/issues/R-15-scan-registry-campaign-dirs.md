# R-15 Scan registry lists campaign dirs

Status: ready-for-agent
Blocked by: R-03 (done), R-12
Size: S
Branch: `rebuild-r15-scan-campaign-dirs`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

The one scan registry (`scripts/atlas/scanRegistry.ts`, 9 scans) runs each per-artifact scan on
two hard-coded dirs: `artifactDirs` (~108-113) returns `dist` and `public/atlas`. Teach it the
campaign list from R-12's model before any campaign output exists, so that when R-17 adds outputs,
every scan already covers them and a missing campaign output fails the publish (R-03's rule).

## Acceptance criteria

- `artifactDirs` (or its replacement) reads the campaigns from the loaded model via the config the
  scan context already carries (`ScanContext`: `root`, `configPath`, `contentDir`), inside the one
  registry; no second list anywhere.
- v1 content (`content/` today): exactly today's two dirs, labelled as campaign `main`; the
  gate's scan run (`atlas:publish`) reports the same tasks and passes as before. A test pins the
  task list for v1.
- v2 content: for each campaign, its store and built-site dirs as ADR-0004 settles (recommended
  `.atlas-campaigns/<id>/atlas/` and `dist-campaigns/<id>/`), labelled with the campaign id in each
  task label (`check-fog-safety dist-campaigns/a`). Each task's `requires` lists that campaign's
  player `atlas.json`, so a campaign whose output is missing or empty fails with exit 20 and the
  path named.
- Table-driven test (extend `scripts/atlas/scanRegistry.test.ts`) on a v2 fixture with two
  campaigns: every per-artifact scan has one task per campaign per layout; removing either
  campaign's `atlas.json` fails every task for that campaign and none for the other.
- The scans that are content-wide, not per artifact (`check-vault-content`, `audit-assets`'s
  content check) still run once.
- The editor's Publish check (`runPublishScans`, `scripts/atlas/publishScan.ts`) reads the same
  list and still works on v1.
- Docs: the scan count and dirs in `docs/agents/workflow.md` ("Done") and
  `docs/VISIBILITY_AND_PLAYER_SAFETY.md` if they change.
- `npm run gate` passes.

## Built

- `audit-assets` runs once per campaign store (`.atlas-campaigns/<id>/atlas/assets`), not once
  for the content: v2 map images live outside `public/` (ADR-0003), so there is no shared assets
  dir, and the size budget is what each campaign's site ships. Its content check (references in
  `content/`) is the same input for each. `check-vault-content` is the one content-wide scan and
  runs once.
- A v2 run also scans `dist` and `public/atlas` (campaign `(legacy)`), which the build still
  writes and the deploy ships; R-19 drops them.

## Touches

- `scripts/atlas/scanRegistry.ts` (+ test), `scripts/atlas/publish-orchestrator.ts` (passes the
  context), `scripts/atlas/publishScan.ts`, docs.

## Out of scope

- Producing campaign outputs (R-17). Per-campaign must-not-ship input to the scans (R-17), fog scan
  source per campaign (R-18).
- Running v2 publish end to end (R-19).
