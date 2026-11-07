# One spoiler-leak rule for regions and routes

Status: in-review
Area: player safety, editor (Publish Check, region and route drafts)

Found by the architecture review of 2026-11-07. Four places judge whether a player-visible region
or route leaks the entity it names, and they disagree:

- The build (`scripts/build-atlas.ts`, region and route leak loops) blocks any region or route that
  ships (`player` or `rumor`) when its entity is `dm`, `hidden` or unknown; the strict player build
  then fails.
- Publish Check (`src/atlas/yaml/validateProject.ts`) and the region and route drafts
  (`useRegionDraft.ts`, `useRouteDraft.ts`) only check `visibility === "player"` against `dm` or
  `hidden` entities.

So a `rumor` region linked to a DM entity, or a player route through an unknown entity, passes
Publish Check and then fails the publish. With Tidemarrow, `03_Entities` notes arrive as `dm`, so
this will be common.

## Acceptance criteria

- One predicate in `src/atlas/content/visibility.ts` says whether a link from a player-visible item
  to an entity leaks it; the build, Publish Check and both drafts call it.
- Tests: the predicate over item visibility × target visibility (player, rumor, dm, hidden,
  unknown); Publish Check blocks a `rumor` region linked to a DM entity and a player route through
  an unknown entity; the region and route drafts flag the `rumor` case.

## Comments

2026-11-07 (improvement loop): `linkLeaksToPlayers` and `linkTargetLabel` in `visibility.ts`; the
build (re-exported through `scripts/atlas/visibility.ts`), `validateProject` region and route rules
and both draft hooks call them. The hooks now take `entityVisibility` (id → visibility) instead of
`dmEntityIds`. A player-visible route through an unknown entity now also gets the blocking leak, not
only the unresolved-waypoint warning. Same drift in the credits page: it filtered `!== "dm"`, so a
`hidden` entity's credit showed; it now uses `isPlayerVisible`. Tests:
`src/test/content/world-yaml-leak-rule.test.ts`, `atlas-credits-page.test.tsx`.
