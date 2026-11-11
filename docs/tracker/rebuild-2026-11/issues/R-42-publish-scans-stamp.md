# R-42 Publish writes a scans-passed stamp the server requires

Status: ready-for-agent
Blocked by: -
Size: S
Branch: `rebuild-r42-scans-stamp`
Model: Sonnet (settled plan)

Found by the R-36 Phase 3 playtest (2026-11-11, `previews/r36/notes.md`, gitignored).

Follow-up from R-34's build notes. `atlas:serve:next` refuses sites older than the content, but that
proves the sites are newer than the content, not that the scans passed on them.

## Acceptance criteria

- `atlas:publish` (and `:next`) writes a stamp per campaign site only after every scan on it passed
  (the stamp names the scans' result and the `atlas.json` it covers); a failed or partial publish
  leaves no stamp, and removes an old one.
- `atlas:serve:next` refuses a site without a valid stamp for its current `atlas.json`.
- The stamp is not part of the shipped site (outside the site dir, or excluded; the scans must not
  count it as a leak).
- Tests for each refusal and for a clean publish. Related: R-19's "For H-01" note (a deploy must
  depend on publish's exit code).

## Touches

`scripts/atlas/publishPlan.ts` and the publish orchestrator, `scripts/atlas/serveCampaigns.ts`, tests.
