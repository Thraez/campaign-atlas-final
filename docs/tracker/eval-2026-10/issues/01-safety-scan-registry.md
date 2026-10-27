# One list of safety scans

Status: ready-for-agent
Area: publish safety

The scans are listed by hand in four places, and they drifted:

- `scripts/atlas/publish-orchestrator.ts:54-80` (CI) runs 12 scans, including `check-player-secrets`.
- `runPublishScans` in `scripts/atlas/publishScan.ts:110-181` (the editor's Publish check and
  publish-push) never runs `check-player-secrets`.
- The `scan` union in `src/atlas/publish/publishTypes.ts` has no player-secrets entry.
- `scripts/atlas/publish-integrity-smoke.ts` plants a fault for 5 scans; none for player-secrets
  or the asset audit.
- `publish-atlas.yml` says the editor runs "the same orchestrator" as CI. It doesn't.

Goal (`docs/GOALS.md`): every safety scan passes before a publish.

## Acceptance criteria

- One registry module lists each scan and the folders it runs over (`dist`, `public/atlas`).
  The orchestrator, `runPublishScans` and the integrity smoke all read it.
- The editor's Publish check runs every scan CI runs, with the same options.
- A test fails if a registered scan has no integrity-smoke variant, or a variant is marked
  as not applicable with a reason.
- A test of the orchestrator: every registered scan runs on each of its folders, and one
  failing scan gives a non-zero exit.
- The comment in `publish-atlas.yml` is true.
