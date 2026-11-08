# R-11c Old Publish Check calls the resolver

Status: ready-for-agent
Blocked by: R-11a, R-12
Size: S
Branch: `rebuild-r11c-publish-check-resolver`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

The old editor's Publish Check tab (`src/atlas/tabs/PublishCheckTab.tsx`) gets its leak verdicts
from `validateProject` (`src/atlas/yaml/validateProject.ts:628`), which re-derives what ships
(`shippedVisibility`, `linkLeaksToPlayers` at ~266, ~322, ~415, ~475). eval-50 (#106) made it agree
with the build by hand. Make it ask the resolver (R-11a) for campaign `main`, so it gives the build's
verdict by construction. The old editor lives until cutover, so this matters for months.

## Acceptance criteria

- `validateProject` takes "does it ship" for entities, regions, routes and sound areas from the
  resolver, fed through R-12's v1 adapter (`src/atlas/content/v1Model.ts`, importable from
  `src/`); it keeps its own
  presentation (categories, messages, locators).
- A parity test, table-driven over fixtures: missing visibility, invalid visibility, a region
  linking a `dm` note, a route waypoint on a `dm` note, a note with `atlas.publish: false`, a
  player note linking a folder-excluded note, a sound-only area in fog. For each, the Publish Check
  reports a blocking leak exactly when `npm run atlas:build:player` (strict) fails, and names the
  same item. Extend `src/test/publish-check-link-leaks.test.ts` or add a sibling.
- The existing tests `src/test/atlas-publish-check.test.ts`, `src/test/publish-check-tab.test.tsx`
  and `src/test/publish-check-link-leaks.test.ts` pass (update expectations only where the old
  verdict was wrong, and say which in the PR).
- `npm run gate` passes.

## Touches

- `src/atlas/yaml/validateProject.ts`, maybe `src/atlas/yaml/validationScopes.ts`, tests above.

## Out of scope

- The server-side Publish Check (`scripts/atlas/runPublishCheck.ts`): it runs the real build and
  scans, so it follows R-11b and the registry already.
- Per-campaign Publish Check, the "newly visible" list for a new campaign: the new editor (E12,
  E13, phase 6).
- UI changes to the Publish Check tab.
